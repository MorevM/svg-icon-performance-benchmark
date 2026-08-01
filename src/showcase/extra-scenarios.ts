const EXTRA_SHOWCASE_ICON_COUNT = 50;

/**
 * Markup mechanism used by a showcase-only scenario.
 */
type ExtraShowcaseRenderer = 'embed' | 'object' | 'iframe';

/**
 * Describes a scenario that is visible in the showcase but excluded from benchmark measurements.
 */
type ExtraShowcaseScenario = {
	/**
	 * Route segment identifying the scenario.
	 */
	code: string;

	/**
	 * Short name used in navigation.
	 */
	name: string;

	/**
	 * Page heading without the icon count suffix.
	 */
	title: string;

	/**
	 * Markup mechanism rendered by the page.
	 */
	renderer: ExtraShowcaseRenderer;

	/**
	 * Absolute path of the only generated page.
	 */
	pagePath: string;
};

const extraShowcaseScenarios: ExtraShowcaseScenario[] = [
	{
		code: 'embed',
		name: 'embed',
		title: 'SVG icons with <embed>',
		renderer: 'embed',
		pagePath: '/extra/embed/',
	},
	{
		code: 'object',
		name: 'object',
		title: 'SVG icons with <object>',
		renderer: 'object',
		pagePath: '/extra/object/',
	},
	{
		code: 'iframe',
		name: 'iframe',
		title: 'SVG icons with <iframe>',
		renderer: 'iframe',
		pagePath: '/extra/iframe/',
	},
];

export {
	EXTRA_SHOWCASE_ICON_COUNT,
	extraShowcaseScenarios,
};
export type {
	ExtraShowcaseRenderer,
	ExtraShowcaseScenario,
};
