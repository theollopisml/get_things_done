import { describe, expect, it } from 'vitest';
import { shortcutDueDate, takeDueCommand } from './quick-task-date';

describe('quick Task due dates', () => {
	it('uses the local calendar day and the Sunday ending the current week', () => {
		expect(shortcutDueDate('today', new Date(2026, 8, 29, 23, 30))).toBe('2026-09-29');
		expect(shortcutDueDate('thisweek', new Date(2026, 8, 29))).toBe('2026-10-04');
		expect(shortcutDueDate('thisweek', new Date(2026, 9, 4))).toBe('2026-10-04');
	});

	it('handles month and year boundaries', () => {
		expect(shortcutDueDate('thismonth', new Date(2028, 1, 2))).toBe('2028-02-29');
		expect(shortcutDueDate('thisyear', new Date(2026, 0, 1))).toBe('2026-12-31');
	});

	it('takes a completed leading command without eating the Task title', () => {
		expect(takeDueCommand('/today Écrire le rapport')).toEqual({
			command: 'today',
			rest: 'Écrire le rapport'
		});
		expect(takeDueCommand('/date ')).toEqual({ command: 'date', rest: '' });
		expect(takeDueCommand('/today')).toBeNull();
		expect(takeDueCommand('/today\nÉcrire le rapport')).toBeNull();
		expect(takeDueCommand('Écrire /today')).toBeNull();
	});
});
