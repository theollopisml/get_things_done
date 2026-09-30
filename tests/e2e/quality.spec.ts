import { randomUUID } from 'node:crypto';
import { test, expect, assertNoOverflow, createTask } from './fixtures';

test('palette navigation focuses creation and results; keyboard actions keep a visible focus', async ({
	page,
	login
}) => {
	await login();
	await createTask(page, 'Première action');
	await page.getByRole('combobox', { name: 'Nouvelle Task', exact: true }).fill('Deuxième action');
	await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
	const editors = page.locator('[data-keyboard-item]');
	await expect(editors).toHaveCount(2);
	await expect(page.getByRole('combobox', { name: 'Nouvelle Task', exact: true })).toBeFocused();
	await editors.first().focus();
	await page.keyboard.press('ArrowDown');
	await expect(editors.nth(1)).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(editors.first()).toBeFocused();
	const outline = await editors
		.first()
		.evaluate((element) => getComputedStyle(element).outlineWidth);
	expect(parseFloat(outline)).toBeGreaterThanOrEqual(2);
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('textbox', { name: 'Titre', exact: true })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(editors.first()).toBeFocused();
	await page.keyboard.press('Control+k');
	await expect(dialog.getByRole('textbox', { name: 'Rechercher un objet' })).toBeFocused();
	await dialog.getByRole('link', { name: 'Nouvelle Task', exact: true }).click();
	await expect(page.getByRole('combobox', { name: 'Nouvelle Task', exact: true })).toBeFocused();
	await expect(dialog).not.toBeVisible();
	await page.keyboard.press('/');
	await expect(page.getByRole('combobox', { name: 'Nouvelle Task', exact: true })).toHaveValue('/');
	await expect(page).toHaveURL(/\/tasks#new-task$/);
	await page.getByRole('heading', { name: 'Tasks', exact: true }).click();
	await page.keyboard.press('/');
	await expect(
		page.getByRole('combobox', { name: 'Qu’est-ce qui te passe par la tête ?' })
	).toBeFocused();
	await page.keyboard.press('Control+k');
	await dialog.getByRole('textbox', { name: 'Rechercher un objet' }).fill('Première action');
	const result = dialog.getByRole('link').filter({ hasText: 'Première action' });
	await expect(result).toBeVisible();
	await page.keyboard.press('ArrowDown');
	await expect(result).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.locator('article').filter({ hasText: 'Première action' })).toBeFocused();
	// On AZERTY keyboards, typing / uses Shift. Its modifier must not disable capture.
	await page.locator('body').dispatchEvent('keydown', { key: '/', code: 'Period', shiftKey: true });
	await expect(
		page.getByRole('combobox', { name: 'Qu’est-ce qui te passe par la tête ?' })
	).toBeFocused();
});

test('palette ignores stale search responses and recovers from network errors', async ({
	page,
	login
}) => {
	await login();
	await createTask(page, 'Chercher cette action');
	await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
	const dialog = page.getByRole('dialog');
	const input = dialog.getByRole('textbox', { name: 'Rechercher un objet' });
	await page.route('**/api/search?**', (route) => route.abort('failed'));
	await input.fill('Chercher');
	await expect(dialog.getByRole('alert')).toBeVisible();
	await expect(input).toHaveValue('Chercher');
	await page.unroute('**/api/search?**');
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/api/search?q=ancien', async (route) => {
		await waiting;
		await route.fulfill({
			json: {
				tasks: [{ id: 'old', title: 'Résultat ancien', status: 'todo' }],
				projects: [],
				checkpoints: []
			}
		});
	});
	const oldRequest = page.waitForRequest('**/api/search?q=ancien');
	await input.fill('ancien');
	await oldRequest;
	await input.fill('Chercher cette action');
	await expect(dialog.getByRole('link').filter({ hasText: 'Chercher cette action' })).toBeVisible();
	release();
	await expect(dialog.getByText('Résultat ancien')).not.toBeVisible();
	await expect(dialog.getByRole('alert')).not.toBeVisible();
});

