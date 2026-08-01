import type {
	BenchmarkMetricName,
	BenchmarkMetricSummary,
	BenchmarkRunMetrics,
} from '~benchmark/report-contracts';

type RobustOutlierOptions = {
	/**
	 * Multiplier applied after normalizing the median absolute deviation.
	 */
	madMultiplier: number;

	/**
	 * Factor that makes MAD comparable to standard deviation for normal data.
	 */
	madConsistencyFactor: number;

	/**
	 * Smallest absolute distance that can be considered an outlier.
	 */
	minimumAbsoluteDeviation: number;

	/**
	 * Smallest relative distance that can be considered an outlier.
	 */
	minimumRelativeDeviation: number;
};

type AdaptiveMeasurementSelection = {
	/**
	 * Index of the only outlier in the base sample.
	 */
	outlierIndex: number | null;

	/**
	 * Additional measurement indexes accepted as calmer replacements.
	 */
	calmAdaptiveIndices: number[];

	/**
	 * Combined base-then-adaptive indexes used for aggregation.
	 */
	usedIndices: number[];
};

const benchmarkMetricNames = [
	'firstContentfulPaint',
	'largestContentfulPaint',
	'timeToInteractive',
	'totalBlockingTime',
	'lighthouseTotalBlockingTime',
	'speedIndex',
	'loadEvent',
	'observedLoadEvent',
	'parseHtml',
	'styleAndLayout',
	'paintCompositeAndRender',
	'totalMainThreadTime',
	'scriptEvaluation',
	'domNodes',
	'requests',
	'transferSize',
	'documentSize',
	'javascriptTransferSize',
	'performanceScore',
	'maxPotentialFid',
] as const satisfies BenchmarkMetricName[];

/**
 * Calculates a linearly interpolated percentile.
 *
 * @param   values       Numeric sample.
 * @param   percentile   Percentile between zero and one.
 *
 * @returns              Interpolated sample value.
 */
const calculatePercentile = (values: number[], percentile: number): number => {
	const sortedValues = values.toSorted((first, second) => first - second);
	const position = (sortedValues.length - 1) * percentile;
	const lowerIndex = Math.floor(position);
	const upperIndex = Math.ceil(position);
	const lowerValue = sortedValues[lowerIndex]!;
	const upperValue = sortedValues[upperIndex]!;

	return lowerValue + (upperValue - lowerValue) * (position - lowerIndex);
};

/**
 * Aggregates one numeric sample into the published distribution.
 *
 * @param   values   Numeric sample.
 *
 * @returns          Median, quartiles and extrema.
 */
const summarizeValues = (values: number[]): BenchmarkMetricSummary => {
	return {
		sampleCount: values.length,
		median: calculatePercentile(values, 0.5),
		p25: calculatePercentile(values, 0.25),
		p75: calculatePercentile(values, 0.75),
		min: Math.min(...values),
		max: Math.max(...values),
	};
};

/**
 * Calculates the median absolute distance from the sample median.
 *
 * @param   values   Numeric sample.
 *
 * @returns          Median absolute deviation.
 */
const calculateMedianAbsoluteDeviation = (values: number[]): number => {
	const median = calculatePercentile(values, 0.5);
	return calculatePercentile(values.map((value) => Math.abs(value - median)), 0.5);
};

const isRobustOutlier = (
	value: number,
	median: number,
	medianAbsoluteDeviation: number,
	options: RobustOutlierOptions,
): boolean => {
	const absoluteDeviation = Math.abs(value - median);
	const relativeDeviation = median === 0
		? (value === 0 ? 0 : Infinity)
		: absoluteDeviation / Math.abs(median);
	const robustDeviationThreshold = options.madMultiplier
		* options.madConsistencyFactor
		* medianAbsoluteDeviation;

	return absoluteDeviation > robustDeviationThreshold
		&& absoluteDeviation > options.minimumAbsoluteDeviation
		&& relativeDeviation > options.minimumRelativeDeviation;
};

/**
 * Finds an outlier only when exactly one base measurement passes every robust threshold.
 *
 * @param   values    Base numeric sample.
 * @param   options   Robust and practical deviation thresholds.
 *
 * @returns           Zero-based outlier index, or null for zero or multiple outliers.
 */
const findSingleRobustOutlierIndex = (
	values: number[],
	options: RobustOutlierOptions,
): number | null => {
	const median = calculatePercentile(values, 0.5);
	const medianAbsoluteDeviation = calculateMedianAbsoluteDeviation(values);
	const indexes = values.flatMap((value, index) => {
		return isRobustOutlier(value, median, medianAbsoluteDeviation, options)
			? [index]
			: [];
	});

	return indexes.length === 1 ? indexes[0]! : null;
};

/**
 * Replaces one base outlier only with additional values that pass the original robust thresholds.
 *
 * Raw measurements remain available even when their indexes are omitted from aggregation.
 *
 * @param   baseValues       Five mandatory measurements.
 * @param   adaptiveValues   Optional follow-up measurements.
 * @param   options          Robust and practical deviation thresholds.
 *
 * @returns                  Indexes selected from the combined base-then-adaptive sample.
 */
