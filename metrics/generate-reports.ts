/* eslint-disable no-await-in-loop, no-console -- Benchmark scenarios must run sequentially and report CLI progress. */
import { build } from 'astro';
import astroPackage from 'astro/package.json' with { type: 'json' };
import vuePackage from 'vue/package.json' with { type: 'json' };
import { execFileSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import {
	cpSync,
	existsSync,
	globSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	Browser as BrowserProduct,
	computeExecutablePath,
	install,
} from '@puppeteer/browsers';
import puppeteerBrowsersPackage from '@puppeteer/browsers/package.json' with { type: 'json' };
import lighthouse from 'lighthouse';
import lighthousePackage from 'lighthouse/package.json' with { type: 'json' };
import { ReportGenerator } from 'lighthouse/report/generator/report-generator.js';
import puppeteer from 'puppeteer-core';
import { PUPPETEER_REVISIONS } from 'puppeteer-core/internal/revisions.js';
import puppeteerPackage from 'puppeteer-core/package.json' with { type: 'json' };
import yauzlPackage from 'yauzl/package.json' with { type: 'json' };
import { createBenchmarkIconSequence } from '~benchmark/icon-sequence';
import {
	benchmarkProbeNames,
	getBenchmarkMetricProbe,
	probeTimingMetricNames,
} from '~benchmark/probes';
import {
	BENCHMARK_ICON_COUNT,
	benchmarkScenarios,
} from '~benchmark/scenarios';
import {
	measureControlledRender,
} from './controlled-measurements';
import {
	removeDirectoryBestEffort,
	replaceDirectory,
} from './directory-replacement';
import { extractBenchmarkMetrics } from './lighthouse-result';
import { startServer } from './server';
import {
	aggregateMetrics,
	benchmarkMetricNames,
	calculateRelativeDeviation,
	findRepresentativeRunIndex,
	findSingleRobustOutlierIndex,
	selectAdaptiveMeasurementIndices,
} from './statistics';
import { validateScenarioRendering } from './validate-page';
import type { Flags as LighthouseFlags, RunnerResult } from 'lighthouse';
import type { Browser } from 'puppeteer-core';
import type {
	BenchmarkManifest,
	BenchmarkMeasurementPhase,
	BenchmarkMeasurementSummary,
	BenchmarkMetricName,
	BenchmarkProbeName,
	BenchmarkProbeSummary,
	BenchmarkRenderingCheck,
	BenchmarkRunMetrics,
	BenchmarkScenarioSummary,
	BenchmarkSummary,
} from '~benchmark/report-contracts';
import type { BenchmarkScenario } from '~benchmark/scenarios';
import type {
	AdaptiveMeasurementSelection,
	RobustOutlierOptions,
} from './statistics';

/**
 * Selects between a disposable one-run check and the publishable five-run series.
 */
type BenchmarkMode = 'smoke' | 'full';

/**
 * Retains the data needed after one independent probe measurement.
 */
type ScenarioMeasurement = {
	/**
	 * Probe that produced the measurement.
	 */
	probe: BenchmarkProbeName;

	/**
	 * One-based measurement number within the probe.
	 */
	index: number;

	/**
	 * Whether the measurement is mandatory or adaptive.
	 */
	phase: BenchmarkMeasurementPhase;

	/**
	 * Metrics produced by this probe.
	 */
	metrics: Partial<BenchmarkRunMetrics>;

	/**
	 * Relative path of the raw probe artifact.
	 */
	artifactPath: string;

	/**
	 * Browser warnings associated with the measurement.
	 */
	warnings: string[];
};

type ScenarioProbeMeasurements = Record<BenchmarkProbeName, ScenarioMeasurement[]>;

type ScenarioMetricSelection = {
	adaptiveSelection?: AdaptiveMeasurementSelection;
	usedMeasurements: Set<ScenarioMeasurement>;
};

type ProbeMeasurementOptions = {
	browser: Browser;
	host: string;
	browserPort: number;
	scenario: BenchmarkScenario;
	probe: BenchmarkProbeName;
	index: number;
	phase: BenchmarkMeasurementPhase;
	outputDirectory: string;
};

type ReaggregatableBenchmarkSummary = Omit<BenchmarkSummary, 'schemaVersion'> & {
	/**
	 * Current contract or the previous contract with an independent Load probe.
	 */
	schemaVersion: 3 | 4;
};

type ReaggregatableBenchmarkManifest = Omit<BenchmarkManifest, 'schemaVersion'> & {
	/**
	 * Current contract or the previous contract with an independent Load probe.
	 */
	schemaVersion: 3 | 4;
};

type LegacyRunMetrics = Partial<BenchmarkRunMetrics> & {
	/**
	 * Previous diagnostic name for the Lighthouse-observed load event.
	 */
	observedLoadEvent?: number | null;
};

type ManifestOptions = {
	generatedAt: string;
	runCount: number;
	probeMeasurementCounts: Record<BenchmarkProbeName, number>;
	roundOrders: string[][];
	adaptiveRoundOrders: Partial<Record<BenchmarkProbeName, string[][]>>;
	chromiumVersion: string;
};

const REPORTS_DIRECTORY = path.resolve('reports');
const BROWSER_CACHE_DIRECTORY = path.resolve('.cache/puppeteer');
const BROWSER_BUILD_ID = PUPPETEER_REVISIONS['chrome-headless-shell'];
const SERVER_PORT = 3000;
const CPU_SLOWDOWN_MULTIPLIER = 6;
const FULL_RUN_COUNT = 5;
const ADAPTIVE_RUN_COUNT = 2;
const LIGHTHOUSE_THROTTLING_METHOD = 'devtools';
const WARMUP_SCENARIO_ID = 'img-source-from-icon';
const ADAPTIVE_OUTLIER_OPTIONS: RobustOutlierOptions = {
	madMultiplier: 1.5,
	madConsistencyFactor: 1.4826,
	minimumAbsoluteDeviation: 30,
	minimumRelativeDeviation: 0.2,
};
const ADAPTIVE_SELECTION_POLICY = [
	'Keep the five mandatory measurements unless exactly one is a robust outlier.',
	'When at least one adaptive value passes the original thresholds, replace the outlier with every calm adaptive value.',
].join(' ');
const OPTIONAL_METRICS = new Set<BenchmarkMetricName>([
	'javascriptTransferSize',
	'scriptEvaluation',
]);
const REQUIRED_METRICS = benchmarkMetricNames.filter((metricName) => {
	return !OPTIONAL_METRICS.has(metricName);
});

const lighthouseFlags: LighthouseFlags = {
	formFactor: 'mobile',
	hostname: '127.0.0.1',
	logLevel: 'error',
	onlyCategories: ['performance'],
	output: 'json',
	screenEmulation: {
		mobile: true,
		width: 412,
		height: 823,
		deviceScaleFactor: 1.75,
		disabled: false,
	},
	throttling: {
		cpuSlowdownMultiplier: CPU_SLOWDOWN_MULTIPLIER,
	},
	throttlingMethod: LIGHTHOUSE_THROTTLING_METHOD,
	disableStorageReset: false,
};

const writeArtifact = (filePath: string, contents: string): void => {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, contents);
};

