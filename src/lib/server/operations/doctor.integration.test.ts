import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import postgres, { type Sql } from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { env } from '$env/dynamic/private';
import { formatDiagnostics, inspectDatabase } from './doctor';

const execute = promisify(execFile);
const folder = join(process.cwd(), 'drizzle/migrations');
const migrations = readMigrationFiles({ migrationsFolder: folder });

describe.runIf(process.env.RUN_DB_TESTS === '1')('operational diagnosis with PostgreSQL', () => {
	let admin: Sql;
	let sql: Sql;
	let url: string;
	const name = `gtd_doctor_${crypto.randomUUID().replaceAll('-', '')}`;
	beforeAll(async () => {
		const source = new URL(env.DATABASE_URL);
		admin = postgres(source.toString(), { max: 1 });
		await admin`create database ${admin(name)}`;
		source.pathname = `/${name}`;
		url = source.toString();
		sql = postgres(url, { max: 1 });
		await migrate(drizzle(sql), { migrationsFolder: folder });
	}, 15000);
	afterAll(async () => {
		if (sql) await sql.end({ timeout: 1 });
		if (admin) {
			await admin`drop database if exists ${admin(name)} with (force)`;
			await admin.end({ timeout: 1 });
		}
	});

	it('accepts unordered attached Tasks and historical Review links, and runs read only', async () => {
		const [project] =
			await sql`insert into projects (title) values ('Fixture parent') returning id`;
		const [task] =
			await sql`insert into tasks (title, project_id) values ('Fixture task', ${project.id}) returning id`;
		const [historical] =
			await sql`insert into tasks (title, deleted_at) values ('Fixture historical', now()) returning id`;
		await sql`insert into entries (raw_content, classification_state, classification_source, classified_at, task_id)
			values ('Fixture capture', 'classified', 'jev', now(), ${historical.id})`;
		const before = await sql`select to_jsonb(t) as data from tasks t order by id`;
		const findings = await inspectDatabase(sql, migrations);
		expect(findings.every((finding) => finding.ids.length === 0)).toBe(true);
		expect(await sql`select to_jsonb(t) as data from tasks t order by id`).toEqual(before);
		const result = await execute(process.execPath, ['scripts/doctor.mjs'], {
			env: { ...process.env, DATABASE_URL: url }
		});
		expect(result.stdout).toContain('OK Migrations: 0');
		expect(result.stdout).not.toContain(task.id);
	});

	it('identifies broken relationships, dates, recurrence and positions without leaking content', async () => {
		const [deleted] =
			await sql`insert into projects (title, deleted_at) values ('private project', now()) returning id`;
		const [other] = await sql`insert into projects (title) values ('private other') returning id`;
		const [checkpoint] = await sql`insert into checkpoints (title, project_id, position)
			values ('private checkpoint', ${deleted.id}, -1) returning id`;
		const [wrongParent] = await sql`insert into tasks (title, project_id, checkpoint_id, position)
			values ('private wrong parent', ${other.id}, ${checkpoint.id}, -1) returning id`;
		const [deletedParent] =
			await sql`insert into tasks (title, project_id) values ('private deleted parent', ${deleted.id}) returning id`;
		const [invalidRule] =
			await sql`insert into tasks (title, recurrence_rule, recurrence_anchor_date, scheduled_date)
			values ('private recurrence', '{"frequency":"weekly","interval":1,"weekdays":[1,1]}', '2026-10-01', '2026-09-30') returning id`;
		const [invalidStatusDate] =
			await sql`insert into tasks (title, status) values ('private completed', 'done') returning id`;
		const [entry] =
			await sql`insert into entries (raw_content) values ('private raw content') returning id`;
		// Corrupt only the isolated fixture database to exercise otherwise constrained legacy data.
		await sql`alter table tasks drop constraint tasks_recurrence_check`;
		await sql`update tasks set due_date = '2026-10-01' where id = ${invalidRule.id}`;
		await sql`alter table entries drop constraint entries_classification_consistency_check`;
		await sql`update entries set task_id = ${wrongParent.id} where id = ${entry.id}`;
		const findings = await inspectDatabase(sql, migrations);
		const ids = findings.flatMap((finding) => finding.ids);
		for (const id of [
			checkpoint.id,
			wrongParent.id,
			deletedParent.id,
			invalidRule.id,
			invalidStatusDate.id,
			entry.id
		])
			expect(ids).toContain(id);
		expect(
			findings.find((finding) => finding.name === 'Tasks avec règle de récurrence invalide')?.ids
		).toContain(invalidRule.id);
		expect(
			findings.find((finding) => finding.name === 'Tasks avec dates ou récurrence incohérentes')
				?.ids
		).toContain(invalidRule.id);
		const concise = formatDiagnostics(findings, false);
		const verbose = formatDiagnostics(findings, true);
		expect(concise).not.toContain(wrongParent.id);
		expect(verbose).toContain(wrongParent.id);
		expect(verbose).not.toContain('private');
		try {
			await execute(process.execPath, ['scripts/doctor.mjs', '--verbose'], {
				env: { ...process.env, DATABASE_URL: url }
			});
			throw new Error('Expected doctor to reject inconsistent data');
		} catch (error) {
			expect(error).toMatchObject({ code: 1, stdout: expect.stringContaining(wrongParent.id) });
		}
	});

	it('reports orphaned links and active references to deleted Checkpoints', async () => {
		await sql`alter table tasks drop constraint tasks_project_id_projects_id_fk`;
		await sql`alter table tasks drop constraint tasks_checkpoint_id_checkpoints_id_fk`;
		await sql`alter table checkpoints drop constraint checkpoints_project_id_projects_id_fk`;
		await sql`alter table entries drop constraint entries_task_id_tasks_id_fk`;
		const absent = crypto.randomUUID();
		const [task] = await sql`insert into tasks (title, project_id, checkpoint_id)
			values ('private orphan task', ${absent}, ${absent}) returning id`;
		const [checkpoint] = await sql`insert into checkpoints (title, project_id, position)
			values ('private orphan checkpoint', ${absent}, 0) returning id`;
		const [entry] =
			await sql`insert into entries (raw_content, classification_state, classification_source, classified_at, task_id)
			values ('private orphan capture', 'classified', 'manual', now(), ${absent}) returning id`;
		const [deletedCheckpoint] =
			await sql`insert into checkpoints (title, project_id, position, deleted_at)
			values ('private deleted checkpoint', ${absent}, 0, now()) returning id`;
		const [linkedTask] = await sql`insert into tasks (title, checkpoint_id)
			values ('private checkpoint reference', ${deletedCheckpoint.id}) returning id`;
		const findings = await inspectDatabase(sql, migrations);
		expect(
			findings.find((finding) => finding.name === 'Tasks avec Project absent ou supprimé')?.ids
		).toContain(task.id);
		expect(
			findings.find((finding) => finding.name === 'Tasks avec Checkpoint absent ou supprimé')?.ids
		).toEqual(expect.arrayContaining([task.id, linkedTask.id]));
		expect(
			findings.find((finding) => finding.name === 'Checkpoints avec Project absent ou supprimé')
				?.ids
		).toContain(checkpoint.id);
		expect(
			findings.find((finding) => finding.name === 'Entries classifiées incohérentes')?.ids
		).toContain(entry.id);
	});

	it('reports missing or modified migrations before querying incomplete schemas', async () => {
		await sql`update drizzle.__drizzle_migrations set hash = 'modified' where created_at = ${migrations[0].folderMillis}`;
		expect(await inspectDatabase(sql, migrations)).toEqual([
			{ name: 'Migrations', ids: [`manquante_ou_modifiée:${migrations[0].folderMillis}`] }
		]);
		await sql`delete from drizzle.__drizzle_migrations where created_at = ${migrations[0].folderMillis}`;
		expect((await inspectDatabase(sql, migrations))[0].ids).toContain(
			`manquante_ou_modifiée:${migrations[0].folderMillis}`
		);
		await sql`drop schema drizzle cascade`;
		expect(await inspectDatabase(sql, migrations)).toEqual([
			{ name: 'Migrations', ids: ['historique_absent'] }
		]);
	});

	it('uses exit code 2 for unavailable databases and unsupported flags', async () => {
		const unavailable = new URL(url);
		unavailable.pathname = '/gtd_doctor_missing_database';
		await expect(
			execute(process.execPath, ['scripts/doctor.mjs'], {
				env: { ...process.env, DATABASE_URL: unavailable.toString() }
			})
		).rejects.toMatchObject({ code: 2, stderr: expect.stringContaining('Doctor impossible') });
		await expect(
			execute(process.execPath, ['scripts/doctor.mjs', '--fix'], {
				env: { ...process.env, DATABASE_URL: url }
			})
		).rejects.toMatchObject({ code: 2, stderr: expect.stringContaining('Usage:') });
	});
});
