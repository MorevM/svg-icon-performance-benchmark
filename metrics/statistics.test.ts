import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	aggregateMetrics,
	calculateMedianAbsoluteDeviation,
	calculateRelativeDeviation,
	findRepresentativeRunIndex,
	findSingleRobustOutlierIndex,
	isMetricDeviationUnstable,
	selectAdaptiveMeasurementIndices,
	summarizeValues,
} from './statistics';
import type { BenchmarkRunMetrics } from '~benchmark/report-contracts';

const createRun = (value: number): BenchmarkRunMetrics => {
	return {
		firstContentfulPaint: value,
		timeToInteractive: value,
		totalBlockingTime: value,
		lighthouseTotalBlockingTime: value,
		speedIndex: value,
		loadEvent: value,
		parseHtml: value,
		styleAndLayout: value,
		paintCompositeAndRender: value,
		totalMainThreadTime: value,
		scriptEvaluation: value,
		domNodes: value,
		requests: value,
		transferSize: value,
		documentSize: value,
		javascriptTransferSize: value,
		performanceScore: value,
		maxPotentialFid: value,
	};
};

describe('Benchmark statistics', () => {
	it('Calculates median, quartiles and extrema', () => {
		assert.deepEqual(summarizeValues([1, 2, 3, 4]), {
			sampleCount: 4,
			median: 2.5,
			p25: 1.75,
			p75: 3.25,
			min: 1,
			max: 4,
		});
	});

	it('Calculates median absolute deviation', () => {
		assert.equal(calculateMedianAbsoluteDeviation([98, 99, 100, 101, 200]), 1);
	});

	it('Finds an outlier only when exactly one value passes every threshold', () => {
		const options = {
			madMultiplier: 1.5,
			madConsistencyFactor: 1.4826,
			minimumAbsoluteDeviation: 30,
			minimumRelativeDeviation: 0.2,
		};

		assert.equal(findSingleRobustOutlierIndex([98, 99, 100, 101, 200], options), 4);
		assert.equal(findSingleRobustOutlierIndex([98, 99, 100, 160, 200], options), null);
		assert.equal(findSingleRobustOutlierIndex([769, 1059, 767, 856, 855], options), 1);
		assert.equal(findSingleRobustOutlierIndex([40, 41, 42, 43, 72], options), null);
		assert.equal(findSingleRobustOutlierIndex([40, 41, 42, 43, 72.1], options), 4);
		assert.equal(findSingleRobustOutlierIndex([1000, 1001, 1002, 1003, 1100], options), null);
	});

	it('Replaces one base outlier only with calm adaptive measurements', () => {
		const options = {
			madMultiplier: 1.5,
			madConsistencyFactor: 1.4826,
			minimumAbsoluteDeviation: 30,
			minimumRelativeDeviation: 0.2,
		};

		assert.deepEqual(
			selectAdaptiveMeasurementIndices(
				[98, 99, 100, 101, 200],
				[102, 180],
				options,
			),
			{
				outlierIndex: 4,
				calmAdaptiveIndices: [5],
				usedIndices: [0, 1, 2, 3, 5],
			},
		);
		assert.deepEqual(
			selectAdaptiveMeasurementIndices(
				[769, 1059, 767, 856, 855],
				[908, 823],
				options,
			),
			{
				outlierIndex: 1,
				calmAdaptiveIndices: [5, 6],
				usedIndices: [0, 2, 3, 4, 5, 6],
			},
		);
	});

	it('Keeps the base sample when adaptive measurements are not calmer', () => {
		const options = {
			madMultiplier: 1.5,
			madConsistencyFactor: 1.4826,
			minimumAbsoluteDeviation: 30,
			minimumRelativeDeviation: 0.2,
		};

		assert.deepEqual(
			selectAdaptiveMeasurementIndices(
				[98, 99, 100, 101, 200],
				[180, 220],
				options,
			).usedIndices,
			[0, 1, 2, 3, 4],
		);
	});

	it('Keeps unavailable metrics null', () => {
		const run = createRun(10);
		run.scriptEvaluation = null;

		assert.equal(aggregateMetrics([run]).scriptEvaluation, null);
	});

	it('Treats a non-zero value as unstable when the median is zero', () => {
		assert.equal(calculateRelativeDeviation(12, 0), null);
		assert.equal(isMetricDeviationUnstable(12, 0, 0.1), true);
		assert.equal(isMetricDeviationUnstable(0, 0, 0.1), false);
	});

	it('Chooses the run nearest to the multidimensional median', () => {
		const runs = [createRun(10), createRun(20), createRun(100)];
		const summary = aggregateMetrics(runs);

		assert.equal(findRepresentativeRunIndex(runs, summary), 1);
	});
});
