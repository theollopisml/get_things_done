import type { Sql } from 'postgres';
import type { MigrationMeta } from 'drizzle-orm/migrator';
import { recurrenceRuleSchema } from '../../domain/recurrence.ts';

export type Diagnostic = { name: string; ids: string[] };

export async function inspectDatabase(
	sql: Sql,
	migrations: MigrationMeta[]
): Promise<Diagnostic[]> {
	return sql.begin(async (tx) => {
		await tx`set transaction isolation level repeatable read, read only`;
		await tx`set local statement_timeout = '5s'`;
		const findings: Diagnostic[] = [];
		const [metadata] = await tx`select to_regclass('drizzle.__drizzle_migrations') as name`;
		if (!metadata.name) return [{ name: 'Migrations', ids: ['historique_absent'] }];
		const applied = await tx<{ hash: string; created_at: string }[]>`
			select hash, created_at from drizzle.__drizzle_migrations order by created_at`;
		const migrationIds = migrations
			.filter(
				(migration) =>
					!applied.some(
						(row) =>
							Number(row.created_at) === migration.folderMillis && row.hash === migration.hash
					)
			)
			.map((migration) => `manquante_ou_modifiée:${migration.folderMillis}`);
		for (const row of applied) {
			if (!migrations.some((migration) => migration.folderMillis === Number(row.created_at))) {
				migrationIds.push(`inconnue:${row.created_at}`);
			}
		}
		for (const migration of migrations) {
			if (applied.filter((row) => Number(row.created_at) === migration.folderMillis).length > 1) {
				migrationIds.push(`doublon:${migration.folderMillis}`);
			}
		}
		findings.push({ name: 'Migrations', ids: migrationIds });
		if (migrationIds.length) return findings;

		async function check(name: string, query: PromiseLike<{ id: string }[]>) {
			const rows = await query;
			findings.push({ name, ids: rows.map((row) => row.id) });
		}
		await check(
			'Tasks avec Project absent ou supprimé',
			tx`
			select t.id from tasks t left join projects p on p.id = t.project_id
			where t.deleted_at is null and t.project_id is not null
			and (p.id is null or p.deleted_at is not null)`
		);
		await check(
			'Tasks avec Checkpoint absent ou supprimé',
			tx`
			select t.id from tasks t left join checkpoints c on c.id = t.checkpoint_id
			where t.deleted_at is null and t.checkpoint_id is not null
			and (c.id is null or c.deleted_at is not null)`
		);
		await check(
			'Tasks avec Checkpoint d’un autre Project',
			tx`
			select t.id from tasks t join checkpoints c on c.id = t.checkpoint_id
			where t.deleted_at is null and c.deleted_at is null
			and t.project_id is distinct from c.project_id`
		);
		await check(
			'Checkpoints avec Project absent ou supprimé',
			tx`
			select c.id from checkpoints c left join projects p on p.id = c.project_id
			where c.deleted_at is null and (p.id is null or p.deleted_at is not null)`
		);
		await check(
			'Tasks avec dates ou récurrence incohérentes',
			tx`
			select id from tasks where deleted_at is null and (
				(scheduled_time is not null and scheduled_date is null)
				or (due_time is not null and due_date is null)
				or ((recurrence_rule is null) <> (recurrence_anchor_date is null))
				or (recurrence_rule is not null and (
					scheduled_date is null or due_date is not null or due_time is not null or status = 'done')))`
		);
		const recurring = await tx<{ id: string; recurrence_rule: unknown }[]>`
			select id, recurrence_rule from tasks where deleted_at is null and recurrence_rule is not null`;
		findings.push({
			name: 'Tasks avec règle de récurrence invalide',
			ids: recurring
				.filter((row) => !recurrenceRuleSchema.safeParse(row.recurrence_rule).success)
				.map((row) => row.id)
		});
		// A null Task position is valid: Jev and manual classification can attach an unordered Task.
		await check(
			'Positions de Task invalides',
			tx`
			select id from tasks where deleted_at is null and
			(position < 0 or (project_id is null and position is not null))`
		);
		await check(
			'Positions de Checkpoint invalides',
			tx`
			select id from checkpoints where deleted_at is null and position < 0`
		);
		await check(
			'Statuts et dates de clôture incohérents',
			tx`
			select id from tasks where deleted_at is null and (
				status not in ('todo', 'in_progress', 'done', 'cancelled')
				or ((status = 'done') <> (completed_at is not null))
				or ((status = 'cancelled') <> (cancelled_at is not null)))
			union all select id from projects where deleted_at is null and (
				status not in ('planned', 'active', 'paused', 'done', 'cancelled')
				or ((status = 'done') <> (completed_at is not null))
				or (status = 'active' and started_at is null))
			union all select id from checkpoints where deleted_at is null and (
				status not in ('open', 'done', 'cancelled')
				or ((status = 'done') <> (completed_at is not null)))`
		);
		// Review deliberately retains historical links to soft-deleted classified objects.
		await check(
			'Entries classifiées incohérentes',
			tx`
			select e.id from entries e left join tasks t on t.id = e.task_id
			left join projects p on p.id = e.project_id where e.deleted_at is null and (
				e.classification_state not in ('pending', 'failed', 'classified')
				or (e.classification_state = 'classified' and (
					e.classification_source is null or e.classification_source not in ('jev', 'manual')
					or e.classified_at is null or num_nonnulls(e.task_id, e.project_id) <> 1
					or (e.task_id is not null and t.id is null)
					or (e.project_id is not null and p.id is null)))
				or (e.classification_state <> 'classified' and (
					e.classification_source is not null or e.classified_at is not null
					or e.task_id is not null or e.project_id is not null or e.reviewed_at is not null))
				or (e.reviewed_at is not null and e.classification_source is distinct from 'jev')
				or (e.type_probability is not null and e.type_probability not between 0 and 1)
				or (e.relation_probability is not null and e.relation_probability not between 0 and 1))`
		);
		return findings;
	});
}

export function formatDiagnostics(findings: Diagnostic[], verbose: boolean): string {
	return findings
		.map(({ name, ids }) =>
			[
				`${ids.length ? 'FAIL' : 'OK'} ${name}: ${ids.length}`,
				...(verbose ? ids.map((id) => `  ${id}`) : [])
			].join('\n')
		)
		.join('\n');
}