const hashContents = (contents: string): string => {
	return createHash('sha256').update(contents).digest('hex');
};

const shuffleScenarios = (): BenchmarkScenario[] => {
	const scenarios = [...benchmarkScenarios];

	for (let index = scenarios.length - 1; index > 0; index--) {
		const targetIndex = randomInt(index + 1);
		[scenarios[index], scenarios[targetIndex]] = [scenarios[targetIndex]!, scenarios[index]!];
	}

	return scenarios;
};

const verifyBuiltScenarioPages = (): void => {
	const generatedPages = [
		...globSync(`dist/**/${BENCHMARK_ICON_COUNT}/index.html`),
		...globSync(`dist/**/${BENCHMARK_ICON_COUNT}/bare/index.html`),
		...globSync(`dist/**/${BENCHMARK_ICON_COUNT}/controlled/index.html`),
	]
		.map((filePath) => path.resolve(filePath));
	const expectedPages = benchmarkScenarios
		.flatMap((scenario) => {
			return [
				path.resolve('dist', scenario.pagePath.slice(1), 'index.html'),
				path.resolve('dist', scenario.barePagePath.slice(1), 'index.html'),
				path.resolve('dist', scenario.controlledPagePath.slice(1), 'index.html'),
			];
		});
	const unexpectedPages = generatedPages.filter((filePath) => !expectedPages.includes(filePath));
	const missingPages = expectedPages.filter((filePath) => !generatedPages.includes(filePath));

	if (unexpectedPages.length > 0 || missingPages.length > 0) {
		throw new Error([
			'The built benchmark matrix does not match the scenario catalog.',
			...missingPages.map((filePath) => `Missing: ${path.relative(process.cwd(), filePath)}`),
			...unexpectedPages.map((filePath) => `Unexpected: ${path.relative(process.cwd(), filePath)}`),
		].join('\n'));
	}
};

const getBrowserPort = (browser: Browser): number => {
	const port = Number(new URL(browser.wsEndpoint()).port);

	if (!Number.isSafeInteger(port) || port <= 0) {
		throw new Error('Chromium did not report a valid DevTools port.');
	}

	return port;
};

const getBrowserExecutablePath = async (): Promise<string> => {
	const options = {
		browser: BrowserProduct.CHROMEHEADLESSSHELL,
		buildId: BROWSER_BUILD_ID,
		cacheDir: BROWSER_CACHE_DIRECTORY,
	};
	const executablePath = computeExecutablePath(options);

	if (existsSync(executablePath)) return executablePath;

	console.log(`Installing Chrome Headless Shell ${BROWSER_BUILD_ID}...`);
	const installation = await install({
		...options,
		downloadProgressCallback: 'default',
	});

	return installation.executablePath;
};

const assertRequiredMetrics = (
	scenario: BenchmarkScenario,
	probe: BenchmarkProbeName,
	metrics: Partial<BenchmarkRunMetrics>,
): void => {
	const missingMetrics = REQUIRED_METRICS.filter((metricName) => {
		return getBenchmarkMetricProbe(metricName) === probe
			&& (metrics[metricName] === null || metrics[metricName] === undefined);
	});

	if (missingMetrics.length > 0) {
		throw new Error(`${scenario.id} is missing required metrics: ${missingMetrics.join(', ')}.`);
	}
};

const getJsonReport = (result: RunnerResult): string => {
	if (typeof result.report === 'string') return result.report;

	const jsonReport = result.report.find((report) => report.trimStart().startsWith('{'));

	if (!jsonReport) throw new Error('Lighthouse did not return a JSON report.');
	return jsonReport;
};

