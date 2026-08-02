import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
	BENCHMARK_ICON_COUNT,
	benchmarkScenarios,
} from './scenarios';
import type { BenchmarkSummary } from './report-contracts';

const SUMMARY_PATH = path.resolve('reports/summary.json');

/**
 * Reads the latest publishable benchmark summary when it exists.
 *
 * @returns   Parsed benchmark data, or null before the first current complete series.
 */
const readBenchmarkSummary = (): BenchmarkSummary | null => {
	if (!existsSync(SUMMARY_PATH)) return null;

	const summary = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8')) as {
		schemaVersion?: unknown;
	};

	if (summary.schemaVersion !== 4) return null;

	const benchmarkSummary = summary as BenchmarkSummary;
	const scenarioIds = benchmarkSummary.scenarios.map((scenario) => scenario.id);
	const expectedScenarioIds = benchmarkScenarios.map((scenario) => scenario.id);

	if (benchmarkSummary.iconCount !== BENCHMARK_ICON_COUNT) return null;
	if (JSON.stringify(scenarioIds) !== JSON.stringify(expectedScenarioIds)) return null;
	return benchmarkSummary;
};

export { readBenchmarkSummary };
