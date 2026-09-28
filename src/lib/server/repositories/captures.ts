import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { entries, projects, tasks, visions } from '$lib/server/db/schema';
import { splitCapture, type ClassifiedKind } from '$lib/domain/capture';

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

async function insertClassified(tx: Transaction, kind: ClassifiedKind, rawContent: string) {
	const { title, description } = splitCapture(rawContent);
	switch (kind) {
		case 'task': {
			const [task] = await tx
				.insert(tasks)
				.values({ title, description })
				.returning({ id: tasks.id });
			return task;
		}
		case 'project': {
			const [project] = await tx
				.insert(projects)
				.values({ title, description })
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