const selectAdaptiveMeasurementIndices = (
	baseValues: number[],
	adaptiveValues: number[],
	options: RobustOutlierOptions,
): AdaptiveMeasurementSelection => {
	const baseIndices = baseValues.map((_, index) => index);
	const outlierIndex = findSingleRobustOutlierIndex(baseValues, options);

	if (outlierIndex === null) {
		return {
			outlierIndex,
			calmAdaptiveIndices: [],
			usedIndices: baseIndices,
		};
	}

	const median = calculatePercentile(baseValues, 0.5);
	const medianAbsoluteDeviation = calculateMedianAbsoluteDeviation(baseValues);
	const calmAdaptiveIndices = adaptiveValues.flatMap((value, index) => {
		return isRobustOutlier(value, median, medianAbsoluteDeviation, options)
			? []
			: [baseValues.length + index];
	});

	if (calmAdaptiveIndices.length === 0) {
		return {
			outlierIndex,
			calmAdaptiveIndices,
			usedIndices: baseIndices,
		};
	}

	return {
		outlierIndex,
		calmAdaptiveIndices,
		usedIndices: [
			...baseIndices.filter((index) => index !== outlierIndex),
			...calmAdaptiveIndices,
		],
	};
};

/**
 * Calculates a signed deviation from a non-zero median.
 *
 * @param   value    Measured value.
 * @param   median   Median of the measured sample.
 *
 * @returns          Relative deviation, or null when it is unavailable or undefined from zero.
 */
const calculateRelativeDeviation = (
	value: number | null,
	median: number | undefined,
): number | null => {
	if (value === null || median === undefined) return null;
	if (median === 0) return value === 0 ? 0 : null;
	return (value - median) / median;
};

/**
 * Checks whether a value exceeds the stability threshold around its median.
 *
 * A non-zero value always differs from a zero median because a relative ratio is undefined there.
 *
 * @param   value                  Measured value.
 * @param   median                 Median of the measured sample.
 * @param   maxRelativeDeviation   Accepted relative deviation from a non-zero median.
 *
 * @returns                        Whether the measurement is outside the accepted range.
 */
const isMetricDeviationUnstable = (
	value: number | null,
	median: number | undefined,
	maxRelativeDeviation: number,
): boolean => {
	if (value === null || median === undefined) return false;
	if (median === 0) return value !== 0;
	return Math.abs((value - median) / median) > maxRelativeDeviation;
};

/**
 * Aggregates every benchmark metric across measured runs.
 *
 * @param   runs   Metrics extracted from measured runs.
 *
 * @returns        Distribution for every known metric.
 */
const aggregateMetrics = (
	runs: Array<Partial<BenchmarkRunMetrics>>,
): Record<BenchmarkMetricName, BenchmarkMetricSummary | null> => {
	return Object.fromEntries(benchmarkMetricNames.map((metricName) => {
		const values = runs
			.map((run) => run[metricName])
			.filter((value): value is number => value !== null && Number.isFinite(value));

		return [metricName, values.length === 0 ? null : summarizeValues(values)];
	})) as Record<BenchmarkMetricName, BenchmarkMetricSummary | null>;
};

/**
 * Chooses the run nearest to the medians across all available metrics.
 *
 * @param   runs      Metrics extracted from measured runs.
 * @param   summary   Aggregated distributions for those runs.
 *
 * @returns           Zero-based index of the representative run.
 *
 * @throws            When the sample contains no runs.
 */
const findRepresentativeRunIndex = (
	runs: Array<Partial<BenchmarkRunMetrics>>,
	summary: Record<BenchmarkMetricName, BenchmarkMetricSummary | null>,
): number => {
	if (runs.length === 0) {
		throw new Error('Cannot select a representative run from an empty sample.');
	}

	const distances = runs.map((run) => {
		const components = benchmarkMetricNames.flatMap((metricName) => {
			const value = run[metricName];
			const median = summary[metricName]?.median;

			if (value === null || value === undefined || median === undefined) return [];

			const scale = Math.abs(median) || 1;
			return [((value - median) / scale) ** 2];
		});

		return components.reduce((sum, value) => sum + value, 0) / Math.max(components.length, 1);
	});

	return distances.reduce((closestIndex, distance, index) => {
		return distance < distances[closestIndex]! ? index : closestIndex;
	}, 0);
};

export {
	aggregateMetrics,
	benchmarkMetricNames,
	calculateMedianAbsoluteDeviation,
	calculatePercentile,
	calculateRelativeDeviation,
	findRepresentativeRunIndex,
	findSingleRobustOutlierIndex,
	isMetricDeviationUnstable,
	selectAdaptiveMeasurementIndices,
	summarizeValues,
};
export type {
	AdaptiveMeasurementSelection,
	RobustOutlierOptions,
};
