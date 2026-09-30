import { defineConfig, devices } from '@playwright/test';
import { authSecret, baseURL, databaseURL, ownerId } from './tests/e2e/environment';

export default defineConfig({
	testDir: './tests/e2e',
	globalSetup: './tests/e2e/global-setup.ts',
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: 0,
	timeout: 30_000,
	expect: { timeout: 8_000 },
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL,
		timezoneId: 'Europe/Paris',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['Pixel 7'] } },
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
	],
	webServer: {
		command: 'node --import ./tests/e2e/mock-openrouter.mjs build/index.js',
		url: `${baseURL}/health`,
		reuseExistingServer: false,
		gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
		env: {
			DATABASE_URL: databaseURL,
			ORIGIN: baseURL,
			HOST: '127.0.0.1',
			PORT: '4173',
			BETTER_AUTH_URL: baseURL,
			BETTER_AUTH_SECRET: authSecret,
			OWNER_GITHUB_ID: ownerId,
			GITHUB_CLIENT_ID: 'e2e-unused',
			GITHUB_CLIENT_SECRET: 'e2e-unused',
			OPENROUTER_API_KEY: 'e2e-unused'
		}
	}
});
