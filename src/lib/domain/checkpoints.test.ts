import { describe, expect, it } from 'vitest';
import { checkpointStatusChange } from './checkpoints';

describe('Checkpoint status transitions', () => {
	const now = new Date('2026-09-29T12:00:00Z');

	it('records completion and clears it on reopen', () => {
		expect(checkpointStatusChange('open', 'done', now)).toEqual({
			status: 'done',
			completedAt: now
		});
		expect(checkpointStatusChange('done', 'open', now)).toEqual({
			status: 'open',
			completedAt: null
		});
	});

	it('cancels without a completion timestamp and rejects unsupported transitions', () => {
		expect(checkpointStatusChange('open', 'cancelled', now)).toEqual({
			status: 'cancelled',
			completedAt: null
		});
		expect(checkpointStatusChange('cancelled', 'open', now)).toBeNull();
		expect(checkpointStatusChange('done', 'cancelled', now)).toBeNull();
		expect(checkpointStatusChange('open', 'open', now)).toBeNull();
	});
});
