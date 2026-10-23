import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	compareCalverVersions,
	formatCalverTag,
	formatCalverVersion,
	getNextVersion,
	parseCalverVersion,
	planRelease,
	sortCalverVersions,
	utcDateParts,
} from '../scripts/release-calver.mjs';

describe('parseCalverVersion', () => {
	it('parses October 23 with counter 00 and 01', () => {
		assert.deepEqual(parseCalverVersion('2026.10.2300'), {
			year: 2026,
			month: 10,
			day: 23,
			counter: 0,
			version: '2026.10.2300',
		});
		assert.deepEqual(parseCalverVersion('v2026.10.2301')?.counter, 1);
	});

	it('parses January 5 with counter 00 (patch 500)', () => {
		assert.deepEqual(parseCalverVersion('2027.1.500'), {
			year: 2027,
			month: 1,
			day: 5,
			counter: 0,
			version: '2027.1.500',
		});
	});

	it('parses day 5 in October (patch 500 vs 2300)', () => {
		assert.deepEqual(parseCalverVersion('2026.10.500')?.day, 5);
		assert.deepEqual(parseCalverVersion('2026.10.2300')?.day, 23);
	});
});

describe('formatCalverVersion', () => {
	it('formats first release on 2026-10-23 UTC', () => {
		const now = new Date('2026-10-23T15:00:00.000Z');
		assert.equal(formatCalverVersion(now, 0), '2026.10.2300');
		assert.equal(formatCalverTag(formatCalverVersion(now, 0)), 'v2026.10.2300');
	});

	it('formats January 5 without leading zero on month', () => {
		const now = new Date('2027-01-05T12:00:00.000Z');
		assert.deepEqual(utcDateParts(now), { year: 2027, month: 1, day: 5 });
		assert.equal(formatCalverVersion(now, 0), '2027.1.500');
	});
});

describe('getNextVersion', () => {
	it('starts at counter 00 when no tags exist for that UTC day', () => {
		const now = new Date('2026-10-23T00:00:00.000Z');
		assert.equal(getNextVersion([], now), '2026.10.2300');
	});

	it('increments the same-day counter', () => {
		const now = new Date('2026-10-23T18:00:00.000Z');
		const tags = ['v2026.10.2300'];
		assert.equal(getNextVersion(tags, now), '2026.10.2301');
	});

	it('ignores tags from other days when computing the counter', () => {
		const now = new Date('2026-10-24T00:00:00.000Z');
		const tags = ['v2026.10.2300', 'v2026.10.2301'];
		assert.equal(getNextVersion(tags, now), '2026.10.2400');
	});

	it('uses UTC, not local timezone', () => {
		const now = new Date('2027-01-05T23:30:00.000Z');
		assert.equal(getNextVersion(['v2027.1.500'], now), '2027.1.501');
	});
});

describe('sortCalverVersions', () => {
	it('orders by year, month, and patch', () => {
		const sorted = sortCalverVersions(['2027.1.500', '2026.10.2301', '2026.10.2300', 'v2026.9.100']);
		assert.deepEqual(sorted, ['2026.9.100', '2026.10.2300', '2026.10.2301', '2027.1.500']);
	});
});

describe('compareCalverVersions', () => {
	it('compares patch components numerically', () => {
		assert.ok(compareCalverVersions('2026.10.500', '2026.10.2300') < 0);
		assert.ok(compareCalverVersions('2026.10.2301', '2026.10.2300') > 0);
	});
});

describe('planRelease', () => {
	it('reports no changes when commit log is empty', () => {
		const plan = planRelease({
			tags: ['v2026.10.2300'],
			commitLog: '',
			now: new Date('2026-10-23T12:00:00.000Z'),
		});
		assert.equal(plan.hasChanges, false);
	});

	it('plans the next tag when commits exist', () => {
		const plan = planRelease({
			tags: ['v2026.10.2300'],
			commitLog: 'abc123\tfeat(cli): add widgets',
			now: new Date('2026-10-23T20:00:00.000Z'),
			lastAnnotatedTag: 'v2026.10.2300',
		});
		assert.equal(plan.hasChanges, true);
		assert.equal(plan.nextVersion, '2026.10.2301');
		assert.equal(plan.nextTag, 'v2026.10.2301');
	});

	it('uses lastAnnotatedTag only for change detection, not CalVer counter', () => {
		const plan = planRelease({
			tags: [],
			commitLog: 'abc123\tfix: patch',
			now: new Date('2026-10-23T20:00:00.000Z'),
			lastAnnotatedTag: 'v0.2.1',
		});
		assert.equal(plan.hasChanges, true);
		assert.equal(plan.nextVersion, '2026.10.2300');
	});
});
