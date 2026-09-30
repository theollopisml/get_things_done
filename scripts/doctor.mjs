import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import postgres from 'postgres';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { inspectDatabase, formatDiagnostics } from '../src/lib/server/operations/doctor.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--verbose')) {
	console.error('Usage: pnpm run doctor [--verbose]');
	process.exit(2);
}
let sql;
try {
	const envFile = join(root, '.env');
	if (existsSync(envFile)) loadEnvFile(envFile);
	if (!process.env.DATABASE_URL) {
		console.error('DATABASE_URL est nécessaire pour pnpm run doctor.');
		process.exit(2);
	}
	sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 5 });
	const migrations = readMigrationFiles({ migrationsFolder: join(root, 'drizzle/migrations') });
	const findings = await inspectDatabase(sql, migrations);
	console.log(formatDiagnostics(findings, args.includes('--verbose')));
	process.exitCode = findings.some((finding) => finding.ids.length) ? 1 : 0;
} catch {
	console.error('Doctor impossible : connexion, schéma ou fichiers de migration indisponibles.');
	process.exitCode = 2;
} finally {
	if (sql) await sql.end({ timeout: 1 });
}
