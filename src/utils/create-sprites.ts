import { optimize } from 'svgo';
import type { Config } from 'svgo';

type OptimizedIcon = {
	name: string;
	content: string;
};

const getIconSvgoConfig = (iconName: string): Config => {
	return {
		plugins: [
			{
				name: 'preset-default',
				params: {
					overrides: {
						inlineStyles: { onlyMatchedOnce: false },
					},
				},
			},
			{ name: 'removeXMLNS' },
			{ name: 'removeDimensions' },
			{
				name: 'removeAttrs',
				params: {
					attrs: ['svg:id', 'svg:fill:none'],
				},
			},
			{
				name: 'prefixIds',
				params: {
					prefix: () => iconName,
				},
			},
		],
	};
};

const optimizeIcons = (icons: Record<string, string>): OptimizedIcon[] => {
	return Object.entries(icons)
		.toSorted(([firstName], [secondName]) => firstName.localeCompare(secondName))
		.map(([name, content]) => {
			return {
				name,
				content: optimize(content, getIconSvgoConfig(name)).data,
			};
		});
};

/**
 * Creates a sprite intended for external and inlined `use` references.
 *
 * @param   icons   Source SVG contents keyed by icon name.
 *
 * @returns         A complete SVG symbol sprite.
 */
export const createSymbolSprite = (icons: Record<string, string>): string => {
	const symbols = optimizeIcons(icons).map(({ name, content }) => {
		return content
			.replace('<svg', `<symbol id="${name}"`)
			.replace('</svg>', '</symbol>');
	});

	return [
		'<svg xmlns="http://www.w3.org/2000/svg">',
		...symbols,
		'</svg>',
	].join('\n');
};

/**
 * Creates a hash-addressable sprite intended to be loaded as an image.
 *
 * @param   icons   Source SVG contents keyed by icon name.
 *
 * @returns         A complete stacked SVG sprite.
 */
export const createStackedSprite = (icons: Record<string, string>): string => {
	const fragments = optimizeIcons(icons).map(({ name, content }) => {
		return content.replace('<svg', `<svg id="${name}"`);
	});

	return [
		'<svg xmlns="http://www.w3.org/2000/svg">',
		'<style>:root>svg{display:none}:root>svg:target{display:block}</style>',
		...fragments,
		'</svg>',
	].join('\n');
};
