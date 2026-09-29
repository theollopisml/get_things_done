import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db';
import { checkpoints, entries, projects, tasks } from '$lib/server/db/schema';
import { splitCapture, type ClassifiedKind } from '$lib/domain/capture';
import type { JevClassification } from '$lib/server/jev/classification';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const taskParentProject = alias(projects, 'review_task_parent_project');

export async function countReviewAttention() {
	const [[unreviewed], [failed]] = await Promise.all([
		db
			.select({ value: count() })
			.from(entries)
			.where(
				and(
					isNull(entries.deletedAt),
					eq(entries.classificationState, 'classified'),
					eq(entries.classificationSource, 'jev'),
					isNull(entries.reviewedAt)
				)
			),
		db
			.select({ value: count() })
			.from(entries)
			.where(and(isNull(entries.deletedAt), eq(entries.classificationState, 'failed')))
	]);
	return { unreviewed: unreviewed.value, failed: failed.value };
}

export async function listJevReviewEntries(onlyUnreviewed = false) {
	const rows = await db
		.select({
			id: entries.id,
			rawContent: entries.rawContent,
			createdAt: entries.createdAt,
			reviewedAt: entries.reviewedAt,
			taskId: entries.taskId,
			projectId: entries.projectId,
			taskTitle: tasks.title,
			projectTitle: projects.title,
			taskParentId: tasks.projectId,
			taskDeletedAt: tasks.deletedAt,
			projectDeletedAt: projects.deletedAt,
			taskParentTitle: taskParentProject.title
		})
		.from(entries)
		.leftJoin(tasks, eq(entries.taskId, tasks.id))
		.leftJoin(projects, eq(entries.projectId, projects.id))
		.leftJoin(taskParentProject, eq(tasks.projectId, taskParentProject.id))
		.where(
			and(
				isNull(entries.deletedAt),
				eq(entries.classificationState, 'classified'),
				eq(entries.classificationSource, 'jev'),
				...(onlyUnreviewed ? [isNull(entries.reviewedAt)] : [])
			)
		)
		.orderBy(desc(entries.createdAt), desc(entries.id));

	return rows.map((row) => ({
		id: row.id,
		rawContent: row.rawContent,
		createdAt: row.createdAt,
		reviewedAt: row.reviewedAt,
		kind: (row.taskId ? 'task' : 'project') as ClassifiedKind,
		title: row.taskTitle ?? row.projectTitle ?? 'Objet introuvable',
		parentTitle: row.taskId ? row.taskParentTitle : null,
		parentId: row.taskId ? row.taskParentId : null,
		objectDeleted: Boolean(row.taskDeletedAt ?? row.projectDeletedAt)
	}));
}

export async function listReviewParentOptions() {
	const eligibleProjects = await db
		.select({ id: projects.id, title: projects.title })
		.from(projects)
		.where(and(isNull(projects.deletedAt), inArray(projects.status, ['planned', 'active'])))
		.orderBy(asc(projects.title), asc(projects.id));
	return { projects: eligibleProjects };
}

export async function confirmJevClassification(id: string) {
	return db.transaction(async (tx) => {
		const [entry] = await tx
			.select()
			.from(entries)
			.where(and(eq(entries.id, id), isNull(entries.deletedAt)))
			.for('update');
		if (entry?.classificationState !== 'classified' || entry.classificationSource !== 'jev') {
			return false;
		}
		if (!entry.reviewedAt) {
			await tx
				.update(entries)
				.set({ reviewedAt: new Date(), updatedAt: new Date() })
				.where(eq(entries.id, id));
		}
		return true;
	});
}

export async function confirmJevClassifications(ids: string[]) {
	if (!ids.length) return 0;
	const now = new Date();
	const confirmed = await db
		.update(entries)
		.set({ reviewedAt: now, updatedAt: now })
		.where(
			and(
				inArray(entries.id, ids),
				isNull(entries.deletedAt),
				isNull(entries.reviewedAt),
				eq(entries.classificationState, 'classified'),
				eq(entries.classificationSource, 'jev')
			)
		)
		.returning({ id: entries.id });
	return confirmed.length;
}

export async function correctJevRelation(id: string, relationId: string | null) {
	return db.transaction(async (tx) => {
		const [entry] = await tx
			.select()
			.from(entries)
			.where(and(eq(entries.id, id), isNull(entries.deletedAt)))
			.for('update');
		if (entry?.classificationState !== 'classified' || entry.classificationSource !== 'jev') {
			return 'not_found' as const;
		}
		if (entry.taskId) {
			const [task] = await tx.select().from(tasks).where(eq(tasks.id, entry.taskId)).for('update');
			if (!task || task.deletedAt) return 'object_unavailable' as const;
			if (task.checkpointId && task.projectId !== relationId) return 'checkpoint_conflict' as const;
			if (relationId) {
				const [parent] = await tx
					.select({ id: projects.id })
					.from(projects)
					.where(
						and(
							eq(projects.id, relationId),
							isNull(projects.deletedAt),
							inArray(projects.status, ['planned', 'active'])
						)
					)
					.for('share');
				if (!parent) return 'invalid_parent' as const;
			}
			await tx
				.update(tasks)
				.set({ projectId: relationId, updatedAt: new Date() })
				.where(eq(tasks.id, task.id));
		} else {
			return 'not_found' as const;
		}
		await tx
			.update(entries)
			.set({ reviewedAt: new Date(), updatedAt: new Date() })
			.where(eq(entries.id, id));
		return 'updated' as const;
	});
}

