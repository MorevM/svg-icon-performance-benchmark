import { getBenchmarkMetricProbe } from './probes';
import type {
	BenchmarkMetricName,
	BenchmarkMetricSummary,
	BenchmarkScenarioSummary,
} from './report-contracts';

type MetricDirection = 'lower' | 'higher';
type MetricUnit = 'bytes' | 'count' | 'milliseconds' | 'score';

type BenchmarkMetricColumn = {
	name: BenchmarkMetricName;
	label: string;
	title: string;
	direction: MetricDirection;
	unit: MetricUnit;
};

type OverallDomainId =
	| 'visualLoading'
	| 'responsiveness'
	| 'completion'
	| 'cpuRendering'
	| 'footprint';

/**
 * A metric group with an explicit contribution to the Overall factor.
 */
type OverallDomain = {
	/**
	 * Stable identifier used in presentation breakdowns.
	 */
	id: OverallDomainId;

	/**
	 * Human-readable name shown in the UI.
	 */
	label: string;

	/**
	 * Metrics averaged equally inside the domain.
	 */
	metrics: readonly BenchmarkMetricName[];

	/**
	 * Relative weight used when combining domains.
	 */
	weight: number;
};

type ScenarioPresentation = BenchmarkScenarioSummary & {
	factors: Partial<Record<BenchmarkMetricName, number>>;
	domainFactors: Record<OverallDomainId, number>;
	overallFactor: number;
};

const OVERALL_EQUIVALENCE_FACTOR = 1.05;
const OVERALL_MAXIMUM_FACTOR = 4;
const COMPLETION_OVERALL_WEIGHT = 0.05;
const OTHER_OVERALL_DOMAIN_WEIGHT = (1 - COMPLETION_OVERALL_WEIGHT) / 4;
const MAX_INSIGNIFICANT_TIME_DEVIATION_MS = 30;

const mainMetricColumns: BenchmarkMetricColumn[] = [
	{
		name: 'performanceScore',
		label: 'Score',
		title: 'Lighthouse Performance Score',
		direction: 'higher',
		unit: 'score',
	},
	{
		name: 'firstContentfulPaint',
		label: 'FCP',
		title: 'First Contentful Paint',
		direction: 'lower',
		unit: 'milliseconds',
	},
	{
		name: 'largestContentfulPaint',
		label: 'LCP',
		title: 'Largest Contentful Paint',
		direction: 'lower',
		unit: 'milliseconds',
	},
	{
		name: 'timeToInteractive',
		label: 'TTI',
		title: 'Time to Interactive',
		direction: 'lower',
		unit: 'milliseconds',
	},
	{
		name: 'totalBlockingTime',
		label: 'TBT',
		title: 'Controlled render Total Blocking Time',
		direction: 'lower',
		unit: 'milliseconds',
	},
	{
		name: 'speedIndex',
		label: 'SI',
		title: 'Speed Index',
		direction: 'lower',
		unit: 'milliseconds',
	},
	{
		name: 'loadEvent',
		label: 'Load',
		title: 'Throttled cold load event',
		direction: 'lower',
		unit: 'milliseconds',
	},
	{
		name: 'parseHtml',
		label: 'Parse',
		title: 'HTML parsing',
		direction: 'lower',
		unit: 'milliseconds',
	},
	{
		name: 'styleAndLayout',
		label: 'Layout',
		title: 'Style and layout',
		direction: 'lower',
		unit: 'milliseconds',
	},
	{
		name: 'paintCompositeAndRender',
		label: 'Render',
		title: 'Paint, composite and render',
		direction: 'lower',
		unit: 'milliseconds',
	},
	{
		name: 'domNodes',
		label: 'DOM',
		title: 'DOM nodes',
		direction: 'lower',
		unit: 'count',
	},
	{
		name: 'requests',
		label: 'Requests',
		title: 'Method-specific network requests',
		direction: 'lower',
		unit: 'count',
	},
	{
		name: 'transferSize',
		label: 'Transfer',
		title: 'Transferred bytes',
		direction: 'lower',
		unit: 'bytes',
	},
	{
		name: 'documentSize',
		label: 'Document',
		title: 'Uncompressed document bytes',
		direction: 'lower',
		unit: 'bytes',
	},
];

const bonusMetricColumns: BenchmarkMetricColumn[] = [
	...mainMetricColumns.slice(0, 7),
	{
		name: 'totalMainThreadTime',
		label: 'Main thread',
		title: 'Total main-thread time',
		direction: 'lower',
		unit: 'milliseconds',
	},
	{
		name: 'scriptEvaluation',
		label: 'Script eval',
		title: 'Script evaluation',
		direction: 'lower',
		unit: 'milliseconds',
	},
	{
		name: 'javascriptTransferSize',
		label: 'JavaScript',
		title: 'JavaScript transferred bytes',
		direction: 'lower',
		unit: 'bytes',
	},
	...mainMetricColumns.slice(10),
];