const runLighthouse = async (
	host: string,
	port: number,
	scenario: BenchmarkScenario,
): Promise<RunnerResult> => {
	const result = await lighthouse(
		new URL(scenario.barePagePath, host).href,
		{
			...lighthouseFlags,
			port,
		},
	);

	if (!result) throw new Error(`Lighthouse returned no result for ${scenario.id}.`);
	return result;
};

const createProbeRecord = <Value>(createValue: () => Value): Record<BenchmarkProbeName, Value> => {
	return Object.fromEntries(benchmarkProbeNames.map((probe) => {
		return [probe, createValue()];
	})) as Record<BenchmarkProbeName, Value>;
};

const createProbeMeasurements = (): ScenarioProbeMeasurements => {
	return createProbeRecord<ScenarioMeasurement[]>(() => []);
};

const createProbeTriggerMetrics = (): Record<BenchmarkProbeName, BenchmarkMetricName[]> => {
	return createProbeRecord<BenchmarkMetricName[]>(() => []);
};

const pickProbeMetrics = (
	metrics: BenchmarkRunMetrics,
	probe: BenchmarkProbeName,
): Partial<BenchmarkRunMetrics> => {
	return Object.fromEntries(benchmarkMetricNames.flatMap((metricName) => {
		return getBenchmarkMetricProbe(metricName) === probe
			? [[metricName, metrics[metricName]]]
			: [];
	}));
};

const runProbeMeasurement = async (options: ProbeMeasurementOptions): Promise<ScenarioMeasurement> => {
	const {
		browser,
		host,
		browserPort,
		scenario,
		probe,
		index,
		phase,
		outputDirectory,
	} = options;
	const measurementName = index.toString().padStart(2, '0');
	const relativeDirectory = path.join('scenarios', scenario.id, 'measurements', probe);
	const artifactPath = path.join(relativeDirectory, `${measurementName}.json`);
	let metrics: Partial<BenchmarkRunMetrics>;
	let contents: string;
	let warnings: string[] = [];

	if (probe === 'lighthouse') {
		const result = await runLighthouse(host, browserPort, scenario);

		metrics = pickProbeMetrics(extractBenchmarkMetrics(result.lhr), probe);
		contents = getJsonReport(result);
		warnings = result.lhr.runWarnings;
	} else {
		const render = await measureControlledRender(
			browser,
			host,
			scenario,
			CPU_SLOWDOWN_MULTIPLIER,
		);

		metrics = { totalBlockingTime: render.totalBlockingTime };
		contents = JSON.stringify({
			schemaVersion: 2,
			probe,
			...render,
		}, null, '\t');
	}

	assertRequiredMetrics(scenario, probe, metrics);
	writeArtifact(path.join(outputDirectory, artifactPath), contents);

	return {
		probe,
		index,
		phase,
		metrics,
		artifactPath: artifactPath.replaceAll(path.sep, '/'),
		warnings,
	};
};

const getAdaptiveTriggerMetrics = (
	measurements: ScenarioProbeMeasurements,
	baseRunCount: number,
): Record<BenchmarkProbeName, BenchmarkMetricName[]> => {
	const triggerMetrics = createProbeTriggerMetrics();

	for (const probe of benchmarkProbeNames) {
		for (const metricName of probeTimingMetricNames[probe]) {
			const values = measurements[probe].flatMap((measurement) => {
				const value = measurement.metrics[metricName];
				return measurement.phase === 'base' && typeof value === 'number' ? [value] : [];
			});

			if (
				values.length === baseRunCount
				&& findSingleRobustOutlierIndex(values, ADAPTIVE_OUTLIER_OPTIONS) !== null
			) {
				triggerMetrics[probe].push(metricName);
			}
		}
	}

	return triggerMetrics;
};

const createMetricSelections = (
	measurements: ScenarioProbeMeasurements,
	triggerMetrics: Record<BenchmarkProbeName, BenchmarkMetricName[]>,
): Map<BenchmarkMetricName, ScenarioMetricSelection> => {
	const selections = new Map<BenchmarkMetricName, ScenarioMetricSelection>();

	for (const metricName of benchmarkMetricNames) {
		const probe = getBenchmarkMetricProbe(metricName);
		const baseMeasurements = measurements[probe].filter((measurement) => {
			return measurement.phase === 'base' && typeof measurement.metrics[metricName] === 'number';
		});
		const adaptiveMeasurements = measurements[probe].filter((measurement) => {
			return measurement.phase === 'adaptive' && typeof measurement.metrics[metricName] === 'number';
		});
		const selection: ScenarioMetricSelection = {
			usedMeasurements: new Set(baseMeasurements),
		};

		if (triggerMetrics[probe].includes(metricName) && adaptiveMeasurements.length > 0) {
			const combinedMeasurements = [...baseMeasurements, ...adaptiveMeasurements];
			const adaptiveSelection = selectAdaptiveMeasurementIndices(
				baseMeasurements.map((measurement) => measurement.metrics[metricName]!),
				adaptiveMeasurements.map((measurement) => measurement.metrics[metricName]!),
				ADAPTIVE_OUTLIER_OPTIONS,
			);

			selection.adaptiveSelection = adaptiveSelection;
			selection.usedMeasurements = new Set(
				adaptiveSelection.usedIndices.map((index) => combinedMeasurements[index]!),
			);
		}

		selections.set(metricName, selection);
	}

	return selections;
};

