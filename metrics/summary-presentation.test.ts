import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	bonusOverallDomains,
	formatMetricRange,
	getGeometricMean,
	getOverallMetricFactor,
	getWeightedGeometricMean,
	isMeasurementDeviationSignificant,
	mainOverallDomains,
} from '~benchmark/summary-presentation';

describe('Overall presentation', () => {
	it('Defines five explicitly weighted domains without derived Lighthouse metrics', () => {
		assert.deepEqual(
			mainOverallDomains.map((domain) => domain.id),
			[
				'visualLoading',
				'responsiveness',
				'completion',
				'cpuRendering',
				'footprint',
			],
		);

		const metricNames = new Set(mainOverallDomains.flatMap((domain) => domain.metrics));

		assert.equal(metricNames.has('performanceScore'), false);
		assert.equal(metricNames.has('largestContentfulPaint'), true);
		assert.equal(metricNames.has('timeToInteractive'), false);
		assert.equal(metricNames.has('speedIndex'), false);
		assert.deepEqual(
			mainOverallDomains.find((domain) => domain.id === 'visualLoading')?.metrics,
			['firstContentfulPaint', 'largestContentfulPaint'],
		);
		assert.equal(
			mainOverallDomains.reduce((total, domain) => total + domain.weight, 0),
			1,
		);
		assert.equal(
			mainOverallDomains.find((domain) => domain.id === 'completion')?.weight,
			0.05,
		);
	});

	it('Keeps Vue-specific costs inside the existing CPU and footprint domains', () => {
		assert.deepEqual(
			bonusOverallDomains.find((domain) => domain.id === 'cpuRendering')?.metrics,
			['totalMainThreadTime', 'scriptEvaluation'],
		);
		assert.deepEqual(
			bonusOverallDomains.find((domain) => domain.id === 'footprint')?.metrics,
			[
				'domNodes',
				'requests',
				'transferSize',
				'documentSize',
				'javascriptTransferSize',
			],
		);
	});

	it('Treats differences within five percent as equivalent', () => {
		assert.equal(
			getOverallMetricFactor('loadEvent', 105, [100, 105], 'lower'),
			1,
		);
		assert.equal(
			getOverallMetricFactor('loadEvent', 106, [100, 106], 'lower'),
			1.06,
		);
	});

	it('Uses a request pseudocount and caps individual contributions', () => {
		assert.equal(
			getOverallMetricFactor('requests', 1, [0, 1, 26], 'lower'),
			2,
		);
		assert.equal(
			getOverallMetricFactor('requests', 26, [0, 1, 26], 'lower'),
			4,
		);
		assert.equal(
			getOverallMetricFactor('loadEvent', 1000, [100, 1000], 'lower'),
			4,
		);
	});

	it('Averages metric factors equally inside a domain', () => {
		assert.equal(
			getGeometricMean([1, 1, 1, 1, 4]),
			4 ** (1 / 5),
		);
	});

	it('Weights the completion domain at five percent in Overall', () => {
		assert.equal(
			getWeightedGeometricMean(
				[1, 1, 4, 1, 1],
				mainOverallDomains.map((domain) => domain.weight),
			),
			4 ** 0.05,
		);
	});

	it('Highlights only deviations strictly greater than ten percent', () => {
		assert.equal(isMeasurementDeviationSignificant(0.1, 110, 100, 'count'), false);
		assert.equal(isMeasurementDeviationSignificant(-0.1, 90, 100, 'count'), false);
		assert.equal(isMeasurementDeviationSignificant(0.101, 110.1, 100, 'count'), true);
		assert.equal(isMeasurementDeviationSignificant(-0.101, 89.9, 100, 'count'), true);
	});

	it('Ignores time deviations of thirty milliseconds or less', () => {
		assert.equal(isMeasurementDeviationSignificant(7 / 42, 49, 42, 'milliseconds'), false);
		assert.equal(isMeasurementDeviationSignificant(30 / 42, 72, 42, 'milliseconds'), false);
		assert.equal(isMeasurementDeviationSignificant(30.1 / 42, 72.1, 42, 'milliseconds'), true);
	});

	it('Treats a non-zero run against a zero median as significant', () => {
		assert.equal(isMeasurementDeviationSignificant(undefined, 0, 0, 'count'), false);
		assert.equal(isMeasurementDeviationSignificant(undefined, 12, 0, 'count'), true);
		assert.equal(isMeasurementDeviationSignificant(undefined, null, 0, 'count'), false);
	});

	it('Hides a range when its formatted bounds are identical', () => {
		const metric = {
			sampleCount: 5,
			median: 155 * 1024,
			p25: 155 * 1024,
			p75: 155 * 1024,
			min: 155 * 1024,
			max: 155 * 1024 + 400,
		};

		assert.equal(formatMetricRange(metric, 'bytes'), null);
		assert.equal(
			formatMetricRange({ ...metric, max: 156 * 1024 }, 'bytes'),
			'155 KB–156 KB',
		);
	});
});
