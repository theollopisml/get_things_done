export const taskStatuses = ['todo', 'in_progress', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export function taskStatusDates(status: TaskStatus, now: Date) {
	return {
		completedAt: status === 'done' ? now : null,
		cancelledAt: status === 'cancelled' ? now : null
	};
}

export function taskGroup(
	task: {
		status: TaskStatus;
		projectStatus?: string | null;
		scheduledDate: string | null;
		scheduledTime?: string | null;
		dueDate: string | null;
		dueTime?: string | null;
	},
	today: string,
	nowTime = '00:00'
) {
	if (task.status === 'in_progress' && task.projectStatus !== 'paused') return 'in_progress';
	if (
		(task.scheduledDate &&
			(task.scheduledDate < today ||
				(task.scheduledDate === today && !!task.scheduledTime && task.scheduledTime < nowTime))) ||
		(task.dueDate &&
			(task.dueDate < today ||
				(task.dueDate === today && !!task.dueTime && task.dueTime < nowTime)))
	)
		return 'late';
	if (task.scheduledDate || task.dueDate) return 'upcoming';
	return 'unscheduled';
}
