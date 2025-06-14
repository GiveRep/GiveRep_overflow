import { pgTable, serial, varchar, boolean, text, timestamp, index } from 'drizzle-orm/pg-core';

export const manualTweetAuditLog = pgTable('manual_tweet_audit_log', {
  id: serial('id').primaryKey(),
  tweetId: varchar('tweet_id', { length: 255 }).notNull(),
  tweetUrl: varchar('tweet_url', { length: 500 }),
  addedByHandle: varchar('added_by_handle', { length: 255 }),
  addedByTwitterId: varchar('added_by_twitter_id', { length: 255 }),
  addedByWallet: varchar('added_by_wallet', { length: 255 }),
  ipAddress: varchar('ip_address', { length: 100 }),
  userAgent: text('user_agent'),
  reputationAwarded: boolean('reputation_awarded').default(false),
  reputationReason: text('reputation_reason'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  addedByHandleIdx: index('idx_manual_tweet_audit_added_by_handle').on(table.addedByHandle),
  tweetIdIdx: index('idx_manual_tweet_audit_tweet_id').on(table.tweetId),
  createdAtIdx: index('idx_manual_tweet_audit_created_at').on(table.createdAt),
}));