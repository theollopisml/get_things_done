import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { isProjectToBuild, projectStatusChange, type ProjectStatus } from '$lib/domain/projects';
import { db } from '$lib/server/db';
import { checkpoints, projects, tasks, visions } from '$lib/server/db/schema';

export async function listProjects() {
	const [rows, taskCounts, checkpointCounts] = await Promise.all([
		db
			.select({ project: projects, visionTitle: visions.title })
			.from(projects)
			.leftJoin(visions, eq(projects.visionId, visions.id))
			.where(isNull(projects.deletedAt))
			.orderBy(desc(projects.updatedAt), asc(projects.id)),
		db
			.select({
				projectId: tasks.projectId,
				count: sql<number>`count(*)::int`,
				done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`
			})
			.from(tasks)
			.where(isNull(tasks.deletedAt))
			.groupBy(tasks.projectId),
		db
			.select({
				projectId: checkpoints.projectId,
				count: sql<number>`count(*)::int`,
				done: sql<number>`count(*) filter (where ${checkpoints.status} = 'done')::int`
			})
			.from(checkpoints)
			.where(isNull(checkpoints.deletedAt))
			.groupBy(checkpoints.projectId)
	]);
	const taskMap = new Map(taskCounts.map((count) => [count.projectId, count]));
	const checkpointMap = new Map(checkpointCounts.map((count) => [count.projectId, count]));
	return rows.map(({ project, visionTitle }) => {
		const taskCount = taskMap.get(project.id)?.count ?? 0;
		const checkpointCount = checkpointMap.get(project.id)?.count ?? 0;
		return {
			...project,
			visionTitle,
			taskCount,
			tasksDone: taskMap.get(project.id)?.done ?? 0,
			checkpointCount,
			checkpointsDone: checkpointMap.get(project.id)?.done ?? 0,
			toBuild: isProjectToBuild({ status: project.status, taskCount, checkpointCount })
		};
	});
}

export async function getProjectDetail(id: string) {
	const [project] = await db
		.select({ project: projects, visionTitle: visions.title })
		.from(projects)
		.leftJoin(visions, eq(projects.visionId, visions.id))
		.where(and(eq(projects.id, id), isNull(projects.deletedAt)));
	if (!project) return null;
	const [projectTasks, projectCheckpoints] = await Promise.all([
		db
			.select()
			.from(tasks)
			.where(and(eq(tasks.projectId, id), isNull(tasks.deletedAt)))
			.orderBy(sql`${tasks.position} NULLS LAST`, asc(tasks.createdAt), asc(tasks.id)),
		db
			.select()
			.from(checkpoints)
			.where(and(eq(checkpoints.projectId, id), isNull(checkpoints.deletedAt)))
			.orderBy(asc(checkpoints.position), asc(checkpoints.id))
	]);
	const taskCount = projectTasks.length;
	const checkpointCount = projectCheckpoints.length;
	return {
		...project.project,
		visionTitle: project.visionTitle,
		taskCount,
		tasksDone: projectTasks.filter((task) => task.status === 'done').length,
		openTaskCount: projectTasks.filter(
			(task) => task.status === 'todo' || task.status === 'in_progress'
		).length,
		checkpointCount,
		checkpointsDone: projectCheckpoints.filter((checkpoint) => checkpoint.status === 'done').length,
		toBuild: isProjectToBuild({ status: project.project.status, taskCount, checkpointCount }),
		checkpoints: projectCheckpoints,
		tasks: projectTasks
	};
}

export async function createProject(title: string) {
	const [project] = await db.insert(projects).values({ title }).returning();
	return project;
}

export async function saveProject(
	id: string,
	values: {
		title: string;
		description: string | null;
		startDate: string | null;
		dueDate: string | null;
	}
) {
	const [project] = await db
		.update(projects)
		.set({ ...values, updatedAt: new Date() })
		.where(and(eq(projects.id, id), isNull(projects.deletedAt)))
		.returning();
	return project ?? null;
}

export async function setProjectStatus(id: string, status: ProjectStatus) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({ status: projects.status, startedAt: projects.startedAt })
			.from(projects)
			.where(and(eq(projects.id, id), isNull(projects.deletedAt)))
			.for('update');
		if (!current) return { outcome: 'not_found' as const };
		const now = new Date();
		const change = projectStatusChange(current, status, now);
		if (!change) return { outcome: 'invalid_transition' as const };
		const [project] = await tx
			.update(projects)
			.set({ ...change, updatedAt: now })
			.where(eq(projects.id, id))
			.returning();
		return { outcome: 'updated' as const, project, previousStatus: current.status };
	});
}
