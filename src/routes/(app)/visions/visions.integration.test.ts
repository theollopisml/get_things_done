import { afterAll, describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('Vision list route', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('creates a Vision, lists it, and rejects an empty title', async () => {
		const { db } = await import('$lib/server/db');
		const { visions } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const { actions, load } = await import('./+page.server');
		const invalidForm = new FormData();
		invalidForm.set('title', '   ');
		expect(
			await actions.create({
				request: new Request('http://localhost/visions?/create', {
					method: 'POST',
					body: invalidForm
				})
			} as Parameters<typeof actions.create>[0])
		).toMatchObject({ status: 400 });

		const form = new FormData();
		form.set('title', '  Bien vivre chez soi  ');
		const created = await actions.create({
			request: new Request('http://localhost/visions?/create', { method: 'POST', body: form })
		} as Parameters<typeof actions.create>[0]);
		if (!('id' in created)) throw new Error('Vision creation failed');
		try {
			const result = (await load({} as Parameters<typeof load>[0])) as {
				visions: { id: string; title: string; status: string }[];
			};
			expect(result.visions).toContainEqual(
				expect.objectContaining({ id: created.id, title: 'Bien vivre chez soi', status: 'active' })
			);
		} finally {
			await db.delete(visions).where(eq(visions.id, created.id));
		}
	});
});
