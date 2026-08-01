import { PredefinedNetworkConditions } from 'puppeteer-core';
import { BENCHMARK_ICON_COUNT } from '~benchmark/scenarios';
import type { Browser, Page } from 'puppeteer-core';
import type { BenchmarkScenario } from '~benchmark/scenarios';

/**
 * One browser long task intersected with the controlled rendering window.
 */
type LongTaskMeasurement = {
	/**
	 * Task start relative to navigation start, in milliseconds.
	 */
	startTime: number;

	/**
	 * Full task duration, in milliseconds.
	 */
	duration: number;
};

/**
 * Measurements collected outside Lighthouse for one scenario run.
 */
type ControlledMeasurements = {
	/**
	 * Cold navigation measured with real CPU and network throttling.
	 */
	navigation: {
		/**
		 * Window load event end relative to navigation start, in milliseconds.
		 */
		loadEvent: number;
	};

	/**
	 * Warm-cache icon insertion measured after the shell has painted.
	 */
	render: {
		/**
		 * Sum of long-task blocking portions inside the controlled window.
		 */
		totalBlockingTime: number;

		/**
		 * Controlled window start relative to navigation start, in milliseconds.
		 */
		startTime: number;

		/**
		 * Controlled window end relative to navigation start, in milliseconds.
		 */
		endTime: number;

		/**
		 * Long tasks reported by Chromium during the controlled page lifetime.
		 */
		longTasks: LongTaskMeasurement[];
	};
};

type BrowserMeasurementState = {
	longTasks: LongTaskMeasurement[];
	isLongTaskObserverSupported: boolean;
};

const setMobileViewport = async (page: Page): Promise<void> => {
	await page.setViewport({
		width: 412,
		height: 823,
		deviceScaleFactor: 1.75,
		isMobile: true,
		hasTouch: true,
	});
};

const waitForHydration = async (page: Page, scenario: BenchmarkScenario): Promise<void> => {
	if (scenario.matrix !== 'bonus') return;

	await page.waitForFunction(() => {
		return [...document.querySelectorAll('astro-island')].every((island) => {
			return !island.hasAttribute('ssr');
		});
	}, { timeout: 30_000 });
};

/**
 * Calculates blocking time without coupling the measurement window to FCP or TTI.
 *
 * @param   tasks       Browser long tasks.
 * @param   startTime   Controlled window start, in milliseconds.
 * @param   endTime     Controlled window end, in milliseconds.
 *
 * @returns             Total blocking time inside the controlled window.
 */
const calculateWindowBlockingTime = (
	tasks: LongTaskMeasurement[],
	startTime: number,
	endTime: number,
): number => {
	return tasks.reduce((total, task) => {
		const blockingStart = Math.max(task.startTime + 50, startTime);
		const blockingEnd = Math.min(task.startTime + task.duration, endTime);

		return total + Math.max(blockingEnd - blockingStart, 0);
	}, 0);
};

const measureThrottledLoad = async (
	browser: Browser,
	url: string,
	cpuSlowdownMultiplier: number,
): Promise<number> => {
	const context = await browser.createBrowserContext();

	try {
		const page = await context.newPage();
		await setMobileViewport(page);
		await page.setCacheEnabled(false);
		await page.emulateCPUThrottling(cpuSlowdownMultiplier);
		await page.emulateNetworkConditions(PredefinedNetworkConditions['Slow 4G']);
		await page.goto(url, {
			waitUntil: 'load',
			timeout: 60_000,
		});
		await page.waitForFunction(() => {
			const navigation = performance.getEntriesByType('navigation')[0];
			return navigation instanceof PerformanceNavigationTiming && navigation.loadEventEnd > 0;
		});

		const loadEvent = await page.evaluate(() => {
			const navigation = performance.getEntriesByType('navigation')[0];

			if (!(navigation instanceof PerformanceNavigationTiming)) return null;
			return navigation.loadEventEnd;
		});

		if (loadEvent === null || !Number.isFinite(loadEvent) || loadEvent <= 0) {
			throw new Error('Controlled navigation did not produce a valid load event.');
		}

		return loadEvent;
	} finally {
		await context.close();
	}
};