const createScenarioSummary = (
	scenario: BenchmarkScenario,
	measurements: ScenarioProbeMeasurements,
	triggerMetrics: Record<BenchmarkProbeName, BenchmarkMetricName[]>,
	renderingCheck: BenchmarkRenderingCheck,
	outputDirectory: string,
): BenchmarkScenarioSummary => {
	const metricSelections = createMetricSelections(measurements, triggerMetrics);
	const allMeasurements = benchmarkProbeNames.flatMap((probe) => measurements[probe]);
	const selectedMetrics = allMeasurements.map((measurement) => {
		return Object.fromEntries(benchmarkMetricNames.flatMap((metricName) => {
			const value = measurement.metrics[metricName];
			const isUsed = metricSelections.get(metricName)?.usedMeasurements.has(measurement) ?? false;

			return isUsed && value !== undefined ? [[metricName, value]] : [];
		}));
	});
	const metrics = aggregateMetrics(selectedMetrics);
	const reportPath = path.join(outputDirectory, 'scenarios', scenario.id, 'report.html');
	const warnings = [...new Set(allMeasurements.flatMap((measurement) => measurement.warnings))];

	for (const probe of benchmarkProbeNames) {
		if (triggerMetrics[probe].length === 0) continue;

		warnings.push(
			`Adaptive ${probe} measurements were triggered by one base outlier in: ${triggerMetrics[probe].join(', ')}.`,
		);

		const replacedMetrics = triggerMetrics[probe].filter((metricName) => {
			return (metricSelections.get(metricName)?.adaptiveSelection?.calmAdaptiveIndices.length ?? 0) > 0;
		});

		if (replacedMetrics.length > 0) {
			warnings.push(
				`Calmer adaptive ${probe} measurements replaced the original outlier for: ${replacedMetrics.join(', ')}.`,
			);
		}
	}

	const lighthouseMeasurements = measurements.lighthouse.filter((measurement) => {
		return benchmarkMetricNames.some((metricName) => {
			const selection = metricSelections.get(metricName)!;

			return getBenchmarkMetricProbe(metricName) === 'lighthouse'
				&& selection.usedMeasurements.has(measurement);
		});
	});
	const representativeMeasurementIndex = findRepresentativeRunIndex(
		lighthouseMeasurements.map((measurement) => measurement.metrics),
		metrics,
	);
	const representativeMeasurement = lighthouseMeasurements[representativeMeasurementIndex]!;
	const representativeLhr = JSON.parse(
		readFileSync(path.join(outputDirectory, representativeMeasurement.artifactPath), 'utf8'),
	) as RunnerResult['lhr'];
	const report = ReportGenerator.generateReport(representativeLhr, 'html');

	if (typeof report !== 'string') {
		throw new TypeError(`Could not generate the representative HTML report for ${scenario.id}.`);
	}

	writeArtifact(reportPath, report);

	const probes = Object.fromEntries(benchmarkProbeNames.map((probe) => {
		const measurementSummaries: BenchmarkMeasurementSummary[] = measurements[probe].map((measurement) => {
			const relativeDeviations = Object.fromEntries(benchmarkMetricNames.flatMap((metricName) => {
				const value = measurement.metrics[metricName];
				const deviation = calculateRelativeDeviation(
					value ?? null,
					metrics[metricName]?.median,
				);

				return deviation === null ? [] : [[metricName, deviation]];
			}));
			const usedMetrics = benchmarkMetricNames.filter((metricName) => {
				return metricSelections.get(metricName)?.usedMeasurements.has(measurement) ?? false;
			});

			return {
				index: measurement.index,
				phase: measurement.phase,
				artifactPath: measurement.artifactPath,
				metrics: measurement.metrics,
				relativeDeviations,
				usedMetrics,
			};
		});
		const probeSummary: BenchmarkProbeSummary = {
			triggerMetrics: triggerMetrics[probe],
			measurements: measurementSummaries,
		};

		return [probe, probeSummary];
	})) as Record<BenchmarkProbeName, BenchmarkProbeSummary>;

	return {
		id: scenario.id,
		groupId: scenario.groupId,
		groupName: scenario.groupName,
		name: scenario.name,
		title: scenario.title,
		matrix: scenario.matrix,
		pagePath: scenario.pagePath,
		barePagePath: scenario.barePagePath,
		controlledPagePath: scenario.controlledPagePath,
		reportPath: scenario.reportPath,
		probes,
		metrics,
		warnings,
		renderingCheck,
	};
};

const getSvgCorpus = (): {
	files: string[];
	corpusHash: string;
	sequenceHash: string;
} => {
	const filePaths = globSync('.cache/public/svg/*.svg').toSorted();
	const icons = Object.fromEntries(filePaths.map((filePath) => {
		const name = path.basename(filePath, '.svg');
		return [name, readFileSync(filePath, 'utf8')];
	}));
	const corpus = filePaths
		.map((filePath) => `${path.basename(filePath)}\0${readFileSync(filePath, 'utf8')}`)
		.join('\0');
	const sequence = createBenchmarkIconSequence(icons);

	return {
		files: filePaths.map((filePath) => path.basename(filePath)),
		corpusHash: hashContents(corpus),
		sequenceHash: hashContents(sequence.join('\0')),
	};
};

