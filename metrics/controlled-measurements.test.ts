import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateWindowBlockingTime } from './controlled-measurements';

describe('Controlled measurements', () => {
	it('Calculates blocking portions inside the controlled window', () => {
		assert.equal(
			calculateWindowBlockingTime(
				[
					{ startTime: 0, duration: 100 },
					{ startTime: 100, duration: 100 },
					{ startTime: 250, duration: 100 },
				],
				75,
				175,
			),
			50,
		);
	});

	it('Ignores tasks that do not exceed the long-task threshold', () => {
		assert.equal(
			calculateWindowBlockingTime(
				[
					{ startTime: 10, duration: 50 },
					{ startTime: 70, duration: 20 },
				],
				0,
				100,
			),
			0,
		);
	});
});
