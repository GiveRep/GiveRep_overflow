import { pgTable, serial, varchar, integer, timestamp, bigint, index, text } from 'drizzle-orm/pg-core';

export const trustUsers = pgTable('trust_users', {
  id: serial('id').primaryKey(),
  twitter_handle: varchar('twitter_handle', { length: 255 }).notNull().unique(),
  twitter_id: bigint('twitter_id', { mode: 'bigint' }),
  trusted_follower_count: integer('trusted_follower_count').default(0).notNull(),
  last_updated: timestamp('last_updated').defaultNow().notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  handleIdx: index('idx_trust_users_handle').on(table.twitter_handle),
  countIdx: index('idx_trust_users_trusted_count').on(table.trusted_follower_count),
}));

export const trustCountSessions = pgTable('trust_count_sessions', {
  id: serial('id').primaryKey(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  total_cache_entries: integer('total_cache_entries'),
  processed_entries: integer('processed_entries').default(0),
  total_users_counted: integer('total_users_counted').default(0),
  started_at: timestamp('started_at').defaultNow().notNull(),
  completed_at: timestamp('completed_at'),
  last_updated: timestamp('last_updated').defaultNow().notNull(),
  error_message: text('error_message'),
});