const createManifest = (options: ManifestOptions): BenchmarkManifest => {
	const {
		generatedAt,
		runCount,
		probeMeasurementCounts,
		roundOrders,
		adaptiveRoundOrders,
		chromiumVersion,
	} = options;
	const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	const isWorkingTreeDirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '';

	return {
		schemaVersion: 4,
		generatedAt,
		commitSha,
		isWorkingTreeDirty,
		runCount,
		probeMeasurementCounts,
		roundOrders,
		adaptiveMeasurements: {
			additionalRunCount: ADAPTIVE_RUN_COUNT,
			madMultiplier: ADAPTIVE_OUTLIER_OPTIONS.madMultiplier,
			madConsistencyFactor: ADAPTIVE_OUTLIER_OPTIONS.madConsistencyFactor,
			minimumAbsoluteDeviation: ADAPTIVE_OUTLIER_OPTIONS.minimumAbsoluteDeviation,
			minimumRelativeDeviation: ADAPTIVE_OUTLIER_OPTIONS.minimumRelativeDeviation,
			triggerOutlierCount: 1,
			probeRoundOrders: adaptiveRoundOrders,
			selectionPolicy: ADAPTIVE_SELECTION_POLICY,
		},
		warmupScenarioId: WARMUP_SCENARIO_ID,
		versions: {
			node: process.version,
			chromium: chromiumVersion,
			lighthouse: lighthousePackage.version,
			packages: {
				'@puppeteer/browsers': puppeteerBrowsersPackage.version,
				'astro': astroPackage.version,
				'puppeteer-core': puppeteerPackage.version,
				'vue': vuePackage.version,
				'yauzl': yauzlPackage.version,
			},
		},
		platform: {
			os: `${os.platform()} ${os.release()}`,
			architecture: os.arch(),
		},
		lighthouse: {
			formFactor: 'mobile',
			throttlingMethod: LIGHTHOUSE_THROTTLING_METHOD,
			viewport: {
				width: 412,
				height: 823,
				deviceScaleFactor: 1.75,
			},
			throttling: {
				cpuSlowdownMultiplier: CPU_SLOWDOWN_MULTIPLIER,
			},
		},
		controlledMeasurements: {
			cpuSlowdownMultiplier: CPU_SLOWDOWN_MULTIPLIER,
			renderCachePolicy: 'Resources warmed in a fresh browser context before each controlled render.',
			renderWindowStart: `Immediately before inserting the ${BENCHMARK_ICON_COUNT}-icon payload after two animation frames.`,
			renderWindowEnd: 'After hydration, network idle and two rendered animation frames.',
		},
		cachePolicy: 'Lighthouse storage reset enabled before every navigation.',
		sourceSvg: getSvgCorpus(),
		server: {
			protocol: 'http',
			host: '127.0.0.1',
			port: SERVER_PORT,
			compression: true,
		},
		scenarioIds: benchmarkScenarios.map((scenario) => scenario.id),
	};
};

const verifyArtifacts = (
	outputDirectory: string,
	summary: BenchmarkSummary,
	manifest: BenchmarkManifest,
): void => {
	const expectedIds = benchmarkScenarios.map((scenario) => scenario.id);
	const summaryIds = summary.scenarios.map((scenario) => scenario.id);

	if (JSON.stringify(summaryIds) !== JSON.stringify(expectedIds)) {
		throw new Error('summary.json does not contain the canonical scenario matrix.');
	}

	if (JSON.stringify(manifest.scenarioIds) !== JSON.stringify(expectedIds)) {
		throw new Error('manifest.json does not contain the canonical scenario matrix.');
	}

	for (const scenario of summary.scenarios) {
		if (!scenario.renderingCheck.passed) {
			throw new Error(`${scenario.id} failed rendering validation.`);
		}

		const scenarioDirectory = path.join(outputDirectory, 'scenarios', scenario.id);
		const reportPath = path.join(scenarioDirectory, 'report.html');

		for (const probe of benchmarkProbeNames) {
			const expectedCount = summary.probeMeasurementCounts[probe];
			const probeSummary = scenario.probes[probe];
			const rawResults = globSync(path.join(scenarioDirectory, 'measurements', probe, '*.json'));

			if (probeSummary.measurements.length !== expectedCount) {
				throw new Error(
					`${scenario.id} contains ${probeSummary.measurements.length} ${probe} measurements instead of ${expectedCount}.`,
				);
			}

			if (rawResults.length !== expectedCount) {
				throw new Error(
					`${scenario.id} has ${rawResults.length} raw ${probe} artifacts instead of ${expectedCount}.`,
				);
			}
		}

		if (!existsSync(reportPath) || !/<!doctype html>/i.test(readFileSync(reportPath, 'utf8'))) {
			throw new Error(`${scenario.id} has no representative Lighthouse HTML report.`);
		}
	}
};

const restoreScenarioMeasurements = (
	scenario: BenchmarkScenarioSummary,
	reportsDirectory: string,
): ScenarioProbeMeasurements => {
	const measurements = createProbeMeasurements();

	for (const probe of benchmarkProbeNames) {
		measurements[probe] = scenario.probes[probe].measurements.map((measurement) => {
			let warnings: string[] = [];
			const legacyMetrics = measurement.metrics as LegacyRunMetrics;
			const { observedLoadEvent, ...currentMetrics } = legacyMetrics;
			let metrics: Partial<BenchmarkRunMetrics> = currentMetrics;

			if (probe === 'lighthouse') {
				const loadEvent = currentMetrics.loadEvent ?? observedLoadEvent;

				if (loadEvent === undefined) {
					throw new Error(`${scenario.id} has no Lighthouse-observed Load metric.`);
				}

				metrics = { ...currentMetrics, loadEvent };
				const lhr = JSON.parse(
					readFileSync(path.join(reportsDirectory, measurement.artifactPath), 'utf8'),
				) as RunnerResult['lhr'];

				warnings = lhr.runWarnings;
			}

			return {
				probe,
				index: measurement.index,
				phase: measurement.phase,
				metrics,
				artifactPath: measurement.artifactPath,
				warnings,
			};
		});
	}

	return measurements;
};

