import { describe, expect, it } from 'vitest';
import { taskGroup, taskStatusDates } from './tasks';

describe('one-off task rules', () => {
	it('sets closure timestamps only for the current terminal state', () => {
		const now = new Date('2026-09-28T12:00:00Z');
		expect(taskStatusDates('done', now)).toEqual({ completedAt: now, cancelledAt: null });
		expect(taskStatusDates('cancelled', now)).toEqual({ completedAt: null, cancelledAt: now });
		expect(taskStatusDates('todo', now)).toEqual({ completedAt: null, cancelledAt: null });
	});

	it('groups open tasks without changing their planned dates', () => {
		const today = '2026-09-28';
		expect(taskGroup({ status: 'todo', scheduledDate: '2026-09-27', dueDate: null }, today)).toBe(
			'late'
		);
		expect(taskGroup({ status: 'todo', scheduledDate: null, dueDate: '2026-09-29' }, today)).toBe(
			'upcoming'
		);
		expect(taskGroup({ status: 'todo', scheduledDate: null, dueDate: null }, today)).toBe(
			'unscheduled'
		);
		expect(taskGroup({ status: 'in_progress', scheduledDate: null, dueDate: null }, today)).toBe(
			'in_progress'
		);
		expect(
			taskGroup(
				{ status: 'todo', scheduledDate: today, scheduledTime: '09:00', dueDate: null },
				today,
				'10:00'
			)
		).toBe('late');
		expect(
			taskGroup(
				{ status: 'in_progress', projectStatus: 'paused', scheduledDate: today, dueDate: null },
				today
			)
		).toBe('upcoming');
	});
});
