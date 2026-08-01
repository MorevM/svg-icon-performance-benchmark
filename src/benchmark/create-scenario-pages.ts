import { stripIndent } from '@morev/utils';
import { createSymbolSprite, fetchAllSvg, svgToBase64, svgToDataUri, withBasePath } from '#utils';
import { createBenchmarkIconSequence } from './icon-sequence';
import {
	BENCHMARK_ICON_COUNT,
	benchmarkScenarios,
	getScenarioBarePagePath,
	getScenarioPagePath,
	SHOWCASE_ICON_COUNTS,
} from './scenarios';
import type { BenchmarkRenderer, BenchmarkScenario } from './scenarios';

/**
 * Selects the shell and insertion behavior of a generated scenario page.
 */
type BenchmarkPageKind = 'showcase' | 'bare' | 'controlled';

/**
 * Props passed to one generated benchmark page.
 */
type BenchmarkPageProps = {
	/**
	 * Catalog entry represented by the page.
	 */
	scenario: BenchmarkScenario;

	/**
	 * Shell and insertion behavior used by the generated page.
	 */
	kind: BenchmarkPageKind;

	/**
	 * Markup used by non-Vue scenarios.
	 */
	itemsMarkup: string[];

	/**
	 * Shared icon names used by Vue scenarios.
	 */
	iconNames: string[];

	/**
	 * Optional scenario-specific stylesheet.
	 */
	styles?: string;

	/**
	 * Optional markup placed before the icons grid.
	 */
	extraContent?: string;

};

/**
 * Static route definition returned to Astro.
 */
type BenchmarkPageDefinition = {
	/**
	 * Dynamic route parameters.
	 */
	params: {
		/**
		 * Route path without leading or trailing slashes.
		 */
		path: string;
	};

	/**
	 * Data rendered by the benchmark page.
	 */
	props: BenchmarkPageProps;
};

const backgroundStyles = stripIndent(`
	.background-image {
		width: 24px;
		height: 24px;
		background-image: var(--background-image);
	}
`);

const maskStyles = stripIndent(`
	.mask-image {
		width: 24px;
		height: 24px;
		mask-image: var(--mask-image);
		background-color: #000000;
	}

	.mask-image:hover {
		background-color: red;
	}
`);

const svgStyles = stripIndent(`
	svg { fill: currentColor; }
	svg:hover { color: red; }
`);

const getIconSource = (iconName: string): string => withBasePath(`/svg/${iconName}.svg`);
const getStackedSpriteSource = (iconName: string): string => withBasePath(`/stacked-sprite.svg#${iconName}`);
const getSymbolSpriteSource = (iconName: string): string => withBasePath(`/symbol-sprite.svg#${iconName}`);

