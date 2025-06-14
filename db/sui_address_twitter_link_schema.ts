import { pgTable, varchar, timestamp, unique, boolean, index } from 'drizzle-orm/pg-core';

export const sui_address_twitter_link = pgTable('sui_address_twitter_link', {
  sui_address: varchar('sui_address', { length: 66 }).primaryKey(), // SUI addresses are 66 chars (0x + 64 hex chars)
  twitter_handle: varchar('twitter_handle', { length: 255 }).notNull(),
  is_tracking_pnl: boolean('is_tracking_pnl').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    // Ensure twitter handle is unique per address
    uniqueAddressHandle: unique('unique_address_handle').on(table.sui_address, table.twitter_handle),
    // Index for efficient filtering of tracked addresses
    idxTrackingPnl: index('idx_tracking_pnl').on(table.is_tracking_pnl),
  };
});