import { randomUUID } from 'node:crypto';
import { test, expect, createTask, assertNoOverflow, submitCapture } from './fixtures';

test('private pages and mutations reject anonymous and non-owner sessions', async ({
	page,
	login,
	context
}) => {
	await page.goto('/tasks');
	await expect(page).toHaveURL(/\/login$/);
	expect(
		(
			await context.request.post('/tasks?/create', {
				form: { title: 'Forbidden' },
				headers: { origin: 'http://127.0.0.1:4173' }
			})
		).status()
	).toBe(401);
	expect((await context.request.get('/api/search?q=secret')).status()).toBe(401);
	await login(false);
	await page.goto('/projects');
	await expect(page).toHaveURL(/\/login$/);
	await context.clearCookies();
	await login();
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Accueil', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Se déconnecter' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await page.goto('/tasks');
	await expect(page).toHaveURL(/\/login$/);
});

test('Collector persists Markdown and a due date, then Review can correct and confirm', async ({
	page,
	login,
	sql
}) => {
	await login();
	await page.goto('/');
	const title = `Préparer le dossier ${randomUUID()}`;
	const input = page.getByRole('combobox', { name: 'Qu’est-ce qui te passe par la tête ?' });
	await input.fill(`/today ${title}\n\n- [ ] Relire`);
	await submitCapture(page);
	await expect(input).toHaveValue('');
	await expect(input).toBeFocused();
	await expect(page.locator('[aria-live="polite"]')).toContainText('Task');
	await page.goto('/review');
	const card = page.locator('article').filter({ hasText: title });
	await expect(card).toContainText('Échéance');
	await card.getByRole('button', { name: 'Modifier' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByText('Project', { exact: true }).click();
	await expect(dialog.getByRole('radio', { name: 'Project', exact: true })).toBeChecked();
	await dialog.getByRole('button', { name: 'Changer le type' }).click();
	await expect(dialog).not.toBeVisible();
	await page.goto('/review?filter=all');
	await expect(card).toContainText('Project');
	await expect(card).toContainText('Confirmé');
	const [project] =
		await sql`SELECT title, description, due_date::text FROM projects WHERE title = ${title}`;
	expect(project.description).toBe('- [ ] Relire');
	expect(project.due_date).toBe(await page.evaluate(() => new Date().toLocaleDateString('sv-SE')));
	await page.goto('/projects');
	await page
		.getByRole('link')
		.filter({ has: page.getByRole('heading', { name: title, exact: true }) })
		.click();
	await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
});

test('a lost capture response retains the draft and retry creates no duplicate', async ({
	page,
	login,
	sql
}) => {
	await login();
	await page.goto('/');
	const title = `Réponse perdue ${randomUUID()}`;
	const input = page.getByRole('combobox', { name: 'Qu’est-ce qui te passe par la tête ?' });
	await page.route('**/?/capture', async (route) => {
		await route.fetch();
		await route.abort('failed');
	});
	await input.fill(title);
	await submitCapture(page);
	await expect(page.getByRole('alert')).toBeVisible();
	await expect(input).toHaveValue(title);
	await page.unroute('**/?/capture');
	await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
	await expect(input).toHaveValue('');
	await expect(page.locator('[aria-live="polite"]')).toContainText('Task');
	expect(await sql`SELECT id FROM entries WHERE raw_content = ${title}`).toHaveLength(1);
	expect(await sql`SELECT id FROM tasks WHERE title = ${title}`).toHaveLength(1);
});

test('failed Jev classification can be retried from Review', async ({ page, login }) => {
	await login();
	await page.goto('/');
	const title = `[retry] Action ${randomUUID()}`;
	const input = page.getByRole('combobox', { name: 'Qu’est-ce qui te passe par la tête ?' });
	await input.fill(title);
	await submitCapture(page);
	await expect(page.locator('[aria-live="polite"]')).toContainText('Non classée');
	await expect(page.getByRole('button', { name: 'Réessayer', exact: true })).toBeVisible();
	await page.goto('/review?filter=unclassified');
	await page.getByRole('button', { name: 'Réessayer Jev' }).click();
	await expect(page.getByRole('textbox', { name: 'Modifier la capture' })).toHaveCount(0);
	await page.goto('/review');
	const card = page.locator('article').filter({ hasText: title });
	await expect(card).toBeVisible();
	await card.getByRole('button', { name: 'Confirmer', exact: true }).click();
	await expect(card).not.toBeVisible();
	await page.goto('/review?filter=all');
	await expect(card).toContainText('Confirmé');
});

test('unclassified captures can be processed sequentially, skipped and classified manually', async ({
	page,
	login,
	sql
}) => {
	await login();
	const first = randomUUID();
	const second = randomUUID();
	await sql`INSERT INTO entries (id, raw_content, classification_state, created_at) VALUES
		(${first}, '[fail] Première', 'failed', '2026-01-01'),
		(${second}, '[fail] Deuxième', 'failed', '2026-01-02')`;
	await page.goto('/review?filter=unclassified');
	await page.getByRole('button', { name: 'Traiter une par une' }).click();
	const input = page.getByRole('textbox', { name: 'Modifier la capture' });
	await expect(input).toHaveValue('[fail] Première');
	await page.getByRole('button', { name: 'Plus tard' }).click();
	await expect(input).toHaveValue('[fail] Deuxième');
	await input.fill('Deuxième corrigée');
	await page.getByRole('button', { name: 'Task', exact: true }).click();
	await expect(page.getByText('Session terminée.', { exact: false })).toBeVisible();
	await page.getByRole('button', { name: 'Voir la liste' }).click();
	await expect(input).toHaveValue('[fail] Première');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await expect(page.getByText('Aucune capture non classée.')).toBeVisible();
	expect(await sql`SELECT id FROM tasks WHERE title = 'Deuxième corrigée'`).toHaveLength(1);
	expect(await sql`SELECT id FROM projects WHERE title = '[fail] Première'`).toHaveLength(1);
});

test('a Task supports start, Done, Undo, history and reopen', async ({ page, login }) => {
	await login();
	const card = await createTask(page, 'Exécuter une action');
	await card.getByRole('button', { name: 'Démarrer' }).click();
	await expect(card).toContainText('En cours');
	await card.getByRole('button', { name: 'Terminer' }).click();
	await expect(card).not.toBeVisible();
	await page.getByRole('button', { name: 'Annuler l’action' }).click();
	await expect(card).toContainText('En cours');
	await card.getByRole('button', { name: 'Terminer' }).click();
	await page.getByRole('link', { name: 'Historique', exact: true }).click();
	await expect(card).toContainText('Terminée');
	await card.getByRole('button', { name: 'Rouvrir' }).click();
	await page.getByRole('link', { name: 'Ouvertes', exact: true }).click();
	await expect(card).toContainText('À faire');
	await assertNoOverflow(page);
});

test('autosave retains drafts on network failure and Markdown checkboxes stay documentary', async ({
	page,
	login,
	sql
}) => {
	await login();
	const card = await createTask(page, 'Documenter une action');
	await card.getByRole('button', { name: 'Modifier' }).click();
	const dialog = page.getByRole('dialog');
	const input = dialog.getByRole('textbox', { name: 'Titre', exact: true });
	await expect(input).toBeFocused();
	await page.route('**/tasks?/save', (route) => route.abort('failed'));
	await input.fill('Titre conservé');
	await expect(dialog.getByRole('alert')).toBeVisible();
	await expect(input).toHaveValue('Titre conservé');
	await page.unroute('**/tasks?/save');
	await dialog.getByRole('button', { name: 'Réessayer', exact: true }).click();
	await expect(dialog.getByRole('alert')).not.toBeVisible();
	await dialog
		.getByRole('textbox', { name: 'Description Markdown' })
		.fill('- [ ] Relire\n\n<script>alert(1)</script>');
	await dialog.getByRole('button', { name: 'Aperçu', exact: true }).click();
	await dialog.getByRole('checkbox', { name: 'Relire' }).check();
	await expect
		.poll(
			async () =>
				(await sql`SELECT description FROM tasks WHERE title = 'Titre conservé'`)[0]?.description
		)
		.toContain('- [x] Relire');
	await dialog.getByRole('button', { name: 'Fermer la modale' }).click();
	await page.reload();
	const saved = page.locator('article').filter({ hasText: 'Titre conservé' });
	await expect(saved).toContainText('À faire');
	await saved.getByRole('button', { name: 'Modifier' }).click();
	await expect(dialog.getByRole('textbox', { name: 'Description Markdown' })).toHaveValue(
		'- [x] Relire\n\n<script>alert(1)</script>'
	);
});

test('a Project contains distinct Checkpoints and Tasks and closes without propagating statuses', async ({
	page,
	login,
	sql
}) => {
	await login();
	await page.goto('/projects');
	await page
		.getByRole('textbox', { name: 'Nouveau Project', exact: true })
		.fill('Livrer le portfolio');
	await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
	await page
		.getByRole('link')
		.filter({ has: page.getByRole('heading', { name: 'Livrer le portfolio', exact: true }) })
		.click();
	await page
		.getByRole('textbox', { name: 'Nouveau Checkpoint', exact: true })
		.fill('Version publique');
	await page
		.getByRole('region', { name: 'Checkpoints du Project' })
		.getByRole('button', { name: 'Ajouter', exact: true })
		.click();
	await expect(page.getByRole('heading', { name: 'Version publique', exact: true })).toBeVisible();
	await page
		.getByRole('combobox', { name: 'Nouvelle Task dans ce Project', exact: true })
		.fill('Publier la page');
	await page
		.locator('form')
		.filter({ has: page.getByRole('combobox', { name: 'Nouvelle Task dans ce Project' }) })
		.getByRole('button', { name: 'Ajouter', exact: true })
		.click();
	await expect(page.getByRole('heading', { name: 'Publier la page', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Terminé', exact: true }).click();
	const confirmation = page.getByRole('dialog');
	await expect(confirmation).toBeVisible();
	await confirmation.getByRole('button', { name: 'Terminer le Project', exact: true }).click();
	await expect(confirmation).not.toBeVisible();
	expect((await sql`SELECT status FROM tasks WHERE title = 'Publier la page'`)[0].status).toBe(
		'todo'
	);
	expect(
		(await sql`SELECT status FROM checkpoints WHERE title = 'Version publique'`)[0].status
	).toBe('open');
	await assertNoOverflow(page);
});

test('a recurring Task advances once and Undo preserves its anchor', async ({
	page,
	login,
	sql
}) => {
	await login();
	const id = randomUUID();
	await sql`INSERT INTO tasks (id, title, scheduled_date)
		VALUES (${id}, 'Routine quotidienne', '2026-01-01')`;
	await page.goto('/tasks');
	const card = page.locator(`#task-${id}`);
	await card.getByRole('button', { name: 'Modifier', exact: true }).click();
	const editor = page.getByRole('dialog');
	await editor.getByRole('button', { name: /^Récurrence/ }).click();
	await page.getByRole('option', { name: 'Tous les jours', exact: true }).click();
	await expect
		.poll(
			async () => (await sql`SELECT recurrence_rule FROM tasks WHERE id = ${id}`)[0].recurrence_rule
		)
		.toEqual({ frequency: 'daily', interval: 1 });
	await editor.getByRole('button', { name: 'Fermer la modale' }).click();
	await card.getByRole('button', { name: 'Terminer' }).click();
	await expect(page.getByRole('status')).toContainText('Prochaine date');
	const [advanced] =
		await sql`SELECT status, scheduled_date::text, recurrence_anchor_date::text FROM tasks WHERE id = ${id}`;
	expect(advanced.status).toBe('todo');
	expect(advanced.scheduled_date > '2026-01-01').toBe(true);
	expect(advanced.recurrence_anchor_date).toBe('2026-01-01');
	await page.getByRole('button', { name: 'Annuler l’action' }).click();
	await expect(card).toContainText('2026-01-01');
	expect(await sql`SELECT id FROM tasks`).toHaveLength(1);
});

test('Trash restores objects and purge requires an in-app confirmation', async ({
	page,
	login,
	sql
}) => {
	await login();
	const card = await createTask(page, 'À restaurer');
	await card.getByRole('button', { name: 'Supprimer', exact: true }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Supprimer la Task' }).click();
	await expect(card).not.toBeVisible();
	await page.getByRole('button', { name: 'Annuler la suppression' }).click();
	await expect(card).toBeVisible();
	await card.getByRole('button', { name: 'Supprimer', exact: true }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Supprimer la Task' }).click();
	await page.getByRole('link', { name: 'Corbeille', exact: true }).click();
	const trashCard = page.getByRole('listitem').filter({ hasText: 'À restaurer' });
	await trashCard.getByRole('button', { name: 'Restaurer', exact: true }).click();
	await expect(trashCard).not.toBeVisible();
	await page.goto('/tasks');
	await card.getByRole('button', { name: 'Supprimer', exact: true }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Supprimer la Task' }).click();
	await page.goto('/trash');
	await trashCard.getByRole('button', { name: 'Purger' }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.getByRole('dialog').getByRole('button', { name: 'Retour', exact: true }).click();
	await expect(trashCard).toBeVisible();
	await trashCard.getByRole('button', { name: 'Purger' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Purger définitivement' }).click();
	await expect(trashCard).not.toBeVisible();
	expect(await sql`SELECT id FROM tasks WHERE title = 'À restaurer'`).toHaveLength(0);
});

test('Project relations, order and Checkpoint status remain usable from the interface', async ({
	page,
	login,
	sql
}) => {
	await login();
	const source = randomUUID();
	const target = randomUUID();
	const checkpoint = randomUUID();
	const first = randomUUID();
	const second = randomUUID();
	await sql`INSERT INTO projects (id, title) VALUES (${source}, 'Source'), (${target}, 'Destination')`;
	await sql`INSERT INTO checkpoints (id, title, project_id, position) VALUES (${checkpoint}, 'Jalon', ${source}, 0)`;
	await sql`INSERT INTO tasks (id, title, project_id, position) VALUES
		(${first}, 'Première', ${source}, 0), (${second}, 'Deuxième', ${source}, 1)`;
	await page.goto(`/projects/${source}`);
	await page.getByRole('button', { name: 'Monter Deuxième' }).click();
	await expect
		.poll(async () =>
			(await sql`SELECT id FROM tasks WHERE project_id = ${source} ORDER BY position`).map(
				(row) => row.id
			)
		)
		.toEqual([second, first]);
	await page.getByRole('button', { name: /^Checkpoint de Deuxième/ }).click();
	await page.getByRole('option', { name: 'Jalon', exact: true }).click();
	await expect
		.poll(
			async () => (await sql`SELECT checkpoint_id FROM tasks WHERE id = ${second}`)[0].checkpoint_id
		)
		.toBe(checkpoint);
	const checkpointCard = page.locator(`#checkpoint-${checkpoint}`);
	await checkpointCard.getByRole('button', { name: 'Atteint', exact: true }).click();
	await expect(checkpointCard.getByRole('button', { name: 'Rouvrir', exact: true })).toBeVisible();
	await checkpointCard.getByRole('button', { name: 'Rouvrir', exact: true }).click();
	await expect(checkpointCard).toContainText('Ouvert');
	await page.getByRole('button', { name: /^Project de Deuxième/ }).click();
	await page.getByRole('option', { name: 'Destination', exact: true }).click();
	await expect
		.poll(
			async () => (await sql`SELECT project_id, checkpoint_id FROM tasks WHERE id = ${second}`)[0]
		)
		.toMatchObject({ project_id: target, checkpoint_id: null });
	await page.getByRole('button', { name: 'Annuler le déplacement' }).click();
	await expect(page.locator(`#task-${second}`)).toBeVisible();
	expect(
		(await sql`SELECT project_id, checkpoint_id FROM tasks WHERE id = ${second}`)[0]
	).toMatchObject({ project_id: source, checkpoint_id: null });
});
