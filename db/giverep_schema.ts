import { pgTable, serial, text, boolean, timestamp, integer, varchar, unique, index, real, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// GiveRep users table
export const giverepUsers = pgTable("giverep_users", {
  id: serial("id").primaryKey(),
  twitter_handle: text("twitter_handle").notNull(),
  twitter_id: text("twitter_id"),  // Twitter ID to track users across handle changes
  wallet_address: text("wallet_address"),
  verification_code: text("verification_code"),
  is_verified: boolean("is_verified").default(false).notNull(),
  follower_count: integer("follower_count").default(0).notNull(),
  profile_url: text("profile_url").default(""),
  // Twitter profile fields
  display_name: text("display_name"),
  profile_picture: text("profile_picture"),
  cover_picture: text("cover_picture"), // Banner image from Twitter
  bio: text("bio"),
  location: text("location"),
  account_created_at: timestamp("account_created_at"),
  following_count: integer("following_count"),
  is_twitter_verified: boolean("is_twitter_verified").default(false),
  is_blue_verified: boolean("is_blue_verified").default(false),
  // Engagement metrics
  engagement_score: integer("engagement_score").default(0),
  engagement_rank: integer("engagement_rank").default(0),
  last_rank_update: timestamp("last_rank_update"),
  // Enhanced content quality metrics
  content_quality_score: integer("content_quality_score"),
  content_quality: varchar("content_quality", { length: 20 }),
  content_quality_last_analyzed: timestamp("content_quality_last_analyzed"),
  content_quality_confidence: real("content_quality_confidence"),
  content_quality_depth: real("content_quality_depth"),
  content_quality_originality: real("content_quality_originality"),
  content_quality_engagement: real("content_quality_engagement"),
  content_quality_educational: real("content_quality_educational"),
  // Trading data from InsideX API
  pnl: real("pnl"),
  trading_pnl: real("trading_pnl"),
  trading_volume: real("trading_volume"),
  trading_total_trades: integer("trading_total_trades"),
  trading_win_rate: real("trading_win_rate"),
  trading_roi: real("trading_roi"),
  trading_avg_sold_in: real("trading_avg_sold_in"),
  trading_last_updated: text("trading_last_updated"), // ISO string for last update time
  trading_data: jsonb("trading_data"),
  trading_data_updated_at: timestamp("trading_data_updated_at"),
  // Existing timestamp fields
  registered_at: timestamp("registered_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    // Ensure unique Twitter handles
    twitterHandleIdx: unique("giverep_twitter_handle_idx").on(table.twitter_handle),
    // Also ensure unique Twitter IDs when present
    twitterIdIdx: unique("giverep_twitter_id_idx").on(table.twitter_id),
    // Case-insensitive index for faster lookups with LOWER()
    // This is implemented in the database as a functional index on LOWER(twitter_handle)
    twitterHandleLowerIdx: index("idx_giverep_users_twitter_handle_lower").on(table.twitter_handle),
    // Performance indexes for engagement ranking and verification
    engagementRankIdx: index("idx_giverep_users_engagement_rank").on(table.engagement_rank),
    isVerifiedIdx: index("idx_giverep_users_is_verified").on(table.is_verified),
  };
});

// GiveRep tweets table
export const giverepTweets = pgTable("giverep_tweets", {
  id: serial("id").primaryKey(),
  tweet_id: text("tweet_id").notNull(),
  user_id: integer("user_id").notNull(),
  content: text("content").notNull(),
  views: integer("views").default(0).notNull(),
  likes: integer("likes").default(0).notNull(),
  retweet_count: integer("retweet_count").default(0).notNull(),
  comment_count: integer("comment_count").default(0).notNull(),
  date_posted: timestamp("date_posted").notNull(),
  posted_at: timestamp("posted_at").defaultNow().notNull(),
  is_verification_tweet: boolean("is_verification_tweet").default(false).notNull(),
}, (table) => {
  return {
    // Ensure unique tweet_ids
    tweetIdIdx: unique("giverep_tweet_id_idx").on(table.tweet_id),
  };
});

// GiveRep collection logs for tracking data collection runs
export const giverepCollectionLogs = pgTable("giverep_collection_logs", {
  id: serial("id").primaryKey(),
  status: varchar("status", { length: 20 }).notNull(),
  start_date: timestamp("start_date"),
  end_date: timestamp("end_date"),
  started_at: timestamp("started_at").defaultNow().notNull(),
  completed_at: timestamp("completed_at"),
  apify_run_id: text("apify_run_id"),
  error: text("error"),
});

// Relationships
export const giverepUserRelations = relations(giverepUsers, ({ many }) => ({
  tweets: many(giverepTweets),
}));

export const giverepTweetRelations = relations(giverepTweets, ({ one }) => ({
  user: one(giverepUsers, {
    fields: [giverepTweets.user_id],
    references: [giverepUsers.id],
  }),
}));

// Types
export type GiveRepUser = typeof giverepUsers.$inferSelect;
export type InsertGiveRepUser = typeof giverepUsers.$inferInsert;
export type GiveRepTweet = typeof giverepTweets.$inferSelect;
export type InsertGiveRepTweet = typeof giverepTweets.$inferInsert;
export type GiveRepCollectionLog = typeof giverepCollectionLogs.$inferSelect;
export type InsertGiveRepCollectionLog = typeof giverepCollectionLogs.$inferInsert;

// Zod schemas for validation
export const insertGiveRepUserSchema = createInsertSchema(giverepUsers);
export const selectGiveRepUserSchema = createSelectSchema(giverepUsers);
export const insertGiveRepTweetSchema = createInsertSchema(giverepTweets);
export const selectGiveRepTweetSchema = createSelectSchema(giverepTweets);