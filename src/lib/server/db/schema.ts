import { sql } from 'drizzle-orm';
import {
	check,
	date,
	doublePrecision,
	pgTable,
	text,
	time,
	timestamp,
	uuid,
	integer,
	jsonb
} from 'drizzle-orm/pg-core';

export const projects = pgTable(
	'projects',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		title: text('title').notNull(),
		description: text('description'),
		status: text('status', { enum: ['planned', 'active', 'paused', 'done', 'cancelled'] })
			.default('planned')
			.notNull(),
		startDate: date('start_date'),
		dueDate: date('due_date'),
		startedAt: timestamp('started_at', { withTimezone: true }),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(table) => [
		check(
			'projects_status_check',
			sql`${table.status} IN ('planned', 'active', 'paused', 'done', 'cancelled')`
		)
	]
);

export const checkpoints = pgTable(
	'checkpoints',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id),
		title: text('title').notNull(),
		description: text('description'),
		status: text('status', { enum: ['open', 'done', 'cancelled'] })
			.default('open')
			.notNull(),
		targetDate: date('target_date'),
		position: integer('position').notNull(),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(table) => [
		check('checkpoints_status_check', sql`${table.status} IN ('open', 'done', 'cancelled')`)
	]
);

export const tasks = pgTable(
	'tasks',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		projectId: uuid('project_id').references(() => projects.id),
		checkpointId: uuid('checkpoint_id').references(() => checkpoints.id),
		title: text('title').notNull(),
		description: text('description'),
		status: text('status', { enum: ['todo', 'in_progress', 'done', 'cancelled'] })
			.default('todo')
			.notNull(),
		scheduledDate: date('scheduled_date'),
		scheduledTime: time('scheduled_time'),
		dueDate: date('due_date'),
		dueTime: time('due_time'),
		recurrenceRule: jsonb('recurrence_rule'),
		recurrenceAnchorDate: date('recurrence_anchor_date'),
		position: integer('position'),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(table) => [
		check(
			'tasks_status_check',
			sql`${table.status} IN ('todo', 'in_progress', 'done', 'cancelled')`
		),
		check(
			'tasks_scheduled_time_check',
			sql`${table.scheduledTime} IS NULL OR ${table.scheduledDate} IS NOT NULL`
		),
		check('tasks_due_time_check', sql`${table.dueTime} IS NULL OR ${table.dueDate} IS NOT NULL`),
		check(
			'tasks_recurrence_check',
			sql`${table.recurrenceRule} IS NULL OR (${table.scheduledDate} IS NOT NULL AND ${table.dueDate} IS NULL AND ${table.dueTime} IS NULL)`
		)
	]
);

export const entries = pgTable(
	'entries',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		captureRequestId: uuid('capture_request_id').unique(),
		rawContent: text('raw_content').notNull(),
		classificationState: text('classification_state', {
			enum: ['pending', 'failed', 'classified']
		})
			.default('pending')
			.notNull(),
		classificationSource: text('classification_source', { enum: ['jev', 'manual'] }),
		taskId: uuid('task_id').references(() => tasks.id),
		projectId: uuid('project_id').references(() => projects.id),
		classifiedAt: timestamp('classified_at', { withTimezone: true }),
		reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
		jevModel: text('jev_model'),
		typeProbability: doublePrecision('type_probability'),
		relationProbability: doublePrecision('relation_probability'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(table) => [
		check(
			'entries_classification_state_check',
			sql`${table.classificationState} IN ('pending', 'failed', 'classified')`
		),
		check(
			'entries_classification_source_check',
			sql`${table.classificationSource} IS NULL OR ${table.classificationSource} IN ('jev', 'manual')`
		),
		check(
			'entries_classification_consistency_check',
			sql`(${table.classificationState} = 'classified' AND ${table.classificationSource} IS NOT NULL AND ${table.classifiedAt} IS NOT NULL AND num_nonnulls(${table.taskId}, ${table.projectId}) = 1) OR (${table.classificationState} IN ('pending', 'failed') AND ${table.classificationSource} IS NULL AND ${table.classifiedAt} IS NULL AND num_nonnulls(${table.taskId}, ${table.projectId}) = 0)`
		),
		check(
			'entries_reviewed_at_check',
			sql`${table.reviewedAt} IS NULL OR (${table.classificationState} = 'classified' AND ${table.classificationSource} = 'jev')`
		),
		check(
			'entries_type_probability_check',
			sql`${table.typeProbability} IS NULL OR (${table.typeProbability} >= 0 AND ${table.typeProbability} <= 1)`
		),
		check(
			'entries_relation_probability_check',
			sql`${table.relationProbability} IS NULL OR (${table.relationProbability} >= 0 AND ${table.relationProbability} <= 1)`
		)
	]
);
