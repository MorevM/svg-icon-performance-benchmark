import type {
	BenchmarkMetricName,
	BenchmarkProbeName,
} from './report-contracts';

const benchmarkProbeNames = [
	'lighthouse',
	'load',
	'render',
] as const satisfies BenchmarkProbeName[];

const probeTimingMetricNames = {
	lighthouse: [
		'firstContentfulPaint',
		'largestContentfulPaint',
		'timeToInteractive',
		'lighthouseTotalBlockingTime',
		'speedIndex',
		'observedLoadEvent',
		'parseHtml',
		'styleAndLayout',
		'paintCompositeAndRender',
		'totalMainThreadTime',
		'scriptEvaluation',
		'maxPotentialFid',
	],
	load: ['loadEvent'],
	render: ['totalBlockingTime'],
} as const satisfies Record<BenchmarkProbeName, readonly BenchmarkMetricName[]>;

/**
 * Resolves the independent browser operation that produces a benchmark metric.
 *
 * @param   metricName   Metric stored in benchmark artifacts.
 *
 * @returns              Lighthouse, Load or controlled rendering probe.
 */
const getBenchmarkMetricProbe = (metricName: BenchmarkMetricName): BenchmarkProbeName => {
	if (metricName === 'loadEvent') return 'load';
	if (metricName === 'totalBlockingTime') return 'render';
	return 'lighthouse';
};

export {
	benchmarkProbeNames,
	getBenchmarkMetricProbe,
	probeTimingMetricNames,
};
