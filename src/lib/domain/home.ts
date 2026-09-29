import type { TaskStatus } from './tasks';

export type HomeTask = {
	status: TaskStatus;
	projectStatus?: string | null;
	scheduledDate: string | null;
	scheduledTime: string | null;
	dueDate: string | null;
	dueTime: string | null;
};

export type HomeGroup = 'late' | 'in_progress' | 'today';

function isLate(date: string | null, time: string | null, today: string, nowTime: string) {
	return !!date && (date < today || (date === today && !!time && time < nowTime));
}

export function homeGroup(task: HomeTask, today: string, nowTime: string): HomeGroup | null {
	if (task.status === 'done' || task.status === 'cancelled') return null;
	if (task.projectStatus === 'done' || task.projectStatus === 'cancelled') return null;

	if (
		isLate(task.scheduledDate, task.scheduledTime, today, nowTime) ||
		isLate(task.dueDate, task.dueTime, today, nowTime)
	)
		return 'late';
	if (task.scheduledDate === today || task.dueDate === today) return 'today';
	if (task.status === 'in_progress' && task.projectStatus !== 'paused') return 'in_progress';
	return null;
}

export function groupHomeTasks<T extends HomeTask>(tasks: T[], today: string, nowTime: string) {
	const groups: Record<HomeGroup, T[]> = { late: [], in_progress: [], today: [] };
	for (const task of tasks) {
		const group = homeGroup(task, today, nowTime);
		if (group) groups[group].push(task);
	}
	return groups;
}
