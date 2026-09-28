import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { entries, projects, tasks, visions } from '$lib/server/db/schema';
import { splitCapture, type ClassifiedKind } from '$lib/domain/capture';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function listEntries() {
	return db
		.select()
		.from(entries)
		.where(isNull(entries.deletedAt))
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
	return db.transaction((tx) => insertClassified(tx, kind, rawContent));
}

export async function classifyEntry(id: string, kind: ClassifiedKind) {
	return db.transaction(async (tx) => {
		const [entry] = await tx
			.select()
			.from(entries)
			.where(and(eq(entries.id, id), isNull(entries.deletedAt)))
			.for('update');
		if (!entry) return null;
		const created = await insertClassified(tx, kind, entry.rawContent);
		await tx.delete(entries).where(eq(entries.id, id));
		return created;
	});
}

export async function updateEntry(id: string, rawContent: string) {
	const [entry] = await db
		.update(entries)
		.set({ rawContent, updatedAt: new Date() })
		.where(and(eq(entries.id, id), isNull(entries.deletedAt)))
		.returning({ id: entries.id });
	return entry ?? null;
}

export async function deleteEntry(id: string) {
	const [entry] = await db
		.update(entries)
		.set({ deletedAt: new Date(), updatedAt: new Date() })
		.where(and(eq(entries.id, id), isNull(entries.deletedAt)))
		.returning({ id: entries.id });
	return entry ?? null;
}
