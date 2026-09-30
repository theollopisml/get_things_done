import { test, expect } from './fixtures';

test('OAuth failures explain recovery without reflecting provider input', async ({ page }) => {
	await page.goto('/login?error=owner_only');
	await expect(page.getByRole('alert')).toContainText('compte GitHub n’est pas autorisé');
	await expect(page.getByRole('button', { name: 'Continuer avec GitHub' })).toBeEnabled();

	await page.goto('/login?error=state_mismatch');
	await expect(page.getByRole('alert')).toContainText('ce même navigateur');

	await page.goto('/login?error=%3Cscript%3Eprivate-provider-detail%3C%2Fscript%3E');
	await expect(page.getByRole('alert')).toContainText('La connexion GitHub a échoué');
	await expect(page.getByRole('alert')).not.toContainText('private-provider-detail');
});

test('a failed sign-in request leaves the login button available for another attempt', async ({
	page
}) => {
	let attempts = 0;
	await page.route('**/api/auth/sign-in/social', async (route) => {
		attempts += 1;
		await route.fulfill({
			status: 400,
			contentType: 'application/json',
			body: JSON.stringify({ code: 'TEST_FAILURE', message: 'Sign-in failed' })
		});
	});
	await page.goto('/login');
	const button = page.getByRole('button', { name: 'Continuer avec GitHub' });
	await button.click();
	await expect(page.getByRole('alert')).toContainText('Connexion impossible. Réessaie.');
	await expect(button).toBeEnabled();
	await button.click();
	await expect(button).toBeEnabled();
	expect(attempts).toBe(2);
});

test('GitHub authorization offers account selection while preserving OAuth state', async ({
	context
}) => {
	const response = await context.request.post('/api/auth/sign-in/social', {
		headers: { origin: 'http://127.0.0.1:4173' },
		data: { provider: 'github', callbackURL: '/', errorCallbackURL: '/login' }
	});
	expect(response.ok()).toBe(true);
	const authorization = new URL((await response.json()).url);
	expect(authorization.origin).toBe('https://github.com');
	expect(authorization.searchParams.get('prompt')).toBe('select_account');
	expect(authorization.searchParams.get('state')).toBeTruthy();
});
