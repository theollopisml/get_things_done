import { describe, expect, it } from 'vitest';
import { groupHomeTasks, homeGroup, type HomeTask } from './home';

const today = '2026-09-29';
const nowTime = '14:00';
const base: HomeTask = {
	status: 'todo',
	scheduledDate: null,
	scheduledTime: null,
	dueDate: null,
	dueTime: null
};

describe('Home task groups', () => {
	it('shows past dates and elapsed times in Late', () => {
		expect(homeGroup({ ...base, scheduledDate: '2026-09-28' }, today, nowTime)).toBe('late');
		expect(homeGroup({ ...base, dueDate: today, dueTime: '13:59' }, today, nowTime)).toBe('late');
		expect(
			homeGroup({ ...base, scheduledDate: today, dueDate: '2026-09-28' }, today, nowTime)
		).toBe('late');
	});

	it('shows dates without an elapsed time in Today', () => {
		expect(homeGroup({ ...base, scheduledDate: today }, today, nowTime)).toBe('today');
		expect(homeGroup({ ...base, dueDate: today, dueTime: '14:00' }, today, nowTime)).toBe('today');
		expect(homeGroup({ ...base, dueDate: today, dueTime: '15:00' }, today, nowTime)).toBe('today');
	});

	it('shows only ordinary active work in In Progress', () => {
		expect(homeGroup({ ...base, status: 'in_progress' }, today, nowTime)).toBe('in_progress');
		expect(
			homeGroup({ ...base, status: 'in_progress', projectStatus: 'paused' }, today, nowTime)
		).toBeNull();
		expect(homeGroup(base, today, nowTime)).toBeNull();
		expect(homeGroup({ ...base, dueDate: '2026-09-30' }, today, nowTime)).toBeNull();
	});

	it('keeps paused work only in temporal groups and hides closed work', () => {
		expect(homeGroup({ ...base, projectStatus: 'paused', dueDate: today }, today, nowTime)).toBe(
			'today'
		);
		expect(
			homeGroup({ ...base, projectStatus: 'paused', scheduledDate: '2026-09-28' }, today, nowTime)
		).toBe('late');
		for (const projectStatus of ['done', 'cancelled']) {
			expect(homeGroup({ ...base, projectStatus, dueDate: today }, today, nowTime)).toBeNull();
		}
		for (const status of ['done', 'cancelled'] as const) {
			expect(homeGroup({ ...base, status, dueDate: today }, today, nowTime)).toBeNull();
		}
	});

	it('places each Task once, giving Late and Today priority over In Progress', () => {
		const tasks = [
			{ ...base, id: 'late', status: 'in_progress' as const, dueDate: '2026-09-28' },
			{ ...base, id: 'today', status: 'in_progress' as const, scheduledDate: today },
			{ ...base, id: 'progress', status: 'in_progress' as const }
		];
		const groups = groupHomeTasks(tasks, today, nowTime);
		expect(groups.late.map((task) => task.id)).toEqual(['late']);
		expect(groups.today.map((task) => task.id)).toEqual(['today']);
		expect(groups.in_progress.map((task) => task.id)).toEqual(['progress']);
	});
});
