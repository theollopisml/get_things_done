import { afterAll, describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('Jev relation candidates with PostgreSQL', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('offers only open, non-deleted Projects', async () => {
		const { db } = await import('$lib/server/db');
		const { projects } = await import('$lib/server/db/schema');
		const { listEligibleRelationCandidates } = await import('./jev-candidates');
		const { inArray } = await import('drizzle-orm');
		const created = await db
			.insert(projects)
			.values([
				{ title: 'Candidate planned', status: 'planned' },
				{ title: 'Candidate active', status: 'active' },
				{ title: 'Candidate paused', status: 'paused' },
				{ title: 'Candidate deleted', status: 'active', deletedAt: new Date() }
			])
			.returning({ id: projects.id });
		try {
			const ids = new Set((await listEligibleRelationCandidates()).map((item) => item.id));
			expect(ids.has(created[0].id)).toBe(true);
			expect(ids.has(created[1].id)).toBe(true);
			expect(ids.has(created[2].id)).toBe(false);
			expect(ids.has(created[3].id)).toBe(false);
		} finally {
			await db.delete(projects).where(
				inArray(
					projects.id,
					created.map((item) => item.id)
				)
			);
		}
	});
});
