import { BENCHMARK_ICON_COUNT } from '~benchmark/scenarios';
import type { Browser } from 'puppeteer-core';
import type { BenchmarkRenderingCheck } from '~benchmark/report-contracts';
import type { BenchmarkScenario } from '~benchmark/scenarios';

const getGridSelector = (scenario: BenchmarkScenario): string => {
	return scenario.matrix === 'bonus' ? '.vue-icons-grid > li' : '.icons-grid__item';
};

/**
 * Checks that a scenario rendered the expected number of visible icons.
 *
 * @param   browser    Browser connected to the Lighthouse Chromium instance.
 * @param   host       Origin serving the built benchmark pages.
 * @param   scenario   Scenario to validate.
 *
 * @returns            Rendering check stored in summary.json.
 */
const validateScenarioRendering = async (
	browser: Browser,
	host: string,
	scenario: BenchmarkScenario,
): Promise<BenchmarkRenderingCheck> => {
	const page = await browser.newPage();

	try {
		await page.setViewport({
			width: 412,
			height: 823,
			deviceScaleFactor: 1.75,
			isMobile: true,
			hasTouch: true,
		});

		const gridSelector = getGridSelector(scenario);
		await page.goto(new URL(scenario.barePagePath, host).href, {
			waitUntil: 'networkidle0',
			timeout: 60_000,
		});
		await page.waitForFunction(
			(selector, expectedCount) => document.querySelectorAll(selector).length === expectedCount,
			{ timeout: 30_000 },
			gridSelector,
			BENCHMARK_ICON_COUNT,
		);

		const result = await page.evaluate(
			({ expectedCount, renderer, selector }) => {
				const items = [...document.querySelectorAll<HTMLElement>(selector)];
				let invalidItems = 0;

				for (const item of items) {
					if (renderer.startsWith('img-')) {
						const image = item.querySelector<HTMLImageElement>('img');

						if (renderer === 'img-icon-lazy') {
							const bounds = image?.getBoundingClientRect();
							const isVisible = bounds
								? bounds.bottom >= 0 && bounds.top <= window.innerHeight
								: false;

							if (
								image?.loading !== 'lazy'
								|| (isVisible && (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0))
							) {
								invalidItems++;
							}

							continue;
						}

						if (!image?.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
							invalidItems++;
						}

						continue;
					}

					if (
						renderer === 'inline-html'
						|| renderer.includes('symbol-sprite')
						|| renderer.startsWith('vue-')
					) {
						const svg = item.querySelector<SVGGraphicsElement>('svg');

						if (!svg) {
							invalidItems++;
							continue;
						}

						const bounds = svg.getBBox();

						if (bounds.width === 0 || bounds.height === 0) {
							invalidItems++;
						}

						continue;
					}

					const styles = getComputedStyle(item.firstElementChild ?? item);
					const imageValue = renderer.startsWith('background-')
						? styles.backgroundImage
						: styles.maskImage;

					if (!imageValue || imageValue === 'none') invalidItems++;
				}

				return {
					itemCount: items.length,
					invalidItems,
					passed: items.length === expectedCount && invalidItems === 0,
				};
			},
			{
				expectedCount: BENCHMARK_ICON_COUNT,
				renderer: scenario.renderer,
				selector: gridSelector,
			},
		);

		const screenshot = await page.screenshot({
			type: 'png',
			captureBeyondViewport: false,
		});
		const messages: string[] = [];

		if (result.itemCount !== BENCHMARK_ICON_COUNT) {
			messages.push(`Expected ${BENCHMARK_ICON_COUNT} items, received ${result.itemCount}.`);
		}

		if (result.invalidItems > 0) {
			messages.push(`${result.invalidItems} icons failed their rendering assertion.`);
		}

		if (screenshot.byteLength === 0) {
			messages.push('The control screenshot is empty.');
		}

		return {
			passed: result.passed && screenshot.byteLength > 0,
			messages,
		};
	} finally {
		await page.close();
	}
};

export { validateScenarioRendering };
