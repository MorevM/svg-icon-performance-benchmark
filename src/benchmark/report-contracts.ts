import type { BenchmarkMatrix } from './scenarios';

/**
 * Names of the values published by the benchmark probes.
 */
export type BenchmarkMetricName =
	| 'firstContentfulPaint'
	| 'largestContentfulPaint'
	| 'timeToInteractive'
	| 'totalBlockingTime'
	| 'lighthouseTotalBlockingTime'
	| 'speedIndex'
	| 'loadEvent'
	| 'observedLoadEvent'
	| 'parseHtml'
	| 'styleAndLayout'
	| 'paintCompositeAndRender'
	| 'totalMainThreadTime'
	| 'scriptEvaluation'
	| 'domNodes'
	| 'requests'
	| 'transferSize'
	| 'documentSize'
	| 'javascriptTransferSize'
	| 'performanceScore'
	| 'maxPotentialFid';

/**
 * Complete metric set; unavailable optional values remain null.
 */
export type BenchmarkRunMetrics = Record<BenchmarkMetricName, number | null>;

/**
 * Distribution values published for one metric.
 */
export type BenchmarkMetricSummary = {
	/**
	 * Number of measurements retained for aggregation.
	 */
	sampleCount: number;

	/**
	 * Median across retained measurements.
	 */
	median: number;

	/**
	 * 25th percentile across retained measurements.
	 */
	p25: number;

	/**
	 * 75th percentile across retained measurements.
	 */
	p75: number;

	/**
	 * Lowest measured value.
	 */
	min: number;

	/**
	 * Highest measured value.
	 */
	max: number;
};

/**
 * Independent browser operation that produces one family of benchmark metrics.
 */
export type BenchmarkProbeName = 'lighthouse' | 'load' | 'render';

/**
 * Indicates whether a measurement belongs to the mandatory or adaptive sample.
 */
export type BenchmarkMeasurementPhase = 'base' | 'adaptive';

/**
 * Raw values and selection state retained for one probe measurement.
 */
export type BenchmarkMeasurementSummary = {
	/**
	 * One-based measurement number within the probe.
	 */
	index: number;

	/**
	 * Whether the measurement was mandatory or triggered by one outlier.
	 */
	phase: BenchmarkMeasurementPhase;

	/**
	 * Relative path to the raw probe artifact.
	 */
	artifactPath: string;

	/**
	 * Values produced by this probe.
	 */
	metrics: Partial<BenchmarkRunMetrics>;

	/**
	 * Signed deviation of every available metric from the scenario median.
	 */
	relativeDeviations: Partial<Record<BenchmarkMetricName, number>>;

	/**
	 * Metrics for which this measurement participates in the published aggregation.
	 */
	usedMetrics: BenchmarkMetricName[];
};

/**
 * Complete measurement series for one independent probe.
 */
export type BenchmarkProbeSummary = {
	/**
	 * Metrics whose single base outlier triggered two adaptive measurements.
	 */
	triggerMetrics: BenchmarkMetricName[];

	/**
	 * Mandatory and adaptive measurements in execution order.
	 */
	measurements: BenchmarkMeasurementSummary[];
};

/**
 * Result of validating whether a scenario rendered its icons correctly.
 */
export type BenchmarkRenderingCheck = {
	/**
	 * Whether all automated rendering assertions passed.
	 */
	passed: boolean;

	/**
	 * Human-readable failures or diagnostic notes.
	 */
	messages: string[];
};

/**
 * Aggregated results and artifact links for one benchmark scenario.
 */
export type BenchmarkScenarioSummary = {
	/**
	 * Stable scenario identifier shared with the scenario catalog.
	 */
	id: string;

	/**
	 * Identifier of the presentation group.
	 */
	groupId: string;

	/**
	 * Human-readable group name.
	 */
	groupName: string;

	/**
	 * Human-readable scenario name.
	 */
	name: string;

	/**
	 * Full scenario title.
	 */
	title: string;

	/**
	 * Comparison matrix containing the scenario.
	 */
	matrix: BenchmarkMatrix;

	/**
	 * Absolute path of the showcase page.
	 */
	pagePath: string;

	/**
	 * Absolute path of the bare page used for navigation measurements.
	 */
	barePagePath: string;

	/**
	 * Absolute path of the controlled post-paint rendering page.
	 */
	controlledPagePath: string;

	/**
	 * Absolute path of the representative Lighthouse report.
	 */
	reportPath: string;

	/**
	 * Independent Lighthouse, Load and controlled rendering series.
	 */
	probes: Record<BenchmarkProbeName, BenchmarkProbeSummary>;

	/**
	 * Distributions calculated from the retained measurements.
	 */
	metrics: Record<BenchmarkMetricName, BenchmarkMetricSummary | null>;

	/**
	 * Lighthouse warnings retained for review.
	 */
	warnings: string[];

	/**
	 * Result of the separate rendering validation.
	 */
	renderingCheck: BenchmarkRenderingCheck;
};

/**
 * Data consumed by the comparison table on the homepage.
 */
export type BenchmarkSummary = {
	/**
	 * Version of this JSON contract.
	 */
	schemaVersion: 3;

	/**
	 * ISO timestamp of the completed series.
	 */
	generatedAt: string;

	/**
	 * Number of icons rendered by every scenario.
	 */
	iconCount: number;

	/**
	 * Number of mandatory measurements per probe.
	 */
	runCount: number;

	/**
	 * Final raw measurement count for each probe, including adaptive measurements.
	 */
	probeMeasurementCounts: Record<BenchmarkProbeName, number>;

	/**
	 * Environment details displayed above the comparison table.
	 */
	environment: {
		/**
		 * Lighthouse package version.
		 */
		lighthouseVersion: string;

		/**
		 * Chromium version reported by the launched browser.
		 */
		chromiumVersion: string;

		/**
		 * CPU slowdown multiplier used for the series.
		 */
		cpuSlowdownMultiplier: number;
	};

	/**
	 * Results in canonical scenario order.
	 */
	scenarios: BenchmarkScenarioSummary[];
};