const getProbeMeasurementCounts = (
	scenarioMeasurements: Map<string, ScenarioProbeMeasurements>,
): Record<BenchmarkProbeName, number> => {
	return Object.fromEntries(benchmarkProbeNames.map((probe) => {
		const counts = [...scenarioMeasurements.values()].map((measurements) => {
			return measurements[probe].length;
		});
		const expectedCount = counts[0];

		if (expectedCount === undefined || counts.some((count) => count !== expectedCount)) {
			throw new Error(`Existing ${probe} measurement counts are inconsistent between scenarios.`);
		}

		return [probe, expectedCount];
	})) as Record<BenchmarkProbeName, number>;
};

const reaggregateReports = async (): Promise<void> => {
	if (!existsSync(REPORTS_DIRECTORY)) {
		throw new Error('Cannot reaggregate reports before a complete benchmark exists.');
	}

	const temporaryDirectory = mkdtempSync(path.resolve('.reports-reaggregate-'));
	const outputDirectory = path.join(temporaryDirectory, 'reports');
	let shouldPreserveOutputDirectory = false;

	try {
		cpSync(REPORTS_DIRECTORY, outputDirectory, { recursive: true });

		const existingSummary = JSON.parse(
			readFileSync(path.join(outputDirectory, 'summary.json'), 'utf8'),
		) as ReaggregatableBenchmarkSummary;
		const existingManifest = JSON.parse(
			readFileSync(path.join(outputDirectory, 'manifest.json'), 'utf8'),
		) as ReaggregatableBenchmarkManifest;

		if (
			(existingSummary.schemaVersion !== 3 && existingSummary.schemaVersion !== 4)
			|| (existingManifest.schemaVersion !== 3 && existingManifest.schemaVersion !== 4)
		) {
			throw new Error('Only schema version 3 or 4 reports can be reaggregated.');
		}

		const existingScenarios = new Map(existingSummary.scenarios.map((scenario) => {
			return [scenario.id, scenario];
		}));
		const scenarioIds = benchmarkScenarios.map((scenario) => scenario.id);
		const scenarioIdSet = new Set(scenarioIds);
		const filterRoundOrders = (roundOrders: string[][]): string[][] => {
			return roundOrders.map((roundOrder) => {
				return roundOrder.filter((scenarioId) => scenarioIdSet.has(scenarioId));
			});
		};
		const scenarioMeasurements = new Map<string, ScenarioProbeMeasurements>();

		for (const scenario of benchmarkScenarios) {
			const existingScenario = existingScenarios.get(scenario.id);

			if (!existingScenario) {
				throw new Error(`Existing reports do not contain ${scenario.id}.`);
			}

			scenarioMeasurements.set(
				scenario.id,
				restoreScenarioMeasurements(existingScenario, outputDirectory),
			);
		}

		const adaptiveTriggerMetrics = new Map<string, Record<BenchmarkProbeName, BenchmarkMetricName[]>>();

		for (const scenario of benchmarkScenarios) {
			adaptiveTriggerMetrics.set(
				scenario.id,
				getAdaptiveTriggerMetrics(
					scenarioMeasurements.get(scenario.id)!,
					existingSummary.runCount,
				),
			);
		}

		for (const probe of benchmarkProbeNames) {
			const isTriggered = benchmarkScenarios.some((scenario) => {
				return adaptiveTriggerMetrics.get(scenario.id)![probe].length > 0;
			});

			if (!isTriggered) continue;

			for (const scenario of benchmarkScenarios) {
				const adaptiveCount = scenarioMeasurements.get(scenario.id)![probe].filter((measurement) => {
					return measurement.phase === 'adaptive';
				}).length;

				if (adaptiveCount < ADAPTIVE_RUN_COUNT) {
					throw new Error(
						`The new ${probe} selection requires ${ADAPTIVE_RUN_COUNT} adaptive measurements, but ${scenario.id} has ${adaptiveCount}.`,
					);
				}
			}
		}

		const probeMeasurementCounts = getProbeMeasurementCounts(scenarioMeasurements);
		const scenarios = benchmarkScenarios.map((scenario) => {
			const existingScenario = existingScenarios.get(scenario.id)!;

			return createScenarioSummary(
				scenario,
				scenarioMeasurements.get(scenario.id)!,
				adaptiveTriggerMetrics.get(scenario.id)!,
				existingScenario.renderingCheck,
				outputDirectory,
			);
		});
		const summary: BenchmarkSummary = {
			...existingSummary,
			schemaVersion: 4,
			probeMeasurementCounts,
			scenarios,
		};
		const manifest: BenchmarkManifest = {
			...existingManifest,
			schemaVersion: 4,
			probeMeasurementCounts,
			roundOrders: filterRoundOrders(existingManifest.roundOrders),
			adaptiveMeasurements: {
				...existingManifest.adaptiveMeasurements,
				additionalRunCount: ADAPTIVE_RUN_COUNT,
				madMultiplier: ADAPTIVE_OUTLIER_OPTIONS.madMultiplier,
				madConsistencyFactor: ADAPTIVE_OUTLIER_OPTIONS.madConsistencyFactor,
				minimumAbsoluteDeviation: ADAPTIVE_OUTLIER_OPTIONS.minimumAbsoluteDeviation,
				minimumRelativeDeviation: ADAPTIVE_OUTLIER_OPTIONS.minimumRelativeDeviation,
				triggerOutlierCount: 1,
				probeRoundOrders: Object.fromEntries(benchmarkProbeNames.flatMap((probe) => {
					const orders = existingManifest.adaptiveMeasurements.probeRoundOrders[probe];
					return orders ? [[probe, filterRoundOrders(orders)]] : [];
				})),
				selectionPolicy: ADAPTIVE_SELECTION_POLICY,
			},
			controlledMeasurements: {
				cpuSlowdownMultiplier: existingManifest.controlledMeasurements.cpuSlowdownMultiplier,
				renderCachePolicy: existingManifest.controlledMeasurements.renderCachePolicy,
				renderWindowStart: existingManifest.controlledMeasurements.renderWindowStart,
				renderWindowEnd: existingManifest.controlledMeasurements.renderWindowEnd,
			},
			scenarioIds,
		};

		for (const scenarioDirectory of globSync(path.join(outputDirectory, 'scenarios', '*'))) {
			if (scenarioIdSet.has(path.basename(scenarioDirectory))) continue;
			rmSync(scenarioDirectory, { recursive: true, force: true });
		}

		for (const scenario of benchmarkScenarios) {
			rmSync(
				path.join(outputDirectory, 'scenarios', scenario.id, 'measurements', 'load'),
				{ recursive: true, force: true },
			);
		}

		writeArtifact(
			path.join(outputDirectory, 'summary.json'),
			JSON.stringify(summary, null, '\t'),
		);
		writeArtifact(
			path.join(outputDirectory, 'manifest.json'),
			JSON.stringify(manifest, null, '\t'),
		);
		verifyArtifacts(outputDirectory, summary, manifest);

		shouldPreserveOutputDirectory = true;
		await replaceDirectory(outputDirectory, REPORTS_DIRECTORY);
		shouldPreserveOutputDirectory = false;
		console.log('Reports reaggregated from existing raw measurements. Rebuilding the site...');
		await build({ root: process.cwd() });
		console.log('Report reaggregation completed.');
	} finally {
		if (shouldPreserveOutputDirectory) {
			process.emitWarning(`Verified reaggregated reports were preserved at ${outputDirectory}.`);
		} else {
			await removeDirectoryBestEffort(temporaryDirectory);
		}
	}
};

