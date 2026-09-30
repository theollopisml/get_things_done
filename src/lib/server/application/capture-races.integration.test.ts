import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { JevError, type ChoiceResult } from '$lib/server/jev/client';

const decision: ChoiceResult = {
	choice: 'task',
	probabilities: { task: 0.95, project: 0.05 },
	confidence: 0.95,
	model: 'typesafe/jev-1.13'
};

describe.runIf(process.env.RUN_DB_TESTS === '1')('capture races with PostgreSQL', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('persists exactly one Entry and object for concurrent requests with the same key', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, tasks } = await import('$lib/server/db/schema');
		const { submitCollectorCapture, InvalidCapture } = await import('./captures');
		const key = crypto.randomUUID();
		const title = `Concurrent ${key}`;
		try {
			const results = await Promise.all(
				Array.from({ length: 8 }, () => submitCollectorCapture(title, 'task', key, '2026-10-05'))
			);
			expect(new Set(results.map((result) => result.entryId)).size).toBe(1);
			const saved = await db.select().from(entries).where(eq(entries.captureRequestId, key));
			expect(saved).toHaveLength(1);
			expect(saved[0]).toMatchObject({
				classificationState: 'classified',
				classificationSource: 'manual'
			});
			expect(await db.select().from(tasks).where(eq(tasks.title, title))).toHaveLength(1);
			await expect(submitCollectorCapture('Different text', 'task', key)).rejects.toBeInstanceOf(
				InvalidCapture
			);
		} finally {
			await db.delete(entries).where(eq(entries.captureRequestId, key));
			await db.delete(tasks).where(eq(tasks.title, title));
		}
	});

	it('does not replace a manual classification when a pending Jev response or failure arrives', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, projects, tasks } = await import('$lib/server/db/schema');
		const { processEntry, retryJevClassification } = await import('./captures');
		for (const fail of [false, true]) {
			const title = `Manual wins ${crypto.randomUUID()}`;
			const [entry] = await db.insert(entries).values({ rawContent: title }).returning();
			let release!: () => void;
			let started!: () => void;
			const waiting = new Promise<void>((resolve) => (release = resolve));
			const called = new Promise<void>((resolve) => (started = resolve));
			const pending = retryJevClassification(entry.id, {
				client: {
					choose: async () => {
						started();
						await waiting;
						if (fail) throw new JevError('timeout');
						return decision;
					}
				},
				loadCandidates: async () => []
			});
			try {
				await called;
				await processEntry(entry.id, 'project');
				release();
				expect(await pending).toMatchObject({ status: 'saved_and_classified', kind: 'project' });
				expect((await db.select().from(entries).where(eq(entries.id, entry.id)))[0]).toMatchObject({
					classificationState: 'classified',
					classificationSource: 'manual',
					taskId: null
				});
				expect(await db.select().from(projects).where(eq(projects.title, title))).toHaveLength(1);
				expect(await db.select().from(tasks).where(eq(tasks.title, title))).toHaveLength(0);
			} finally {
				release();
				await pending;
				await db.delete(entries).where(eq(entries.id, entry.id));
				await db.delete(projects).where(eq(projects.title, title));
				await db.delete(tasks).where(eq(tasks.title, title));
			}
		}
	});

	it('rejects stale content then allows concurrent retries to create exactly one object', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, tasks } = await import('$lib/server/db/schema');
		const { editEntry, retryJevClassification } = await import('./captures');
		const title = `Stale ${crypto.randomUUID()}`;
		const updated = `${title} edited`;
		const [entry] = await db.insert(entries).values({ rawContent: title }).returning();
		const client = {
			choose: async () => {
				await editEntry(entry.id, updated);
				return decision;
			}
		};
		try {
			expect(
				await retryJevClassification(entry.id, { client, loadCandidates: async () => [] })
			).toMatchObject({ status: 'saved_pending_retry' });
			expect((await db.select().from(entries).where(eq(entries.id, entry.id)))[0]).toMatchObject({
				rawContent: updated,
				classificationState: 'failed',
				taskId: null
			});
			expect(await db.select().from(tasks).where(eq(tasks.title, title))).toHaveLength(0);
			await Promise.all(
				Array.from({ length: 4 }, () =>
					retryJevClassification(entry.id, {
						client: { choose: async () => decision },
						loadCandidates: async () => []
					})
				)
			);
			expect(await db.select().from(tasks).where(eq(tasks.title, updated))).toHaveLength(1);
		} finally {
			await db.delete(entries).where(eq(entries.id, entry.id));
			await db.delete(tasks).where(eq(tasks.title, title));
			await db.delete(tasks).where(eq(tasks.title, updated));
		}
	});

	it('rolls back the created object when linking its Entry violates a database constraint', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, tasks } = await import('$lib/server/db/schema');
		const { applyJevClassification } = await import('$lib/server/repositories/captures');
		const title = `Rollback ${crypto.randomUUID()}`;
		const [entry] = await db.insert(entries).values({ rawContent: title }).returning();
		try {
			await expect(
				applyJevClassification(entry.id, title, {
					kind: 'task',
					typeProbability: 2,
					relationId: null,
					relationProbability: null,
					model: decision.model
				})
			).rejects.toThrow();
			expect(await db.select().from(tasks).where(eq(tasks.title, title))).toHaveLength(0);
			expect((await db.select().from(entries).where(eq(entries.id, entry.id)))[0]).toMatchObject({
				classificationState: 'pending',
				taskId: null,
				classifiedAt: null
			});
		} finally {
			await db.delete(entries).where(eq(entries.id, entry.id));
			await db.delete(tasks).where(eq(tasks.title, title));
		}
	});
});
