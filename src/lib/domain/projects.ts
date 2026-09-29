export const projectStatuses = ['planned', 'active', 'paused', 'done', 'cancelled'] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

const transitions: Record<ProjectStatus, readonly ProjectStatus[]> = {
	planned: ['active', 'done', 'cancelled'],
	active: ['paused', 'done', 'cancelled'],
	paused: ['active', 'done', 'cancelled'],
	done: ['active'],
	cancelled: []
};

export function projectStatusChange(
	current: { status: ProjectStatus; startedAt: Date | null },
	next: ProjectStatus,
	now: Date
) {
	if (!transitions[current.status].includes(next)) return null;
	return {
		status: next,
		startedAt: next === 'active' ? (current.startedAt ?? now) : current.startedAt,
		completedAt: next === 'done' ? now : null
	};
}
