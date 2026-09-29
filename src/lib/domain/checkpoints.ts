export const checkpointStatuses = ['open', 'done', 'cancelled'] as const;
export type CheckpointStatus = (typeof checkpointStatuses)[number];

export function checkpointStatusChange(
	current: CheckpointStatus,
	next: CheckpointStatus,
	now: Date
) {
	if (!((current === 'open' && next !== 'open') || (current === 'done' && next === 'open')))
		return null;
	return { status: next, completedAt: next === 'done' ? now : null };
}