const createItemsMarkup = (
	renderer: BenchmarkRenderer,
	iconNames: string[],
	icons: Record<string, string>,
): string[] => {
	switch (renderer) {
		case 'img-icon':
			return iconNames.map((iconName) => {
				return `<img src="${getIconSource(iconName)}" width="24" height="24" alt="" />`;
			});

		case 'img-icon-lazy':
			return iconNames.map((iconName) => {
				return `<img src="${getIconSource(iconName)}" width="24" height="24" loading="lazy" alt="" />`;
			});

		case 'img-stacked-sprite':
			return iconNames.map((iconName) => {
				return `<img src="${getStackedSpriteSource(iconName)}" width="24" height="24" alt="" />`;
			});

		case 'img-data-uri':
			return iconNames.map((iconName) => {
				return `<img src="${svgToDataUri(icons[iconName]!)}" width="24" height="24" alt="" />`;
			});

		case 'img-base64':
			return iconNames.map((iconName) => {
				return `<img src="${svgToBase64(icons[iconName]!)}" width="24" height="24" alt="" />`;
			});

		case 'inline-html':
			return iconNames.map((iconName) => icons[iconName]!);

		case 'external-symbol-sprite':
			return iconNames.map((iconName) => {
				return stripIndent(`
					<svg width="24" height="24">
						<use href="${getSymbolSpriteSource(iconName)}" />
					</svg>
				`);
			});

		case 'inlined-symbol-sprite':
			return iconNames.map((iconName) => {
				return stripIndent(`
					<svg width="24" height="24">
						<use href="#${iconName}" />
					</svg>
				`);
			});

		case 'background-icon':
			return iconNames.map((iconName) => {
				return `<div class="background-image" style="--background-image: url('${getIconSource(iconName)}')"></div>`;
			});

		case 'background-stacked-sprite':
			return iconNames.map((iconName) => {
				return `<div class="background-image" style="--background-image: url('${getStackedSpriteSource(iconName)}')"></div>`;
			});

		case 'background-data-uri':
			return iconNames.map((iconName) => {
				return `<div class="background-image" style="--background-image: url('${svgToDataUri(icons[iconName]!)}')"></div>`;
			});

		case 'background-base64':
			return iconNames.map((iconName) => {
				return `<div class="background-image" style="--background-image: url('${svgToBase64(icons[iconName]!)}')"></div>`;
			});

		case 'mask-icon':
			return iconNames.map((iconName) => {
				return `<div class="mask-image" style="--mask-image: url('${getIconSource(iconName)}')"></div>`;
			});

		case 'mask-stacked-sprite':
			return iconNames.map((iconName) => {
				return `<div class="mask-image" style="--mask-image: url('${getStackedSpriteSource(iconName)}')"></div>`;
			});

		case 'mask-data-uri':
			return iconNames.map((iconName) => {
				return `<div class="mask-image" style="--mask-image: url('${svgToDataUri(icons[iconName]!)}')"></div>`;
			});

		case 'mask-base64':
			return iconNames.map((iconName) => {
				return `<div class="mask-image" style="--mask-image: url('${svgToBase64(icons[iconName]!)}')"></div>`;
			});

		case 'vue-inline-svg-components':
		case 'vue-inlined-symbol-sprite':
			return [];

		default:
			throw new Error('Unsupported benchmark renderer.');
	}
};

const getStyles = (renderer: BenchmarkRenderer): string | undefined => {
	if (renderer.startsWith('background-')) return backgroundStyles;
	if (renderer.startsWith('mask-')) return maskStyles;

	if (
		renderer === 'inline-html'
		|| renderer === 'external-symbol-sprite'
		|| renderer === 'inlined-symbol-sprite'
	) {
		return svgStyles;
	}

	return undefined;
};

const createBenchmarkPages = (): BenchmarkPageDefinition[] => {
	const icons = fetchAllSvg();
	const iconNamesByCount = new Map<number, string[]>(SHOWCASE_ICON_COUNTS.map((iconCount) => {
		return [iconCount, createBenchmarkIconSequence(icons, iconCount)] as const;
	}));
	const inlinedSymbolSprite = createSymbolSprite(icons).replace('<svg ', '<svg hidden ');

	return benchmarkScenarios.flatMap((scenario) => {
		const styles = getStyles(scenario.renderer);
		const extraContent = (
			scenario.renderer === 'inlined-symbol-sprite'
			|| scenario.renderer === 'vue-inlined-symbol-sprite'
		)
			? inlinedSymbolSprite
			: undefined;
		const createProps = (iconCount: number, kind: BenchmarkPageKind): BenchmarkPageProps => {
			const iconNames = iconNamesByCount.get(iconCount)!;

			return {
				scenario,
				itemsMarkup: createItemsMarkup(scenario.renderer, iconNames, icons),
				iconNames,
				kind,
				...(styles !== undefined && { styles }),
				...(extraContent !== undefined && { extraContent }),
			};
		};
		const publicPages = SHOWCASE_ICON_COUNTS.flatMap((iconCount) => {
			return [
				{
					params: {
						path: getScenarioPagePath(scenario, iconCount).slice(1, -1),
					},
					props: createProps(iconCount, 'showcase'),
				},
				{
					params: {
						path: getScenarioBarePagePath(scenario, iconCount).slice(1, -1),
					},
					props: createProps(iconCount, 'bare'),
				},
			];
		});

		return [
			...publicPages,
			{
				params: {
					path: scenario.controlledPagePath.slice(1, -1),
				},
				props: createProps(BENCHMARK_ICON_COUNT, 'controlled'),
			},
		];
	});
};

export { createBenchmarkPages };
export type { BenchmarkPageDefinition, BenchmarkPageKind, BenchmarkPageProps };
