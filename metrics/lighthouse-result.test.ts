import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	extractBenchmarkMetrics,
	getMethodSpecificRequestCount,
} from './lighthouse-result';

describe('Lighthouse result', () => {
	it('Uses the observed Lighthouse load event as the published Load metric', () => {
		const metrics = extractBenchmarkMetrics({
			audits: {
				metrics: {
					details: {
						items: [{ observedLoad: 1234 }],
					},
				},
			},
			categories: {
				performance: { score: 1 },
			},
		} as unknown as Parameters<typeof extractBenchmarkMetrics>[0]);

		assert.equal(metrics.loadEvent, 1234);
	});

	it('Excludes shared page resources and embedded data URLs', () => {
		assert.equal(
			getMethodSpecificRequestCount([
				{ resourceType: 'Document', url: 'http://localhost/page/' },
				{ resourceType: 'Stylesheet', url: 'http://localhost/page.css' },
				{ resourceType: 'Image', url: 'data:image/svg+xml,<svg></svg>' },
				{ resourceType: 'Image', url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
			]),
			0,
		);
	});

	it('Counts method-specific HTTP resources', () => {
		assert.equal(
			getMethodSpecificRequestCount([
				{ resourceType: 'Other', url: 'http://localhost/sprite.svg' },
				{ resourceType: 'Image', url: 'https://example.com/icon.svg' },
				{ resourceType: 'Script', url: 'http://localhost/vue.js' },
			]),
			3,
		);
	});
});
