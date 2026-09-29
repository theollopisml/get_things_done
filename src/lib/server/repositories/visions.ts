import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { canChangeVisionStatus, type VisionStatus } from '$lib/domain/visions';
import { db } from '$lib/server/db';
import { projects, visions } from '$lib/server/db/schema';

export async function listVisions() {
	return db
		.select()
		.from(visions)
		.where(isNull(visions.deletedAt))
		.orderBy(desc(visions.updatedAt), asc(visions.id));
}

export async function getVisionDetail(id: string) {
	const [vision] = await db
		.select()
		.from(visions)
		.where(and(eq(visions.id, id), isNull(visions.deletedAt)));
	if (!vision) return null;
	const linkedProjects = await db
		.select()
		.from(projects)
		.where(and(eq(projects.visionId, id), isNull(projects.deletedAt)))
		.orderBy(desc(projects.updatedAt), asc(projects.id));
	return { ...vision, projects: linkedProjects };
}

export async function createVision(title: string) {
	const [vision] = await db.insert(visions).values({ title }).returning();
	return vision;
}

export async function saveVision(
	id: string,
	values: { title: string; description: string | null }
) {
	const [vision] = await db
		.update(visions)
		.set({ ...values, updatedAt: new Date() })
		.where(and(eq(visions.id, id), isNull(visions.deletedAt)))
		.returning();
	return vision ?? null;
}

export async function setVisionStatus(id: string, status: VisionStatus) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({ status: visions.status })
			.from(visions)
			.where(and(eq(visions.id, id), isNull(visions.deletedAt)))
			.for('update');
		if (!current) return { outcome: 'not_found' as const };
		if (!canChangeVisionStatus(current.status, status)) {
			return { outcome: 'invalid_transition' as const };
		}
		const [vision] = await tx
			.update(visions)
			.set({ status, updatedAt: new Date() })
			.where(eq(visions.id, id))
			.returning();
		return { outcome: 'updated' as const, vision, previousStatus: current.status };
	});
}

export async function softDeleteVision(id: string) {
	return db.transaction(async (tx) => {
		const [vision] = await tx
			.select({ id: visions.id })
			.from(visions)
			.where(and(eq(visions.id, id), isNull(visions.deletedAt)))
			.for('update');
		if (!vision) return false;
		const now = new Date();
		await tx
			.update(projects)
			.set({ visionId: null, updatedAt: now })
			.where(eq(projects.visionId, id));
		await tx.update(visions).set({ deletedAt: now, updatedAt: now }).where(eq(visions.id, id));
		return true;
	});
}
