import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

let sql;
try {
	if (!process.env.DATABASE_URL) throw new Error('Missing database configuration');
	sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
	await migrate(drizzle(sql), {
		migrationsFolder: fileURLToPath(new URL('../drizzle/migrations', import.meta.url))
	});
	console.log('Migrations applied.');
} catch {
	console.error('Migration failed: check database access and migration files.');
	process.exitCode = 1;
} finally {
	if (sql) await sql.end({ timeout: 5 });
}
