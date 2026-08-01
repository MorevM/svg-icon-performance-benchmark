// Slightly customized and minified version of https://github.com/tigt/mini-svg-data-uri

const reUrlHexPairs = /%[\dA-F]{2}/g;
const hexDecode = { '%20': ' ', '%3D': '=', '%3A': ':', '%2F': '/' } as Record<string, string>;
const specialHexDecode = (match: string) => hexDecode[match] ?? match.toLowerCase();

export const svgToDataUri = (svg: string) => {
	// Strip out BOM character
	if (svg.codePointAt(0) === 0xFEFF) svg = svg.slice(1);
	// Remove repeating spaces
	svg = svg.trim().replaceAll(/\s+/g, ' ');
	// Encode the content
	svg = encodeURIComponent(svg);
	// De-encode unnecessary parts
	svg = svg.replaceAll(reUrlHexPairs, specialHexDecode);

	return `data:image/svg+xml,${svg}`;
};
