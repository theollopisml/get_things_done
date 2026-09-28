import { afterAll, describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('Jev relation candidates with PostgreSQL', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('offers only open, non-deleted Projects and active, non-deleted Visions', async () => {
		const { db } = await import('$lib/server/db');
		const { projects, visions } = await import('$lib/server/db/schema');
		const { listEligibleRelationCandidates } = await import('./jev-candidates');
		const { inArray } = await import('drizzle-orm');
		const createdProjects = await db
			.insert(projects)
			.values([
				{ title: 'Candidate planned', status: 'planned' },
				{ title: 'Candidate active', status: 'active' },
				{ title: 'Candidate paused', status: 'paused' },
				{ title: 'Candidate deleted', status: 'active', deletedAt: new Date() }
			])
			.returning({ id: projects.id });
		const createdVisions = await db
			.insert(visions)
			.values([
				{ title: 'Candidate active', status: 'active' },
				{ title: 'Candidate paused', status: 'paused' },
				{ title: 'Candidate deleted', status: 'active', deletedAt: new Date() }
			])
			.returning({ id: visions.id });
		try {
			const projectIds = new Set(
				(await listEligibleRelationCandidates('project')).map((item) => item.id)
			);
			expect(projectIds.has(createdProjects[0].id)).toBe(true);
			expect(projectIds.has(createdProjects[1].id)).toBe(true);
			expect(projectIds.has(createdProjects[2].id)).toBe(false);
			expect(projectIds.has(createdProjects[3].id)).toBe(false);

			const visionIds = new Set(
				(await listEligibleRelationCandidates('vision')).map((item) => item.id)
			);
			expect(visionIds.has(createdVisions[0].id)).toBe(true);
			expect(visionIds.has(createdVisions[1].id)).toBe(false);
			expect(visionIds.has(createdVisions[2].id)).toBe(false);
		} finally {
			await db.delete(projects).where(
				inArray(
					projects.id,
					createdProjects.map((item) => item.id)
				)
			);
			await db.delete(visions).where(
				inArray(
					visions.id,
					createdVisions.map((item) => item.id)
				)
			);
		}
	});
});
