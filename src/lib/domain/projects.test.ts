import { describe, expect, it } from 'vitest';
import { isProjectToBuild, projectStatusChange, type ProjectStatus } from './projects';

describe('Project status transitions', () => {
	const now = new Date('2026-09-29T12:00:00Z');

	it('records the first activation and preserves it after reopening', () => {
		const activated = projectStatusChange({ status: 'planned', startedAt: null }, 'active', now);
		expect(activated).toEqual({ status: 'active', startedAt: now, completedAt: null });
		const later = new Date('2026-10-01T12:00:00Z');
		expect(projectStatusChange({ status: 'done', startedAt: now }, 'active', later)).toEqual({
			status: 'active',
			startedAt: now,
			completedAt: null
		});
	});

	it('sets completion only while done and leaves planned dates out of transitions', () => {
		expect(projectStatusChange({ status: 'planned', startedAt: null }, 'done', now)).toEqual({
			status: 'done',
			startedAt: null,
			completedAt: now
		});
		expect(projectStatusChange({ status: 'active', startedAt: now }, 'paused', now)).toEqual({
			status: 'paused',
			startedAt: now,
			completedAt: null
		});
	});

	it('rejects transitions outside the Project lifecycle', () => {
		const invalid: [ProjectStatus, ProjectStatus][] = [
			['planned', 'paused'],
			['done', 'planned'],
			['cancelled', 'active'],
			['active', 'active']
		];
		for (const [status, next] of invalid) {
			expect(projectStatusChange({ status, startedAt: null }, next, now)).toBeNull();
		}
	});

	it('marks only empty open Projects as TO_BUILD', () => {
		expect(isProjectToBuild({ status: 'planned', taskCount: 0, checkpointCount: 0 })).toBe(true);
		expect(isProjectToBuild({ status: 'paused', taskCount: 0, checkpointCount: 0 })).toBe(true);
		expect(isProjectToBuild({ status: 'active', taskCount: 1, checkpointCount: 0 })).toBe(false);
		expect(isProjectToBuild({ status: 'active', taskCount: 0, checkpointCount: 1 })).toBe(false);
		expect(isProjectToBuild({ status: 'done', taskCount: 0, checkpointCount: 0 })).toBe(false);
	});
});
