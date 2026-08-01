import { createStackedSprite, fetchAllSvg } from '#utils';

export const GET = () => {
	return new Response(createStackedSprite(fetchAllSvg()), {
		headers: { 'content-type': 'image/svg+xml' },
	});
};
