import { describe, expect, it } from 'vitest';
import {
	getFirstRecurrenceDateAfter,
	getNextRecurrenceDate,
	matchesRecurrenceDate,
	recurrenceRuleSchema
} from './recurrence';

describe('recurrence dates', () => {
	it('keeps daily intervals anchored through early and late completion', () => {
		const rule = { frequency: 'daily', interval: 3 } as const;
		expect(
			getNextRecurrenceDate({
				rule,
				anchorDate: '2026-09-01',
				currentScheduledDate: '2026-09-07',
				completionDate: '2026-09-06'
			})
		).toBe('2026-09-10');
		expect(
			getNextRecurrenceDate({
				rule,
				anchorDate: '2026-09-01',
				currentScheduledDate: '2026-09-04',
				completionDate: '2026-09-20'
			})
		).toBe('2026-09-22');
	});

	it('uses selected weekdays and the anchor week for N-week rules', () => {
		const rule = { frequency: 'weekly', interval: 2, weekdays: [1, 4] } as const;
		expect(
			matchesRecurrenceDate({ ...rule, weekdays: [...rule.weekdays] }, '2026-09-07', '2026-09-10')
		).toBe(true);
		expect(
			getFirstRecurrenceDateAfter(
				{ ...rule, weekdays: [...rule.weekdays] },
				'2026-09-07',
				'2026-09-10'
			)
		).toBe('2026-09-21');
		expect(
			getNextRecurrenceDate({
				rule: { ...rule, weekdays: [...rule.weekdays] },
				anchorDate: '2026-09-07',
				currentScheduledDate: '2026-09-21',
				completionDate: '2026-09-20'
			})
		).toBe('2026-09-24');
	});

	it('preserves the monthly day through short months and leap years', () => {
		const rule = { frequency: 'monthly', interval: 1, day: 31 } as const;
		expect(getFirstRecurrenceDateAfter(rule, '2027-01-31', '2027-01-31')).toBe('2027-02-28');
		expect(getFirstRecurrenceDateAfter(rule, '2027-01-31', '2027-02-28')).toBe('2027-03-31');
		expect(getFirstRecurrenceDateAfter(rule, '2028-01-31', '2028-01-31')).toBe('2028-02-29');
		expect(getFirstRecurrenceDateAfter(rule, '2028-01-31', '2028-03-31')).toBe('2028-04-30');
	});

	it('ignores a postponed date when finding the next rule match', () => {
		const rule = { frequency: 'weekly' as const, interval: 1, weekdays: [1] };
		expect(
			getNextRecurrenceDate({
				rule,
				anchorDate: '2026-09-14',
				currentScheduledDate: '2026-09-15',
				completionDate: '2026-09-15'
			})
		).toBe('2026-09-21');
	});

	it('rejects unsupported or empty rules', () => {
		expect(
			recurrenceRuleSchema.safeParse({ frequency: 'weekly', interval: 1, weekdays: [] }).success
		).toBe(false);
		expect(
			recurrenceRuleSchema.safeParse({ frequency: 'weekly', interval: 1, weekdays: [1, 1] }).success
		).toBe(false);
		expect(recurrenceRuleSchema.safeParse({ frequency: 'yearly', interval: 1 }).success).toBe(
			false
		);
	});
});