export async function correctJevClassification(id: string, kind: ClassifiedKind) {
	return db.transaction(async (tx) => {
		const [entry] = await tx
			.select()
			.from(entries)
			.where(and(eq(entries.id, id), isNull(entries.deletedAt)))
			.for('update');
		if (entry?.classificationState !== 'classified' || entry.classificationSource !== 'jev') {
			return 'not_found' as const;
		}
		if (linkedKind(entry) === kind) return 'same_kind' as const;

		let source: { title: string; description: string | null };
		if (entry.taskId) {
			const [task] = await tx.select().from(tasks).where(eq(tasks.id, entry.taskId)).for('update');
			if (!task || task.deletedAt) return 'object_unavailable' as const;
			if (
				task.projectId ||
				task.checkpointId ||
				task.status !== 'todo' ||
				task.scheduledDate ||
				task.scheduledTime ||
				task.dueDate ||
				task.dueTime ||
				task.recurrenceRule ||
				task.recurrenceAnchorDate ||
				task.position !== null ||
				task.completedAt ||
				task.cancelledAt
			) {
				return 'data_conflict' as const;
			}
			source = task;
		} else if (entry.projectId) {
			const [project] = await tx
				.select()
				.from(projects)
				.where(eq(projects.id, entry.projectId))
				.for('update');
			if (!project || project.deletedAt) return 'object_unavailable' as const;
			const [childTask] = await tx
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.projectId, project.id))
				.limit(1);
			const [childCheckpoint] = await tx
				.select({ id: checkpoints.id })
				.from(checkpoints)
				.where(eq(checkpoints.projectId, project.id))
				.limit(1);
			if (childTask || childCheckpoint) return 'children_conflict' as const;
			if (
				project.status !== 'planned' ||
				project.startDate ||
				project.dueDate ||
				project.startedAt ||
				project.completedAt
			) {
				return 'data_conflict' as const;
			}
			source = project;
		} else {
			return 'not_found' as const;
		}

		const values = { title: source.title, description: source.description };
		let targetId: string;
		if (kind === 'task') {
			const [created] = await tx.insert(tasks).values(values).returning({ id: tasks.id });
			targetId = created.id;
		} else {
			const [created] = await tx.insert(projects).values(values).returning({ id: projects.id });
			targetId = created.id;
		}
		const now = new Date();
		await tx
			.update(entries)
			.set({
				taskId: kind === 'task' ? targetId : null,
				projectId: kind === 'project' ? targetId : null,
				reviewedAt: now,
				updatedAt: now
			})
			.where(eq(entries.id, id));
		if (entry.taskId) {
			await tx
				.update(tasks)
				.set({ deletedAt: now, updatedAt: now })
				.where(eq(tasks.id, entry.taskId));
		} else if (entry.projectId) {
			await tx
				.update(projects)
				.set({ deletedAt: now, updatedAt: now })
				.where(eq(projects.id, entry.projectId));
		}
		return 'updated' as const;
	});
}

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
			const [project] = await tx
				.insert(projects)
				.values({ title, description })
				.returning({ id: projects.id });
			return project;
		}
	}
}

function linkedKind(entry: typeof entries.$inferSelect): ClassifiedKind | null {
	if (entry.taskId) return 'task';
	if (entry.projectId) return 'project';
	return null;
}

export async function getCaptureEntry(id: string) {
	const [entry] = await db
		.select()
		.from(entries)
		.where(and(eq(entries.id, id), isNull(entries.deletedAt)));
	return entry ?? null;
}

export async function getClassifiedRelationTitle(entry: typeof entries.$inferSelect) {
	if (entry.taskId) {
		const [task] = await db
			.select({ projectId: tasks.projectId })
			.from(tasks)
			.where(eq(tasks.id, entry.taskId));
		if (!task?.projectId) return null;
		const [project] = await db
			.select({ title: projects.title })
			.from(projects)
			.where(eq(projects.id, task.projectId));
		return project?.title ?? null;
	}
	return null;
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
				...(decision.kind === 'project' ? { projectId: created.id } : {})
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
			...(kind === 'project' ? { projectId: objectId } : {})
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
