import path from 'node:path';

export const fetchAllSvg = () => {
	const allSvgGlob = import.meta.glob('~public/svg/*.svg', {
		base: '/.cache/public',
		eager: true,
		query: 'raw',
	});
	return Object.entries(allSvgGlob).reduce<Record<string, string>>((acc, [iconPath, content]) => {
		acc[path.basename(iconPath).replace(/\..*$/, '')] = (content as any).default;
		return acc;
	}, {});
};