test('purge traps focus, Escape returns to the trigger and errors remain retryable', async ({
	page,
	login,
	sql
}) => {
	await login();
	await sql`INSERT INTO tasks (title, deleted_at) VALUES ('Purge clavier', now())`;
	await page.goto('/trash');
	const trigger = page.getByRole('button', { name: 'Purger', exact: true });
	await trigger.click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('button', { name: 'Retour', exact: true })).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(dialog.getByRole('button', { name: 'Purger définitivement' })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(dialog.getByRole('button', { name: 'Retour', exact: true })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(trigger).toBeFocused();
	await trigger.click();
	await page.route('**/trash?/purge', (route) => route.abort('failed'));
	await dialog.getByRole('button', { name: 'Purger définitivement' }).click();
	await expect(dialog.getByRole('alert')).toBeVisible();
	expect(await sql`SELECT id FROM tasks WHERE title = 'Purge clavier'`).toHaveLength(1);
	await page.unroute('**/trash?/purge');
	await dialog.getByRole('button', { name: 'Purger définitivement' }).click();
	await expect(dialog).not.toBeVisible();
});

test('themes persist with readable text, comfortable controls and no overflow at narrow widths', async ({
	page,
	login
}) => {
	await login();
	await page.setViewportSize({ width: 320, height: 640 });
	await page.goto('/');
	await assertNoOverflow(page);
	for (const theme of ['dark', 'light']) {
		if (theme === 'light')
			await page.getByRole('button', { name: 'Activer le mode clair' }).click();
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		const contrast = await page.evaluate(() => {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 1;
			const ctx = canvas.getContext('2d')!;
			function luminance(color: string) {
				ctx.clearRect(0, 0, 1, 1);
				ctx.fillStyle = color;
				ctx.fillRect(0, 0, 1, 1);
				const channels = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
					const s = value / 255;
					return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
				});
				return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
			}
			return [...document.querySelectorAll<HTMLElement>('h1, h2, main p, button, nav a')]
				.filter((element) => element.checkVisibility() && element.textContent?.trim())
				.map((element) => {
					let parent: HTMLElement | null = element;
					let background = 'rgba(0, 0, 0, 0)';
					while (parent && background === 'rgba(0, 0, 0, 0)') {
						background = getComputedStyle(parent).backgroundColor;
						parent = parent.parentElement;
					}
					const fg = luminance(getComputedStyle(element).color);
					const bg = luminance(background);
					return {
						text: element.textContent?.trim(),
						ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)
					};
				});
		});
		for (const item of contrast)
			expect(item.ratio, `${theme}: ${item.text}`).toBeGreaterThanOrEqual(4.5);
	}
	for (const path of ['/tasks', '/projects', '/review', '/trash']) {
		await page.goto(path);
		await assertNoOverflow(page);
	}
	const controls = await page
		.locator('header button, header a[aria-label], #mobile-navigation a')
		.evaluateAll((elements) =>
			elements
				.filter((element) => element.checkVisibility())
				.map((element) => element.getBoundingClientRect().height)
		);
	for (const height of controls) expect(height).toBeGreaterThanOrEqual(44);
});

test('representative data loads without browser errors and reports navigation timings', async ({
	page,
	login,
	sql
}, testInfo) => {
	await login();
	const projectId = randomUUID();
	await sql`INSERT INTO projects (id, title, status) VALUES (${projectId}, 'Projet volumineux', 'active')`;
	await sql`INSERT INTO tasks (title, project_id, position)
		SELECT 'Action ' || n, ${projectId}, n FROM generate_series(1, 100) AS n`;
	await sql`INSERT INTO checkpoints (title, project_id, position)
		SELECT 'Jalon ' || n, ${projectId}, n FROM generate_series(1, 20) AS n`;
	const timings = [];
	for (const path of ['/', '/tasks', '/projects', `/projects/${projectId}`, '/review', '/trash']) {
		await page.goto(path);
		await expect(page.locator('h1')).toBeVisible();
		await assertNoOverflow(page);
		timings.push(
			await page.evaluate(() => {
				const navigation = performance.getEntriesByType(
					'navigation'
				)[0] as PerformanceNavigationTiming;
				return {
					path: location.pathname,
					ttfbMs: navigation.responseStart,
					domReadyMs: navigation.domContentLoadedEventEnd
				};
			})
		);
	}
	await testInfo.attach('navigation-timings', {
		body: JSON.stringify(timings, null, 2),
		contentType: 'application/json'
	});
});
