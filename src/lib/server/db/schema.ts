import { sql } from 'drizzle-orm';
import {
	check,
	date,
	pgTable,
	text,
	time,
	timestamp,
	uuid,
	integer,
	jsonb
} from 'drizzle-orm/pg-core';

export const entries = pgTable('entries', {
	id: uuid('id').defaultRandom().primaryKey(),
	rawContent: text('raw_content').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp('deleted_at', { withTimezone: true })
});

export const visions = pgTable(
	'visions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		title: text('title').notNull(),
		description: text('description'),
		status: text('status', { enum: ['active', 'paused', 'archived'] })
			.default('active')
			.notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true })
	},
	(table) => [
		check('visions_status_check', sql`${table.status} IN ('active', 'paused', 'archived')`)
	]
);

export const projects = pgTable(
	'projects',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		visionId: uuid('vision_id').references(() => visions.id),
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
