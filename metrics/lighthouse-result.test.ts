import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getMethodSpecificRequestCount } from './lighthouse-result';

describe('Lighthouse result', () => {
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
