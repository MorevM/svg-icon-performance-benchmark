const BENCHMARK_ICON_COUNT = 1000;
const SHOWCASE_ICON_COUNTS = [BENCHMARK_ICON_COUNT, 5000, 20_000] as const;

/**
 * Identifies whether a scenario belongs to the primary comparison or the separate Vue matrix.
 */
type BenchmarkMatrix = 'main' | 'bonus';

/**
 * Selects the markup implementation used by a benchmark scenario.
 */
type BenchmarkRenderer =
	| 'img-icon'
	| 'img-icon-lazy'
	| 'img-stacked-sprite'
	| 'img-data-uri'
	| 'img-base64'
	| 'inline-html'
	| 'external-symbol-sprite'
	| 'inlined-symbol-sprite'
	| 'background-icon'
	| 'background-stacked-sprite'
	| 'background-data-uri'
	| 'background-base64'
	| 'mask-icon'
	| 'mask-stacked-sprite'
	| 'mask-data-uri'
	| 'mask-base64'
	| 'vue-inline-svg-components'
	| 'vue-inlined-symbol-sprite';

/**
 * Describes one benchmark page and its report identity.
 */
type BenchmarkScenario = {
	/**
	 * Stable identifier used in generated artifacts.
	 */
	id: string;

	/**
	 * Identifier of the navigation and report group.
	 */
	groupId: string;

	/**
	 * Human-readable group name.
	 */
	groupName: string;

	/**
	 * Short scenario name used in navigation.
	 */
	name: string;

	/**
	 * Compact method name used in comparison tables.
	 */
	comparisonName: string;

	/**
	 * Page heading without the icon count suffix.
	 */
	title: string;

	/**
	 * Comparison matrix containing the scenario.
	 */
	matrix: BenchmarkMatrix;

	/**
	 * Markup implementation rendered on the page.
	 */
	renderer: BenchmarkRenderer;

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
};

/**
 * Groups related scenarios for navigation and presentation.
 */
type BenchmarkScenarioGroup = {
	/**
	 * Stable group identifier.
	 */
	id: string;

	/**
	 * Human-readable group name.
	 */
	name: string;

	/**
	 * Comparison matrix containing the group.
	 */
	matrix: BenchmarkMatrix;

	/**
	 * Scenarios shown inside the group.
	 */
	scenarios: BenchmarkScenario[];
};

type ScenarioInput = Pick<
	BenchmarkScenario,
	'name' | 'comparisonName' | 'title' | 'renderer'
> & {
	code: string;
};

type ScenarioGroupInput = Pick<BenchmarkScenarioGroup, 'id' | 'name' | 'matrix'> & {
	scenarios: ScenarioInput[];
};

