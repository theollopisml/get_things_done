import { describe, expect, it } from 'vitest';
import { canChangeVisionStatus, type VisionStatus } from './visions';

describe('Vision status transitions', () => {
	it('allows pausing, archiving and reactivating', () => {
		const allowed: [VisionStatus, VisionStatus][] = [
			['active', 'paused'],
			['paused', 'active'],
			['active', 'archived'],
			['paused', 'archived'],
			['archived', 'active']
		];
		for (const [current, next] of allowed) {
			expect(canChangeVisionStatus(current, next)).toBe(true);
		}
	});

	it('rejects no-op transitions and archived to paused', () => {
		const invalid: [VisionStatus, VisionStatus][] = [
			['active', 'active'],
			['paused', 'paused'],
			['archived', 'archived'],
			['archived', 'paused']
		];
		for (const [current, next] of invalid) {
			expect(canChangeVisionStatus(current, next)).toBe(false);
		}
	});
});