const mainOverallDomains: OverallDomain[] = [
	{
		id: 'visualLoading',
		label: 'Visual loading',
		metrics: ['firstContentfulPaint', 'largestContentfulPaint'],
		weight: OTHER_OVERALL_DOMAIN_WEIGHT,
	},
	{
		id: 'responsiveness',
		label: 'Responsiveness',
		metrics: ['totalBlockingTime'],
		weight: OTHER_OVERALL_DOMAIN_WEIGHT,
	},
	{
		id: 'completion',
		label: 'Completion',
		metrics: ['loadEvent'],
		weight: COMPLETION_OVERALL_WEIGHT,
	},
	{
		id: 'cpuRendering',
		label: 'CPU rendering',
		metrics: ['parseHtml', 'styleAndLayout', 'paintCompositeAndRender'],
		weight: OTHER_OVERALL_DOMAIN_WEIGHT,
	},
	{
		id: 'footprint',
		label: 'Footprint',
		metrics: ['domNodes', 'requests', 'transferSize', 'documentSize'],
		weight: OTHER_OVERALL_DOMAIN_WEIGHT,
	},
];

const bonusOverallDomains: OverallDomain[] = [
	...mainOverallDomains.slice(0, 3),
	{
		id: 'cpuRendering',
		label: 'CPU rendering',
		metrics: ['totalMainThreadTime', 'scriptEvaluation'],
		weight: OTHER_OVERALL_DOMAIN_WEIGHT,
	},
	{
		id: 'footprint',
		label: 'Footprint',
		metrics: [
			'domNodes',
			'requests',
			'transferSize',
			'documentSize',
			'javascriptTransferSize',
		],
		weight: OTHER_OVERALL_DOMAIN_WEIGHT,
	},
];

const getMetricFactor = (
	value: number,
	peerValues: number[],
	direction: MetricDirection,
): number => {
	if (direction === 'higher') {
		const bestValue = Math.max(...peerValues);

		if (bestValue <= 0) return 1;
		if (value <= 0) return 4;
		return Math.max(bestValue / value, 1);
	}

	const bestValue = Math.min(...peerValues);

	if (bestValue > 0) return Math.max(value / bestValue, 1);
	if (value === 0) return 1;

	const smallestPositiveValue = Math.min(...peerValues.filter((peerValue) => peerValue > 0));
	return 1 + value / smallestPositiveValue;
};

const getGeometricMean = (values: number[]): number => {
	if (values.length === 0) return 1;

	return Math.exp(
		values.reduce((total, value) => total + Math.log(value), 0) / values.length,
	);
};

const getWeightedGeometricMean = (values: number[], weights: number[]): number => {
	if (values.length !== weights.length) {
		throw new RangeError('Values and weights must contain the same number of items.');
	}

	const totalWeight = weights.reduce((total, weight) => total + weight, 0);

	if (values.length === 0 || totalWeight <= 0) return 1;

	return Math.exp(
		values.reduce((total, value, index) => {
			return total + Math.log(value) * weights[index]!;
		}, 0) / totalWeight,
	);
};

const getOverallMetricFactor = (
	metricName: BenchmarkMetricName,
	value: number,
	peerValues: number[],
	direction: MetricDirection,
): number => {
	const factor = metricName === 'requests' && direction === 'lower'
		? (value + 1) / (Math.min(...peerValues) + 1)
		: getMetricFactor(value, peerValues, direction);

	if (factor <= OVERALL_EQUIVALENCE_FACTOR) return 1;
	return Math.min(factor, OVERALL_MAXIMUM_FACTOR);
};

const getComparisonColor = (factor: number): string => {
	const green = [99, 191, 124];
	const yellow = [255, 236, 132];
	const red = [249, 105, 108];
	const start = factor < 2 ? green : yellow;
	const end = factor < 2 ? yellow : red;
	const progress = factor < 2
		? Math.max(factor - 1, 0)
		: Math.min((factor - 2) / 2, 1);
	const color = start.map((channel, index) => {
		return Math.round(channel + (end[index]! - channel) * progress);
	});

	return `rgb(${color.join(' ')})`;
};