const scenarioGroupInputs: ScenarioGroupInput[] = [
	{
		id: 'img',
		name: 'Image tag',
		matrix: 'main',
		scenarios: [
			{
				code: 'source-from-icon',
				name: 'Source from icon',
				comparisonName: '<img /> (icon)',
				title: 'Source from icon',
				renderer: 'img-icon',
			},
			{
				code: 'source-from-icon-lazy',
				name: 'Source from icon (lazy)',
				comparisonName: '<img /> (icon, lazy)',
				title: 'Source from icon with lazy loading',
				renderer: 'img-icon-lazy',
			},
			{
				code: 'source-from-sprite',
				name: 'Source from sprite',
				comparisonName: '<img /> (sprite)',
				title: 'Source from sprite',
				renderer: 'img-stacked-sprite',
			},
			{
				code: 'source-from-data-uri',
				name: 'Source from data URI',
				comparisonName: '<img /> (data URI)',
				title: 'Source from data URI',
				renderer: 'img-data-uri',
			},
			{
				code: 'source-from-base64',
				name: 'Source from base64',
				comparisonName: '<img /> (base64)',
				title: 'Source from base64',
				renderer: 'img-base64',
			},
		],
	},
	{
		id: 'inline',
		name: 'Inline SVG',
		matrix: 'main',
		scenarios: [
			{
				code: 'as-html',
				name: 'As pure HTML',
				comparisonName: 'Inline SVG',
				title: 'Inline SVG as HTML',
				renderer: 'inline-html',
			},
		],
	},
	{
		id: 'sprite',
		name: 'SVG sprite',
		matrix: 'main',
		scenarios: [
			{
				code: 'external',
				name: 'External symbol sprite',
				comparisonName: 'SVG Sprite (external)',
				title: 'External SVG symbol sprite',
				renderer: 'external-symbol-sprite',
			},
			{
				code: 'inlined',
				name: 'Inlined symbol sprite',
				comparisonName: 'SVG Sprite (inlined)',
				title: 'Inlined SVG symbol sprite',
				renderer: 'inlined-symbol-sprite',
			},
		],
	},
	{
		id: 'background-image',
		name: 'background-image',
		matrix: 'main',
		scenarios: [
			{
				code: 'source-from-icon',
				name: 'Source from icon',
				comparisonName: 'background-image (icon)',
				title: 'background-image with source from an icon',
				renderer: 'background-icon',
			},
			{
				code: 'source-from-sprite',
				name: 'Source from sprite',
				comparisonName: 'background-image (sprite)',
				title: 'background-image with source from a sprite',
				renderer: 'background-stacked-sprite',
			},
			{
				code: 'source-as-data-uri',
				name: 'Source as data URI',
				comparisonName: 'background-image (data URI)',
				title: 'background-image with source from data URI',
				renderer: 'background-data-uri',
			},
			{
				code: 'source-as-base64',
				name: 'Source as base64',
				comparisonName: 'background-image (base64)',
				title: 'background-image with source from base64',
				renderer: 'background-base64',
			},
		],
	},
	{
		id: 'mask-image',
		name: 'mask-image',
		matrix: 'main',
		scenarios: [
			{
				code: 'source-from-icon',
				name: 'Source from icon',
				comparisonName: 'mask-image (icon)',
				title: 'mask-image with source from an icon',
				renderer: 'mask-icon',
			},
			{
				code: 'source-from-sprite',
				name: 'Source from sprite',
				comparisonName: 'mask-image (sprite)',
				title: 'mask-image with source from a sprite',
				renderer: 'mask-stacked-sprite',
			},
			{
				code: 'source-as-data-uri',
				name: 'Source as data URI',
				comparisonName: 'mask-image (data URI)',
				title: 'mask-image with source from data URI',
				renderer: 'mask-data-uri',
			},
			{
				code: 'source-as-base64',
				name: 'Source as base64',
				comparisonName: 'mask-image (base64)',
				title: 'mask-image with source from base64',
				renderer: 'mask-base64',
			},
		],
	},
	{
		id: 'vue',
		name: 'Extra',
		matrix: 'bonus',
		scenarios: [
			{
				code: 'inline-svg-components',
				name: 'Vue (inline SVG)',
				comparisonName: 'Inline SVG',
				title: 'Vue with inline SVG components',
				renderer: 'vue-inline-svg-components',
			},
			{
				code: 'inlined-symbol-sprite',
				name: 'Vue (inlined sprite)',
				comparisonName: 'SVG Sprite',
				title: 'Vue with an inlined SVG symbol sprite',
				renderer: 'vue-inlined-symbol-sprite',
			},
		],
	},
];

const benchmarkScenarioGroups: BenchmarkScenarioGroup[] = scenarioGroupInputs.map((group) => {
	return {
		id: group.id,
		name: group.name,
		matrix: group.matrix,
		scenarios: group.scenarios.map((scenario) => {
			const id = `${group.id}-${scenario.code}`;
			const pagePath = `/${group.id}/${scenario.code}/${BENCHMARK_ICON_COUNT}/`;

			return {
				id,
				groupId: group.id,
				groupName: group.name,
				name: scenario.name,
				comparisonName: scenario.comparisonName,
				title: scenario.title,
				matrix: group.matrix,
				renderer: scenario.renderer,
				pagePath,
				barePagePath: `${pagePath}bare/`,
				controlledPagePath: `${pagePath}controlled/`,
				reportPath: `/reports/scenarios/${id}/report.html`,
			};
		}),
	};
});

const benchmarkScenarios = benchmarkScenarioGroups.flatMap((group) => group.scenarios);

/**
 * Resolves a manual showcase path without changing the measured scenario identity.
 *
 * @param   scenario    Scenario whose page should be opened.
 * @param   iconCount   Number of icons rendered by the showcase page.
 *
 * @returns             Absolute path of the requested showcase page.
 *
 * @throws When the showcase path does not contain the benchmark icon count.
 */
const getScenarioPagePath = (scenario: BenchmarkScenario, iconCount: number): string => {
	const benchmarkPathSuffix = `/${BENCHMARK_ICON_COUNT}/`;

	if (!scenario.pagePath.endsWith(benchmarkPathSuffix)) {
		throw new Error(`Unexpected showcase page path: ${scenario.pagePath}`);
	}

	return `${scenario.pagePath.slice(0, -benchmarkPathSuffix.length)}/${iconCount}/`;
};

/**
 * Resolves a bare benchmark path for a specific showcase size.
 *
 * @param   scenario    Scenario whose bare page should be opened.
 * @param   iconCount   Number of icons rendered by the bare page.
 *
 * @returns             Absolute path of the requested bare page.
 */
const getScenarioBarePagePath = (scenario: BenchmarkScenario, iconCount: number): string => {
	return `${getScenarioPagePath(scenario, iconCount)}bare/`;
};

export {
	BENCHMARK_ICON_COUNT,
	benchmarkScenarioGroups,
	benchmarkScenarios,
	getScenarioBarePagePath,
	getScenarioPagePath,
	SHOWCASE_ICON_COUNTS,
};
export type {
	BenchmarkMatrix,
	BenchmarkRenderer,
	BenchmarkScenario,
	BenchmarkScenarioGroup,
};
