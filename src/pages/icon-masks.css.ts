import { fetchAllSvg, svgToDataUri } from '#utils';

export const GET = () => {
	const icons = fetchAllSvg();
	const declarations = Object.keys(icons).toSorted().map((iconName) => {
		return `\t--icon-${iconName}: url('${svgToDataUri(icons[iconName]!)}');`;
	});

	return new Response(`:root {\n${declarations.join('\n')}\n}\n`, {
		headers: { 'content-type': 'text/css; charset=utf-8' },
	});
};
