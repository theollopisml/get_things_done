import { and, eq, isNull } from 'drizzle-orm';
import { projectStatusChange, type ProjectStatus } from '$lib/domain/projects';
import { db } from '$lib/server/db';
import { projects } from '$lib/server/db/schema';

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
