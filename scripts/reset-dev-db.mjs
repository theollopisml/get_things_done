import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const envFile = join(root, '.env');
const compose = ['compose', '-f', join(root, 'docker-compose.yml'), '-p', 'get_things_done'];
if (existsSync(envFile)) loadEnvFile(envFile);

const localUrl = 'postgresql://postgres:postgres@127.0.0.1:5432/get_things_done';
let configuredUrl;
try {
	configuredUrl = new URL(process.env.DATABASE_URL);
} catch {
	console.error('DATABASE_URL doit pointer vers la base PostgreSQL locale de développement.');
	process.exit(1);
}

if (
	configuredUrl.protocol !== 'postgresql:' ||
	!['127.0.0.1', 'localhost'].includes(configuredUrl.hostname) ||
	configuredUrl.port !== '5432' ||
	configuredUrl.pathname !== '/get_things_done' ||
	configuredUrl.username !== 'postgres' ||
	configuredUrl.password !== 'postgres' ||
	configuredUrl.search ||
	configuredUrl.hash
) {
	console.error('Reset refusé : DATABASE_URL ne correspond pas à la base Docker locale attendue.');
	process.exit(1);
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: root,
		stdio: options.capture ? 'pipe' : 'inherit',
		env: { ...process.env, DATABASE_URL: localUrl }
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		if (options.capture) process.stderr.write(result.stderr);
		process.exit(result.status ?? 1);
	}
	return options.capture ? result.stdout.toString().trim() : '';
}

run('docker', [...compose, 'up', '-d', '--wait', 'db']);
const port = run('docker', [...compose, 'port', 'db', '5432'], { capture: true });
if (port !== '127.0.0.1:5432') {
	console.error(`Reset refusé : le service db n'écoute pas sur 127.0.0.1:5432 (${port}).`);
	process.exit(1);
}

run('docker', [
	...compose,
	'exec',
	'-T',
	'db',
	'dropdb',
	'--force',
	'--if-exists',
	'--username=postgres',
	'--maintenance-db=postgres',
	'get_things_done'
]);
run('docker', [
	...compose,
	'exec',
	'-T',
	'db',
	'createdb',
	'--username=postgres',
	'--owner=postgres',
	'get_things_done'
]);
run('pnpm', ['db:migrate']);
console.log('Base de développement réinitialisée. Reconnecte-toi à l’application.');
