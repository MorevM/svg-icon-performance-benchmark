import { BENCHMARK_ICON_COUNT } from './scenarios';

/**
 * Builds the shared icon sequence used by every scenario.
 *
 * The sorted source list is repeated because the corpus contains fewer icons than a benchmark page.
 *
 * @param   icons       Source SVG contents keyed by icon name.
 * @param   iconCount   Required sequence length.
 *
 * @returns             A deterministic sequence containing exactly the requested icon count.
 *
 * @throws When no source icons are available.
 */
export const createBenchmarkIconSequence = (
	icons: Record<string, string>,
	iconCount = BENCHMARK_ICON_COUNT,
): string[] => {
	const iconNames = Object.keys(icons).toSorted();

	if (iconNames.length === 0) {
		throw new Error('Cannot create a benchmark sequence without source SVG files.');
	}

	return Array.from({ length: iconCount }, (_, index) => iconNames[index % iconNames.length]!);
};
