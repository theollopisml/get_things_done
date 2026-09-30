import { test as base, expect, type Page } from '@playwright/test';
import { createHmac, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { authSecret, baseURL, databaseURL, ownerId } from './environment';

export const test = base.extend<{
	sql: postgres.Sql;
	login: (owner?: boolean) => Promise<void>;
	diagnostics: void;
}>({
	diagnostics: [
		async ({ page }, use) => {
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('dialog', async (dialog) => {
				errors.push(`Unexpected browser dialog: ${dialog.type()}`);
				await dialog.dismiss();
			});
			await use();
			expect(errors).toEqual([]);
		},
		{ auto: true }
	],
	// Playwright requires destructuring even for fixtures with no dependencies.
	// eslint-disable-next-line no-empty-pattern
	sql: async ({}, use) => {
		const sql = postgres(databaseURL, { max: 1, onnotice: () => {} });
		try {
			await sql`TRUNCATE entries, tasks, checkpoints, projects, "user", verification CASCADE`;
			await use(sql);
		} finally {
			await sql.end();
		}
	},
	login: async ({ sql, context }, use) => {
		await use(async (owner = true) => {
			const id = randomUUID();
			const token = randomUUID();
			await sql`INSERT INTO "user" (id, name, email) VALUES (${id}, 'E2E', ${`${id}@example.test`})`;
			await sql`INSERT INTO account (id, account_id, provider_id, user_id, updated_at)
				VALUES (${randomUUID()}, ${owner ? ownerId : 'unauthorized'}, 'github', ${id}, now())`;
			await sql`INSERT INTO session (id, token, user_id, expires_at, updated_at)
				VALUES (${randomUUID()}, ${token}, ${id}, ${new Date(Date.now() + 3_600_000)}, now())`;
			const signature = createHmac('sha256', authSecret).update(token).digest('base64');
			await context.addCookies([
				{
					name: 'better-auth.session_token',
					value: encodeURIComponent(`${token}.${signature}`),
					url: baseURL,
					httpOnly: true,
					sameSite: 'Lax'
				}
			]);
		});
	}
});

export { expect };

export async function submitCapture(page: Page) {
	if (test.info().project.name === 'mobile') {
		await page.getByRole('button', { name: 'Capture', exact: true }).tap();
	} else {
		await page
			.getByRole('combobox', { name: 'Qu’est-ce qui te passe par la tête ?' })
			.press('Enter');
	}
}

export async function createTask(page: Page, title: string) {
	await page.goto('/tasks');
	await page.getByRole('combobox', { name: 'Nouvelle Task', exact: true }).fill(title);
	const submit = page.getByRole('button', { name: 'Ajouter', exact: true });
	if (test.info().project.name === 'mobile') await submit.tap();
	else await submit.click();
	const card = page
		.locator('article')
		.filter({ has: page.getByRole('heading', { name: title, exact: true }) });
	await expect(card).toBeVisible();
	return card;
}

export async function assertNoOverflow(page: Page) {
	const dimensions = await page.evaluate(() => ({
		viewport: document.documentElement.clientWidth,
		content: document.documentElement.scrollWidth
	}));
	expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
}
