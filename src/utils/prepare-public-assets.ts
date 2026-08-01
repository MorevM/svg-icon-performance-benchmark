import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';

/**
 * Creates the public asset directory and optimizes its canonical SVG corpus.
 *
 * @param   sourceDirectory   Source assets kept in the repository.
 * @param   outputDirectory   Generated assets served by Astro.
 */
export const preparePublicAssets = (sourceDirectory: URL, outputDirectory: URL): void => {
	rmSync(outputDirectory, { recursive: true, force: true });
	cpSync(sourceDirectory, outputDirectory, { recursive: true });

	const svgDirectory = new URL('./svg/', outputDirectory);
	const iconFileNames = readdirSync(svgDirectory)
		.filter((fileName) => fileName.endsWith('.svg'))
		.toSorted();

	for (const fileName of iconFileNames) {
		const fileUrl = new URL(fileName, svgDirectory);
		const filePath = fileURLToPath(fileUrl);
		const optimizedSvg = optimize(readFileSync(fileUrl, 'utf8'), { path: filePath }).data;

		writeFileSync(fileUrl, optimizedSvg);
	}
};
