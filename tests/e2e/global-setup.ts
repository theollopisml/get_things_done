import postgres from 'postgres';
import { spawnSync } from 'node:child_process';
import { databaseURL } from './environment';

export default async function setup() {
	const adminURL = new URL(databaseURL);
	adminURL.pathname = '/postgres';
	const admin = postgres(adminURL.toString(), { max: 1 });
	try {
		const existing = await admin`SELECT 1 FROM pg_database WHERE datname = 'get_things_done_e2e'`;
		if (!existing.length) await admin`CREATE DATABASE get_things_done_e2e`;
	} finally {
		await admin.end();
	}
	const migration = spawnSync('pnpm', ['db:migrate'], {
		stdio: 'inherit',
		env: { ...process.env, DATABASE_URL: databaseURL }
	});
	if (migration.status !== 0) throw new Error('E2E migrations failed.');
}
