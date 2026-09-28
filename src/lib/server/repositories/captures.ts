import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { entries, projects, tasks, visions } from '$lib/server/db/schema';
import { splitCapture, type ClassifiedKind } from '$lib/domain/capture';
import type { JevClassification } from '$lib/server/jev/classification';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function listEntries() {
	return db
		.select()
		.from(entries)
		.where(
			and(isNull(entries.deletedAt), inArray(entries.classificationState, ['pending', 'failed']))
		)
		.orderBy(desc(entries.createdAt), desc(entries.id));
}

export async function createEntry(rawContent: string) {
	const [entry] = await db.insert(entries).values({ rawContent }).returning({ id: entries.id });
	return entry;
}

export async function getOrCreateCaptureEntry(rawContent: string, requestId: string) {
	const [created] = await db
		.insert(entries)
		.values({ rawContent, captureRequestId: requestId })
		.onConflictDoNothing({ target: entries.captureRequestId })
		.returning();
	if (created) return created;
	const [existing] = await db.select().from(entries).where(eq(entries.captureRequestId, requestId));
	return existing;
}

async function insertClassified(
	tx: Transaction,
	kind: ClassifiedKind,
	rawContent: string,
	relationId?: string | null
) {
	const { title, description } = splitCapture(rawContent);
	switch (kind) {
		case 'task': {
			const [parent] = relationId
				? await tx
						.select({ id: projects.id })
						.from(projects)
						.where(
							and(
								eq(projects.id, relationId),
								isNull(projects.deletedAt),
								inArray(projects.status, ['planned', 'active'])
							)
						)
						.for('share')
				: [];
			const [task] = await tx
				.insert(tasks)
				.values({ title, description, projectId: parent?.id })
				.returning({ id: tasks.id });
			return task;
		}
		case 'project': {
			const [parent] = relationId
				? await tx
						.select({ id: visions.id })
						.from(visions)
						.where(
							and(
								eq(visions.id, relationId),
								isNull(visions.deletedAt),
								eq(visions.status, 'active')
							)
						)
						.for('share')
				: [];
			const [project] = await tx
				.insert(projects)
				.values({ title, description, visionId: parent?.id })
				.returning({ id: projects.id });
			return project;
		}
		case 'vision': {
			const [vision] = await tx
				.insert(visions)
				.values({ title, description })
				.returning({ id: visions.id });
			return vision;
		}
	}
}

function linkedKind(entry: typeof entries.$inferSelect): ClassifiedKind | null {
	if (entry.taskId) return 'task';
	if (entry.projectId) return 'project';
	if (entry.visionId) return 'vision';
	return null;
}

export async function getCaptureEntry(id: string) {
	const [entry] = await db
		.select()
		.from(entries)
		.where(and(eq(entries.id, id), isNull(entries.deletedAt)));
	return entry ?? null;
}

export async function classifyCollectorManually(
	id: string,
	rawContent: string,
	kind: ClassifiedKind
) {
	return db.transaction(async (tx) => {
		const [entry] = await tx.select().from(entries).where(eq(entries.id, id)).for('update');
		if (!entry || entry.deletedAt || entry.rawContent !== rawContent) return null;
		if (entry.classificationState === 'classified') return linkedKind(entry);
		const created = await insertClassified(tx, kind, rawContent);
		await markClassified(tx, id, kind, created.id);
		return kind;
	});
}

export async function applyJevClassification(
	id: string,
	expectedRawContent: string,
	decision: JevClassification
) {
	return db.transaction(async (tx) => {
		const [entry] = await tx.select().from(entries).where(eq(entries.id, id)).for('update');
		if (!entry || entry.deletedAt) return null;
		if (entry.classificationState === 'classified') return linkedKind(entry);
		if (entry.rawContent !== expectedRawContent) return 'stale';
		const created = await insertClassified(
			tx,
			decision.kind,
			entry.rawContent,
			decision.relationId
		);
		await tx
			.update(entries)
			.set({
				classificationState: 'classified',
				classificationSource: 'jev',
				classifiedAt: new Date(),
				updatedAt: new Date(),
				jevModel: decision.model,
				typeProbability: decision.typeProbability,
				relationProbability: decision.relationProbability,
				...(decision.kind === 'task' ? { taskId: created.id } : {}),
				...(decision.kind === 'project' ? { projectId: created.id } : {}),
				...(decision.kind === 'vision' ? { visionId: created.id } : {})
			})
			.where(eq(entries.id, id));
		return decision.kind;
	});
}

export async function markJevFailed(id: string) {
	await db
		.update(entries)
		.set({ classificationState: 'failed', updatedAt: new Date() })
		.where(
			and(
				eq(entries.id, id),
				isNull(entries.deletedAt),
				inArray(entries.classificationState, ['pending', 'failed'])
			)
		);
}

export async function createClassified(kind: ClassifiedKind, rawContent: string) {
	return db.transaction(async (tx) => {
		const [entry] = await tx.insert(entries).values({ rawContent }).returning({ id: entries.id });
		const created = await insertClassified(tx, kind, rawContent);
		await markClassified(tx, entry.id, kind, created.id);
		return created;
	});
}

async function markClassified(
	tx: Transaction,
	entryId: string,
	kind: ClassifiedKind,
	objectId: string
) {
	await tx
		.update(entries)
		.set({
			classificationState: 'classified',
			classificationSource: 'manual',
			classifiedAt: new Date(),
			updatedAt: new Date(),
			...(kind === 'task' ? { taskId: objectId } : {}),
			...(kind === 'project' ? { projectId: objectId } : {}),
			...(kind === 'vision' ? { visionId: objectId } : {})
		})
		.where(eq(entries.id, entryId));
}

export async function classifyEntry(id: string, kind: ClassifiedKind) {
	return db.transaction(async (tx) => {
		const [entry] = await tx
			.select()
			.from(entries)
			.where(
				and(
					eq(entries.id, id),
					isNull(entries.deletedAt),
					inArray(entries.classificationState, ['pending', 'failed'])
				)
			)
			.for('update');
		if (!entry) return null;
		const created = await insertClassified(tx, kind, entry.rawContent);
		await markClassified(tx, id, kind, created.id);
		return created;
	});
}

export async function updateEntry(id: string, rawContent: string) {
	const [entry] = await db
		.update(entries)
		.set({ rawContent, updatedAt: new Date() })
		.where(
			and(
				eq(entries.id, id),
				isNull(entries.deletedAt),
				inArray(entries.classificationState, ['pending', 'failed'])
			)
		)
		.returning({ id: entries.id });
	return entry ?? null;
}

export async function deleteEntry(id: string) {
	const [entry] = await db
		.update(entries)
		.set({ deletedAt: new Date(), updatedAt: new Date() })
		.where(
			and(
				eq(entries.id, id),
				isNull(entries.deletedAt),
				inArray(entries.classificationState, ['pending', 'failed'])
			)
		)
		.returning({ id: entries.id });
	return entry ?? null;
}