const createScenarioPresentations = (
	scenarios: BenchmarkScenarioSummary[],
	columns: BenchmarkMetricColumn[],
	overallDomains: OverallDomain[],
): ScenarioPresentation[] => {
	const factorMaps: Array<Partial<Record<BenchmarkMetricName, number>>> = scenarios.map(() => {
		return {};
	});
	const peerValuesByMetric = new Map<BenchmarkMetricName, number[]>();

	for (const column of columns) {
		const peerValues = scenarios.flatMap((scenario) => {
			const value = scenario.metrics[column.name]?.median;
			return value === undefined ? [] : [value];
		});

		peerValuesByMetric.set(column.name, peerValues);

		scenarios.forEach((scenario, index) => {
			const value = scenario.metrics[column.name]?.median;

			if (value === undefined || peerValues.length === 0) return;
			factorMaps[index]![column.name] = getMetricFactor(value, peerValues, column.direction);
		});
	}

	return scenarios.map((scenario, index) => {
		const factors = factorMaps[index]!;
		const domainFactors = Object.fromEntries(overallDomains.map((domain) => {
			const domainMetricFactors = domain.metrics.flatMap((metricName) => {
				const column = columns.find((item) => item.name === metricName);
				const peerValues = peerValuesByMetric.get(metricName);
				const value = scenario.metrics[metricName]?.median;

				if (!column || !peerValues || value === undefined) return [];

				return [
					getOverallMetricFactor(metricName, value, peerValues, column.direction),
				];
			});

			return [domain.id, getGeometricMean(domainMetricFactors)];
		})) as Record<OverallDomainId, number>;
		const overallFactor = getWeightedGeometricMean(
			overallDomains.map((domain) => domainFactors[domain.id]),
			overallDomains.map((domain) => domain.weight),
		);

		return {
			...scenario,
			factors,
			domainFactors,
			overallFactor,
		};
	});
};

const formatMetricValue = (value: number, unit: MetricUnit): string => {
	if (unit === 'bytes') {
		if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
		return `${(value / 1024).toFixed(value >= 10 * 1024 ? 0 : 1)} KB`;
	}

	if (unit === 'milliseconds') {
		if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
		return `${Math.round(value)} ms`;
	}

	if (unit === 'score') return value.toFixed(0);
	return Math.round(value).toLocaleString('en-US');
};

const formatMetricRange = (
	metric: BenchmarkMetricSummary,
	unit: MetricUnit,
): string | null => {
	const minimum = formatMetricValue(metric.min, unit);
	const maximum = formatMetricValue(metric.max, unit);

	return minimum === maximum ? null : `${minimum}–${maximum}`;
};

const formatRelativeDeviation = (deviation: number): string => {
	if (Math.abs(deviation) < 0.0005) return '0%';

	const sign = deviation > 0 ? '+' : '−';
	return `${sign}${Math.abs(deviation * 100).toFixed(1)}%`;
};

const isMeasurementDeviationSignificant = (
	deviation: number | undefined,
	value: number | null | undefined,
	median: number | undefined,
	unit: MetricUnit,
): boolean => {
	if (value === null || value === undefined || median === undefined) return false;

	if (
		unit === 'milliseconds'
		&& Math.abs(value - median) <= MAX_INSIGNIFICANT_TIME_DEVIATION_MS
	) {
		return false;
	}

	if (deviation !== undefined) return Math.abs(deviation) > 0.1;
	return median === 0 && value !== 0;
};

const hasSignificantMeasurementDeviation = (
	scenario: BenchmarkScenarioSummary,
	column: BenchmarkMetricColumn,
): boolean => {
	const median = scenario.metrics[column.name]?.median;
	const probe = getBenchmarkMetricProbe(column.name);

	return scenario.probes[probe].measurements.some((measurement) => {
		if (!measurement.usedMetrics.includes(column.name)) return false;

		return isMeasurementDeviationSignificant(
			measurement.relativeDeviations?.[column.name],
			measurement.metrics[column.name],
			median,
			column.unit,
		);
	});
};

const getMeasurementDeviations = (
	scenario: BenchmarkScenarioSummary,
	column: BenchmarkMetricColumn,
) => {
	const probe = getBenchmarkMetricProbe(column.name);

	return scenario.probes[probe].measurements.flatMap((measurement) => {
		const value = measurement.metrics[column.name];

		if (value === undefined) return [];

		const deviation = measurement.relativeDeviations?.[column.name];

		return [{
			label: measurement.phase === 'adaptive'
				? `A${measurement.index}`
				: measurement.index.toString(),
			value: value === null ? '—' : formatMetricValue(value, column.unit),
			deviation: deviation === undefined ? '—' : formatRelativeDeviation(deviation),
			isExcluded: !measurement.usedMetrics.includes(column.name),
		}];
	});
};

const formatMeasurementDeviations = (
	scenario: BenchmarkScenarioSummary,
	column: BenchmarkMetricColumn,
): string => {
	return getMeasurementDeviations(scenario, column).map((measurement) => {
		const selection = measurement.isExcluded ? ' (excluded)' : '';
		return `${measurement.label}: ${measurement.value}, ${measurement.deviation}${selection}`;
	}).join(' · ');
};

export {
	bonusMetricColumns,
	bonusOverallDomains,
	createScenarioPresentations,
	formatMeasurementDeviations,
	formatMetricRange,
	formatMetricValue,
	getComparisonColor,
	getGeometricMean,
	getMeasurementDeviations,
	getOverallMetricFactor,
	getWeightedGeometricMean,
	hasSignificantMeasurementDeviation,
	isMeasurementDeviationSignificant,
	mainMetricColumns,
	mainOverallDomains,
};
export type {
	BenchmarkMetricColumn,
	OverallDomain,
	OverallDomainId,
	ScenarioPresentation,
};
