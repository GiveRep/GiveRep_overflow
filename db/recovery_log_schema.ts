import { pgTable, serial, text, timestamp, bigint, integer, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Account Recovery Log - tracks all handle changes/recoveries
export const accountRecoveryLog = pgTable("account_recovery_log", {
  id: serial("id").primaryKey(),
  twitter_id: text("twitter_id").notNull(), // Twitter ID as string for consistency
  old_handle: text("old_handle").notNull(),
  new_handle: text("new_handle").notNull(),
  recovery_type: text("recovery_type").notNull().default('manual'), // 'manual', 'automatic', etc.
  
  // Track what was merged
  merged_reputation: integer("merged_reputation").default(0),
  rep_points_updated: integer("rep_points_updated").default(0),
  tweets_updated: integer("tweets_updated").default(0),
  loyalty_rewards_updated: integer("loyalty_rewards_updated").default(0),
  
  // Additional metadata
  metadata: jsonb("metadata"), // Store any additional data about the recovery
  
  // Timestamps
  recovered_at: timestamp("recovered_at").defaultNow().notNull(),
  recovered_by: text("recovered_by"), // Could be 'user', 'admin', 'system'
}, (table) => {
  return {
    twitterIdIdx: index("account_recovery_log_twitter_id_idx").on(table.twitter_id),
    oldHandleIdx: index("account_recovery_log_old_handle_idx").on(table.old_handle),
    newHandleIdx: index("account_recovery_log_new_handle_idx").on(table.new_handle),
    recoveredAtIdx: index("account_recovery_log_recovered_at_idx").on(table.recovered_at),
  };
});

export type AccountRecoveryLog = typeof accountRecoveryLog.$inferSelect;
export type NewAccountRecoveryLog = typeof accountRecoveryLog.$inferInsert;