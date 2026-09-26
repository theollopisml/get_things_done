import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const entries = pgTable('entries', {
	id: uuid('id').defaultRandom().primaryKey(),
	rawContent: text('raw_content').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	deletedAt: timestamp('deleted_at', { withTimezone: true })
});
