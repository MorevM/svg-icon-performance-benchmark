import { createSymbolSprite, fetchAllSvg } from '#utils';

export const GET = () => {
	return new Response(createSymbolSprite(fetchAllSvg()), {
		headers: { 'content-type': 'image/svg+xml' },
	});
};
