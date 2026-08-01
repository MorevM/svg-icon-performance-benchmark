export const svgToBase64 = (svg: string) => {
	const base64string = Buffer.from(svg).toString('base64');
	return `data:image/svg+xml;base64,${base64string}`;
};
