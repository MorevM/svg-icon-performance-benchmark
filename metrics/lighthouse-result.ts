import type { Result as LighthouseResult } from 'lighthouse';
import type { BenchmarkRunMetrics } from '~benchmark/report-contracts';

type LighthouseMetrics = {
	firstContentfulPaint?: number;
	interactive?: number;
	totalBlockingTime?: number;
	speedIndex?: number;
	observedLoad?: number;
	maxPotentialFID?: number;
};

type MainThreadEntry = {
	group?: string;
	duration?: number;
};

type NetworkEntry = {
	resourceType?: string;
	transferSize?: number;
	resourceSize?: number;
	url?: string;
};

const getMethodSpecificRequestCount = (entries: NetworkEntry[]): number => {
	return entries.filter((entry) => {
		const isHttpRequest = /^https?:\/\//.test(entry.url ?? '');
		const isSharedPageResource = entry.resourceType === 'Document'
			|| entry.resourceType === 'Stylesheet';

		return isHttpRequest && !isSharedPageResource;
	}).length;
};

const toFiniteNumber = (value: number | null | undefined): number | null => {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const getAuditItems = <T>(lhr: LighthouseResult, auditId: string): T[] => {
	const details = lhr.audits[auditId]?.details as { items?: T[] } | undefined;
	return details?.items ?? [];
};

const getMainThreadDuration = (entries: MainThreadEntry[], group: string): number => {
	return entries.find((entry) => entry.group === group)?.duration ?? 0;
};

/**
 * Extracts the metrics retained by summary.json from a Lighthouse result.
 *
 * @param   lhr   Lighthouse result for one scenario run.
 *
 * @returns       Normalized benchmark metrics.
 */
const extractBenchmarkMetrics = (lhr: LighthouseResult): BenchmarkRunMetrics => {
	const metrics = getAuditItems<LighthouseMetrics>(lhr, 'metrics')[0] ?? {};
	const mainThreadEntries = getAuditItems<MainThreadEntry>(lhr, 'mainthread-work-breakdown');
	const networkEntries = getAuditItems<NetworkEntry>(lhr, 'network-requests');
	const document = networkEntries.find((entry) => entry.resourceType === 'Document');

	return {
		firstContentfulPaint: toFiniteNumber(metrics.firstContentfulPaint),
		timeToInteractive: toFiniteNumber(metrics.interactive),
		totalBlockingTime: null,
		lighthouseTotalBlockingTime: toFiniteNumber(metrics.totalBlockingTime),
		speedIndex: toFiniteNumber(metrics.speedIndex),
		loadEvent: toFiniteNumber(metrics.observedLoad),
		parseHtml: getMainThreadDuration(mainThreadEntries, 'parseHTML'),
		styleAndLayout: getMainThreadDuration(mainThreadEntries, 'styleLayout'),
		paintCompositeAndRender: getMainThreadDuration(mainThreadEntries, 'paintCompositeRender'),
		totalMainThreadTime: toFiniteNumber(lhr.audits['mainthread-work-breakdown']?.numericValue),
		scriptEvaluation: getMainThreadDuration(mainThreadEntries, 'scriptEvaluation'),
		domNodes: toFiniteNumber(
			lhr.audits['dom-size-insight']?.numericValue
			?? lhr.audits['dom-size']?.numericValue,
		),
		requests: getMethodSpecificRequestCount(networkEntries),
		transferSize: toFiniteNumber(lhr.audits['total-byte-weight']?.numericValue),
		documentSize: toFiniteNumber(document?.resourceSize),
		javascriptTransferSize: networkEntries
			.filter((entry) => entry.resourceType === 'Script')
			.reduce((total, entry) => total + (entry.transferSize ?? 0), 0),
		performanceScore: toFiniteNumber(
			lhr.categories.performance?.score === null
			|| lhr.categories.performance?.score === undefined
				? null
				: lhr.categories.performance.score * 100,
		),
		maxPotentialFid: toFiniteNumber(metrics.maxPotentialFID),
	};
};

export {
	extractBenchmarkMetrics,
	getMethodSpecificRequestCount,
};
