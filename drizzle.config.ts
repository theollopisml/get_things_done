import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'drizzle-kit';

if (existsSync('.env')) {
	loadEnvFile('.env');
}

const url = process.env.DATABASE_URL;

if (!url) {
	throw new Error('DATABASE_URL is required for Drizzle commands');
}

export default defineConfig({
	dialect: 'postgresql',
	schema: ['./src/lib/server/db/schema.ts', './src/lib/server/db/auth-schema.ts'],
	out: './drizzle/migrations',
	dbCredentials: { url }
});