const measureControlledRender = async (
	browser: Browser,
	host: string,
	scenario: BenchmarkScenario,
	cpuSlowdownMultiplier: number,
): Promise<ControlledMeasurements['render']> => {
	const context = await browser.createBrowserContext();

	try {
		const page = await context.newPage();
		await setMobileViewport(page);
		await page.goto(new URL(scenario.barePagePath, host).href, {
			waitUntil: 'networkidle0',
			timeout: 60_000,
		});
		await waitForHydration(page, scenario);
		await page.evaluateOnNewDocument(() => {
			const state: BrowserMeasurementState = {
				longTasks: [],
				isLongTaskObserverSupported: PerformanceObserver.supportedEntryTypes.includes('longtask'),
			};
			const benchmarkWindow = window as typeof window & {
				__benchmarkMeasurementState?: BrowserMeasurementState;
			};

			benchmarkWindow.__benchmarkMeasurementState = state;

			if (!state.isLongTaskObserverSupported) return;

			const observer = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					state.longTasks.push({
						startTime: entry.startTime,
						duration: entry.duration,
					});
				}
			});
			observer.observe({ type: 'longtask', buffered: true });
		});
		await page.emulateCPUThrottling(cpuSlowdownMultiplier);
		await page.goto(new URL(scenario.controlledPagePath, host).href, {
			waitUntil: 'load',
			timeout: 60_000,
		});
		await page.waitForFunction(() => {
			const benchmarkWindow = window as typeof window & {
				__benchmarkRenderStart?: number;
			};
			return Number.isFinite(benchmarkWindow.__benchmarkRenderStart);
		}, { timeout: 30_000 });
		await page.waitForFunction(
			(expectedCount) => {
				return document.querySelectorAll('#benchmark-target li').length === expectedCount;
			},
			{ timeout: 30_000 },
			BENCHMARK_ICON_COUNT,
		);
		await waitForHydration(page, scenario);
		await page.waitForNetworkIdle({
			idleTime: 500,
			timeout: 60_000,
		});

		const result = await page.evaluate(async () => {
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			});

			const endTime = performance.now();

			await new Promise<void>((resolve) => setTimeout(resolve, 0));

			const benchmarkWindow = window as typeof window & {
				__benchmarkMeasurementState?: BrowserMeasurementState;
				__benchmarkRenderStart?: number;
			};

			return {
				endTime,
				startTime: benchmarkWindow.__benchmarkRenderStart,
				state: benchmarkWindow.__benchmarkMeasurementState,
			};
		});

		if (
			result.startTime === undefined
			|| !result.state?.isLongTaskObserverSupported
		) {
			throw new Error('Controlled rendering requires PerformanceObserver long-task support.');
		}

		return {
			totalBlockingTime: calculateWindowBlockingTime(
				result.state.longTasks,
				result.startTime,
				result.endTime,
			),
			startTime: result.startTime,
			endTime: result.endTime,
			longTasks: result.state.longTasks,
		};
	} finally {
		await context.close();
	}
};

/**
 * Measures stable load and blocking windows separately from Lighthouse.
 *
 * @param   browser                 Shared Chromium instance.
 * @param   host                    Origin serving benchmark pages.
 * @param   scenario                Scenario to measure.
 * @param   cpuSlowdownMultiplier   Real DevTools CPU throttling rate.
 *
 * @returns                         Controlled navigation and render measurements.
 */
const measureControlledMetrics = async (
	browser: Browser,
	host: string,
	scenario: BenchmarkScenario,
	cpuSlowdownMultiplier: number,
): Promise<ControlledMeasurements> => {
	const loadEvent = await measureThrottledLoad(
		browser,
		new URL(scenario.barePagePath, host).href,
		cpuSlowdownMultiplier,
	);
	const render = await measureControlledRender(
		browser,
		host,
		scenario,
		cpuSlowdownMultiplier,
	);

	return {
		navigation: {
			loadEvent,
		},
		render,
	};
};

export {
	calculateWindowBlockingTime,
	measureControlledMetrics,
	measureControlledRender,
	measureThrottledLoad,
};
export type {
	ControlledMeasurements,
	LongTaskMeasurement,
};