/**
 * Reproducibility metadata for a completed benchmark series.
 */
export type BenchmarkManifest = {
	/**
	 * Version of this JSON contract.
	 */
	schemaVersion: 3;

	/**
	 * ISO timestamp of the completed series.
	 */
	generatedAt: string;

	/**
	 * Commit measured by the series.
	 */
	commitSha: string;

	/**
	 * Whether tracked or untracked files differed from that commit.
	 */
	isWorkingTreeDirty: boolean;

	/**
	 * Number of mandatory measurements per probe.
	 */
	runCount: number;

	/**
	 * Final raw measurement count for each probe, including adaptive measurements.
	 */
	probeMeasurementCounts: Record<BenchmarkProbeName, number>;

	/**
	 * Scenario identifiers in the order used by each mandatory round.
	 */
	roundOrders: string[][];

	/**
	 * Adaptive measurement policy and the scenario order used by its probe-specific rounds.
	 */
	adaptiveMeasurements: {
		/**
		 * Number of measurements added when a probe is triggered.
		 */
		additionalRunCount: number;

		/**
		 * MAD multiplier used by the robust outlier rule.
		 */
		madMultiplier: number;

		/**
		 * Normal-distribution consistency factor applied to MAD.
		 */
		madConsistencyFactor: number;

		/**
		 * Smallest absolute deviation accepted by the outlier rule, in milliseconds.
		 */
		minimumAbsoluteDeviation: number;

		/**
		 * Smallest relative deviation accepted by the outlier rule.
		 */
		minimumRelativeDeviation: number;

		/**
		 * Required number of outliers in the five mandatory measurements.
		 */
		triggerOutlierCount: 1;

		/**
		 * Scenario identifiers in the order used by each adaptive probe round.
		 */
		probeRoundOrders: Partial<Record<BenchmarkProbeName, string[][]>>;

		/**
		 * Human-readable rule for selecting calmer adaptive measurements.
		 */
		selectionPolicy: string;
	};

	/**
	 * Scenario used for the discarded Lighthouse and controlled warm-up.
	 */
	warmupScenarioId: string;

	/**
	 * Runtime and package versions used by the series.
	 */
	versions: {
		/**
		 * Node.js version.
		 */
		node: string;

		/**
		 * pnpm version.
		 */
		pnpm: string;

		/**
		 * Chromium version reported by the launched browser.
		 */
		chromium: string;

		/**
		 * Lighthouse package version.
		 */
		lighthouse: string;

		/**
		 * Versions of other runner dependencies.
		 */
		packages: Record<string, string>;
	};

	/**
	 * Host environment used by the series.
	 */
	platform: {
		/**
		 * Operating system name and release.
		 */
		os: string;

		/**
		 * Processor architecture.
		 */
		architecture: string;
	};

	/**
	 * Lighthouse execution settings affecting measurements.
	 */
	lighthouse: {
		/**
		 * Lighthouse form factor.
		 */
		formFactor: string;

		/**
		 * Strategy used to apply Lighthouse CPU and network throttling.
		 */
		throttlingMethod: 'devtools' | 'provided' | 'simulate';

		/**
		 * Emulated viewport dimensions and scale factor.
		 */
		viewport: {
			/**
			 * Viewport width in CSS pixels.
			 */
			width: number;

			/**
			 * Viewport height in CSS pixels.
			 */
			height: number;

			/**
			 * Device pixel ratio used during emulation.
			 */
			deviceScaleFactor: number;
		};

		/**
		 * Lighthouse throttling settings.
		 */
		throttling: Record<string, number>;
	};

	/**
	 * Settings and provenance of metrics collected outside Lighthouse.
	 */
	controlledMeasurements: {
		/**
		 * Real DevTools CPU throttling rate.
		 */
		cpuSlowdownMultiplier: number;

		/**
		 * Network profile used for the cold Load measurement.
		 */
		loadNetworkProfile: string;

		/**
		 * Cache policy used for the controlled Load measurement.
		 */
		loadCachePolicy: string;

		/**
		 * Cache policy used before the controlled rendering window.
		 */
		renderCachePolicy: string;

		/**
		 * Start boundary of the controlled blocking-time window.
		 */
		renderWindowStart: string;

		/**
		 * End boundary of the controlled blocking-time window.
		 */
		renderWindowEnd: string;
	};

	/**
	 * Cache and storage reset policy applied before each Lighthouse run.
	 */
	cachePolicy: string;

	/**
	 * Source SVG corpus measured by the series.
	 */
	sourceSvg: {
		/**
		 * Sorted source file names.
		 */
		files: string[];

		/**
		 * Hash of the ordered source names and contents.
		 */
		corpusHash: string;

		/**
		 * Hash of the ordered benchmark icon sequence.
		 */
		sequenceHash: string;
	};

	/**
	 * Static server settings used by Lighthouse.
	 */
	server: {
		/**
		 * URL protocol.
		 */
		protocol: 'http' | 'https';

		/**
		 * Hostname exposed to the browser.
		 */
		host: string;

		/**
		 * Listening port.
		 */
		port: number;

		/**
		 * Whether response compression was enabled.
		 */
		compression: boolean;
	};

	/**
	 * Complete canonical scenario list expected in the artifacts.
	 */
	scenarioIds: string[];
};
