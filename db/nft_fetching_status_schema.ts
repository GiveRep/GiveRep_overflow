import { pgTable, text, integer, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';

export const nftFetchingStatus = pgTable('nft_fetching_status', {
  id: uuid('id').primaryKey().defaultRandom(),
  objectType: text('object_type').notNull().unique(),
  collectionName: text('collection_name').notNull(),
  status: text('status').notNull().default('idle'), // idle, in_progress, completed, failed
  totalSupply: integer('total_supply'),
  totalFetched: integer('total_fetched').default(0),
  lastPageNumber: integer('last_page_number').default(0),
  lastCursor: text('last_cursor'),
  startedAt: timestamp('started_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  errorMessage: text('error_message'),
  isStale: boolean('is_stale').default(false), // marks if data is older than 72 hours
});