const runBenchmark = async (): Promise<void> => {
	const mode: BenchmarkMode = process.argv.includes('--smoke') ? 'smoke' : 'full';
	const runCount = mode === 'smoke' ? 1 : FULL_RUN_COUNT;
	const outputDirectory = mkdtempSync(path.resolve('.reports-next-'));
	const scenarioMeasurements = new Map<string, ScenarioProbeMeasurements>(
		benchmarkScenarios.map((scenario) => [scenario.id, createProbeMeasurements()]),
	);
	const adaptiveTriggerMetrics = new Map<string, Record<BenchmarkProbeName, BenchmarkMetricName[]>>();
	const renderingChecks = new Map<string, BenchmarkRenderingCheck>();
	const roundOrders: string[][] = [];
	const adaptiveRoundOrders: Partial<Record<BenchmarkProbeName, string[][]>> = {};
	let browser: Browser | undefined;
	let server: Awaited<ReturnType<typeof startServer>> | undefined;
	let shouldPreserveOutputDirectory = false;
	const closeBenchmarkResources = async (): Promise<void> => {
		const resources = [
			...(browser ? [{ name: 'Chromium', closePromise: browser.close() }] : []),
			...(server ? [{ name: 'benchmark server', closePromise: server.close() }] : []),
		];

		browser = undefined;
		server = undefined;

		const results = await Promise.allSettled(resources.map((resource) => resource.closePromise));

		for (const [index, result] of results.entries()) {
			if (result.status === 'rejected') {
				process.emitWarning(`Could not close ${resources[index]!.name}: ${String(result.reason)}`);
			}
		}
	};

	try {
		console.log(`Building ${benchmarkScenarios.length} benchmark scenarios and their controlled pages...`);
		await build({ root: process.cwd() });
		verifyBuiltScenarioPages();

		server = await startServer(SERVER_PORT);
		const chromePath = await getBrowserExecutablePath();
		browser = await puppeteer.launch({
			executablePath: chromePath,
			headless: true,
			args: [
				'--headless=new',
				'--no-sandbox',
				'--no-first-run',
			],
		});
		const browserPort = getBrowserPort(browser);
		const chromiumVersion = await browser.version();

		console.log('Validating rendered icons...');

		for (const [index, scenario] of benchmarkScenarios.entries()) {
			console.log(`  ${index + 1}/${benchmarkScenarios.length} ${scenario.id}`);
			renderingChecks.set(
				scenario.id,
				await validateScenarioRendering(browser, server.origin, scenario),
			);
		}

		console.log('Running the warm-up...');

		const warmupScenario = benchmarkScenarios.find((scenario) => scenario.id === WARMUP_SCENARIO_ID);

		if (!warmupScenario) {
			throw new Error(`Warm-up scenario ${WARMUP_SCENARIO_ID} is missing from the catalog.`);
		}

		console.log(`  ${warmupScenario.id}`);
		await runLighthouse(server.origin, browserPort, warmupScenario);
		await measureControlledRender(
			browser,
			server.origin,
			warmupScenario,
			CPU_SLOWDOWN_MULTIPLIER,
		);

		for (let round = 1; round <= runCount; round++) {
			const scenarios = shuffleScenarios();
			roundOrders.push(scenarios.map((scenario) => scenario.id));
			console.log(`Running mandatory round ${round}/${runCount}...`);

			for (const [index, scenario] of scenarios.entries()) {
				console.log(`  ${index + 1}/${scenarios.length} ${scenario.id}`);

				for (const probe of benchmarkProbeNames) {
					const measurement = await runProbeMeasurement({
						browser,
						host: server.origin,
						browserPort,
						scenario,
						probe,
						index: round,
						phase: 'base',
						outputDirectory,
					});

					scenarioMeasurements.get(scenario.id)![probe].push(measurement);
				}
			}
		}

		for (const scenario of benchmarkScenarios) {
			adaptiveTriggerMetrics.set(
				scenario.id,
				getAdaptiveTriggerMetrics(scenarioMeasurements.get(scenario.id)!, runCount),
			);
		}

		const triggeredProbes = mode === 'full'
			? benchmarkProbeNames.filter((probe) => {
				return benchmarkScenarios.some((scenario) => {
					return adaptiveTriggerMetrics.get(scenario.id)![probe].length > 0;
				});
			})
			: [];

		for (const probe of triggeredProbes) {
			adaptiveRoundOrders[probe] = [];
			console.log(`Running ${ADAPTIVE_RUN_COUNT} adaptive ${probe} measurements...`);

			for (let adaptiveRound = 1; adaptiveRound <= ADAPTIVE_RUN_COUNT; adaptiveRound++) {
				const scenarios = shuffleScenarios();
				const measurementIndex = runCount + adaptiveRound;

				adaptiveRoundOrders[probe].push(scenarios.map((scenario) => scenario.id));
				console.log(`  Adaptive ${probe} round ${adaptiveRound}/${ADAPTIVE_RUN_COUNT}...`);

				for (const [index, scenario] of scenarios.entries()) {
					console.log(`    ${index + 1}/${scenarios.length} ${scenario.id}`);
					const measurement = await runProbeMeasurement({
						browser,
						host: server.origin,
						browserPort,
						scenario,
						probe,
						index: measurementIndex,
						phase: 'adaptive',
						outputDirectory,
					});

					scenarioMeasurements.get(scenario.id)![probe].push(measurement);
				}
			}
		}

		const probeMeasurementCounts = Object.fromEntries(benchmarkProbeNames.map((probe) => {
			return [probe, runCount + (triggeredProbes.includes(probe) ? ADAPTIVE_RUN_COUNT : 0)];
		})) as Record<BenchmarkProbeName, number>;
		const generatedAt = new Date().toISOString();
		const scenarios = benchmarkScenarios.map((scenario) => {
			return createScenarioSummary(
				scenario,
				scenarioMeasurements.get(scenario.id)!,
				adaptiveTriggerMetrics.get(scenario.id)!,
				renderingChecks.get(scenario.id)!,
				outputDirectory,
			);
		});
		const summary: BenchmarkSummary = {
			schemaVersion: 4,
			generatedAt,
			iconCount: BENCHMARK_ICON_COUNT,
			runCount,
			probeMeasurementCounts,
			environment: {
				lighthouseVersion: lighthousePackage.version,
				chromiumVersion,
				cpuSlowdownMultiplier: CPU_SLOWDOWN_MULTIPLIER,
			},
			scenarios,
		};
		const manifest = createManifest({
			generatedAt,
			runCount,
			probeMeasurementCounts,
			roundOrders,
			adaptiveRoundOrders,
			chromiumVersion,
		});

		writeArtifact(
			path.join(outputDirectory, 'summary.json'),
			JSON.stringify(summary, null, '\t'),
		);
		writeArtifact(
			path.join(outputDirectory, 'manifest.json'),
			JSON.stringify(manifest, null, '\t'),
		);
		verifyArtifacts(outputDirectory, summary, manifest);

		if (mode === 'smoke') {
			console.log('Smoke benchmark completed; release reports were not replaced.');
			return;
		}

		shouldPreserveOutputDirectory = true;
		await closeBenchmarkResources();
		await replaceDirectory(outputDirectory, REPORTS_DIRECTORY);
		shouldPreserveOutputDirectory = false;
		console.log('Reports published. Rebuilding the site with summary.json...');
		await build({ root: process.cwd() });
		console.log('Full benchmark completed.');
	} finally {
		await closeBenchmarkResources();

		if (shouldPreserveOutputDirectory) {
			process.emitWarning(`Verified benchmark reports were preserved at ${outputDirectory}.`);
		} else {
			await removeDirectoryBestEffort(outputDirectory);
		}
	}
};

const startedAt = performance.now();

try {
	if (process.argv.includes('--reaggregate')) {
		await reaggregateReports();
	} else {
		await runBenchmark();
	}
} finally {
	const elapsedSeconds = Math.round((performance.now() - startedAt) / 1000);
	const elapsedMinutes = Math.floor(elapsedSeconds / 60);
	const remainingSeconds = elapsedSeconds % 60;
	const formattedDuration = elapsedMinutes === 0
		? `${remainingSeconds}s`
		: `${elapsedMinutes}m ${remainingSeconds}s`;

	console.log(`Benchmark duration: ${formattedDuration}.`);
}
