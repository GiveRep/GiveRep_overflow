import { pgTable, text, serial, integer, timestamp, unique, index, boolean, varchar, real } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations, sql } from "drizzle-orm";

// Import Rep Circles schema
import { 
  repCircles, 
  repCircleMembers, 
  repCircleMessages,
  repCirclesRelations,
  repCircleMembersRelations,
  repCircleMessagesRelations
} from "./rep_circles_schema";

// Import Tweets schema
import {
  tweets as tweetsTable, 
  tweetsCollection,
  Tweet as TweetFromSchema,
  InsertTweet as InsertTweetFromSchema
} from "./tweets_schema";

// Import Mindshare schema
import {
  mindshareProjects,
  mindshareKeywords,
  mindshareMetrics,
  mindshareTweets,
  mindshareProjectsRelations,
  mindshareKeywordsRelations,
  mindshareMetricsRelations,
  mindshareTweetsRelations
} from "./mindshare_schema";

// Import XPump schema
import {
  xpumpBuyIntentTweets,
  xpumpRawTweets,
  xpumpRawTweetsRelations,
  xpumpBuyIntentTweetsRelations,
  insertXpumpBuyIntentTweetSchema,
  insertXpumpRawTweetSchema,
  selectXpumpBuyIntentTweetSchema,
  selectXpumpRawTweetSchema
} from "./xpump_schema";

// Import Loyalty Program schema
import {
  loyaltyProjects,
  loyaltyMembers,
  loyaltyMetrics,
  loyaltyProjectsRelations,
  loyaltyMembersRelations,
  loyaltyMetricsRelations
} from "./loyalty_schema";

// Re-export Rep Circles tables for use with DB queries
export { 
  repCircles, 
  repCircleMembers, 
  repCircleMessages,
  repCirclesRelations,
  repCircleMembersRelations,
  repCircleMessagesRelations
};

// Re-export Tweets table for use with DB queries
export {
  tweetsCollection,
  tweets
} from "./tweets_schema";

// Also export tweets schema types
export type { 
  Tweet as TweetsCollectionTweet, 
  InsertTweet as InsertTweetsCollectionTweet 
} from "./tweets_schema";

// Re-export Mindshare tables for use with DB queries
export {
  mindshareProjects,
  mindshareKeywords,
  mindshareMetrics,
  mindshareTweets,
  mindshareProjectsRelations,
  mindshareKeywordsRelations,
  mindshareMetricsRelations,
  mindshareTweetsRelations
};

// Re-export XPump tables for use with DB queries
export {
  xpumpBuyIntentTweets,
  xpumpRawTweets,
  xpumpRawTweetsRelations,
  xpumpBuyIntentTweetsRelations,
  insertXpumpBuyIntentTweetSchema,
  insertXpumpRawTweetSchema,
  selectXpumpBuyIntentTweetSchema,
  selectXpumpRawTweetSchema
};

// Re-export Loyalty Program tables for use with DB queries
export {
  loyaltyProjects,
  loyaltyMembers,
  loyaltyMetrics,
  loyaltyProjectsRelations,
  loyaltyMembersRelations,
  loyaltyMetricsRelations
};

// Main tables
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  twitterHandle: text("twitter_handle").notNull(),
  profileUrl: text("profile_url").notNull(),
  followerCount: integer("follower_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSnapshotDate: timestamp("last_snapshot_date"),
  isVerified: boolean("is_verified").default(false),
  walletAddress: text("wallet_address"),
  verificationTweetId: text("verification_tweet_id"),
  verifiedAt: timestamp("verified_at"),
}, (table) => ({
  handleUnique: unique().on(table.twitterHandle),
  twitterHandleInsensitive: index("twitter_handle_insensitive_idx").on(sql`LOWER(${table.twitterHandle})`),
}));

export const originalTweets = pgTable("tweets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  tweetId: text("tweet_id").notNull(),
  content: text("content").notNull(),
  views: integer("views").notNull(),
  likes: integer("likes").notNull(),
  retweetCount: integer("retweet_count").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  datePosted: timestamp("date_posted").notNull(),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
  isVerificationTweet: boolean("is_verification_tweet").default(false),
}, (table) => ({
  tweetIdUnique: unique().on(table.tweetId),
}));

export const collectionLogs = pgTable("collection_logs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  status: text("status").notNull(), 
  error: text("error"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
});

// GiveRep specific tables
export const giverepUsers = pgTable("giverep_users", {
  id: serial("id").primaryKey(),
  twitter_handle: text("twitter_handle").notNull(),
  twitter_id: text("twitter_id"),  // Twitter ID to track users across handle changes
  wallet_address: text("wallet_address"),
  verification_code: text("verification_code"),
  is_verified: boolean("is_verified").default(false).notNull(),
  follower_count: integer("follower_count").default(0).notNull(),
  profile_url: text("profile_url").default(""),
  // New APIFY profile fields
  display_name: text("display_name"),
  profile_picture: text("profile_picture"),
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
  // Content quality metrics
  content_quality_score: integer("content_quality_score"),
  content_quality: varchar("content_quality", { length: 20 }),
  content_quality_last_analyzed: timestamp("content_quality_last_analyzed"),
  content_quality_confidence: real("content_quality_confidence"),
  content_quality_depth: real("content_quality_depth"),
  content_quality_originality: real("content_quality_originality"),
  content_quality_engagement: real("content_quality_engagement"),
  content_quality_educational: real("content_quality_educational"),
  // Existing timestamp fields
  registered_at: timestamp("registered_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    twitterHandleIdx: unique("giverep_twitter_handle_idx").on(table.twitter_handle),
    twitterIdIdx: unique("giverep_twitter_id_idx").on(table.twitter_id),
  };
});

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
    tweetIdIdx: unique("giverep_tweet_id_idx").on(table.tweet_id),
  };
});

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

// Reputation system tables
export const repUsers = pgTable("rep_users", {
  id: serial("id").primaryKey(),
  twitterHandle: text("twitter_handle").notNull(),
  twitterId: text("twitter_id"),  // Added to track users even if they change handles
  followerCount: integer("follower_count").default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
  profileUrl: text("profile_url"),
  totalReputation: integer("total_reputation").default(0)
});

export const repPoints = pgTable("rep_points", {
  id: serial("id").primaryKey(),
  fromHandle: text("from_handle").notNull(),
  toHandle: text("to_handle").notNull(),
  tweetId: text("tweet_id").notNull(),
  tweetUrl: text("tweet_url"),
  tweetContent: text("tweet_content"),
  createdAt: timestamp("created_at").defaultNow(),
  points: integer("points").default(1),
}, (table) => {
  return {
    uniqPointsGiven: unique().on(table.fromHandle, table.toHandle, table.tweetId),
  };
});

export const repQuota = pgTable("rep_quota", {
  id: serial("id").primaryKey(),
  twitterHandle: text("twitter_handle").notNull(),
  date: timestamp("date").defaultNow(),
  pointsUsed: integer("points_used").default(0),
  totalQuota: integer("total_quota").default(3),
  multiplier: integer("multiplier").default(1), // Added multiplier field - default is 1x (no multiplier)
}, (table) => {
  return {
    uniqDailyQuota: unique().on(table.twitterHandle, table.date),
  };
});

export const repScans = pgTable("rep_scans", {
  id: serial("id").primaryKey(),
  startTime: timestamp("start_time").defaultNow(),
  endTime: timestamp("end_time"),
  status: text("status").default("running"),
  tweetsScanned: integer("tweets_scanned").default(0),
  reputationAwarded: integer("reputation_awarded").default(0),
  error: text("error"),
});

// Store the keyword/topic of the day
export const repKeywords = pgTable("rep_keywords", {
  id: serial("id").primaryKey(),
  keyword: text("keyword").notNull(),
  description: text("description"),
  points_awarded: integer("points_awarded").default(1),
  active_date: timestamp("active_date").defaultNow(),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
});

// Relations
export const userRelations = relations(users, ({ many }) => ({
  tweets: many(originalTweets),
}));

export const tweetRelations = relations(originalTweets, ({ one }) => ({
  user: one(users, {
    fields: [originalTweets.userId],
    references: [users.id],
  }),
}));

export const giverepUserRelations = relations(giverepUsers, ({ many }) => ({
  tweets: many(giverepTweets),
}));

export const giverepTweetRelations = relations(giverepTweets, ({ one }) => ({
  user: one(giverepUsers, {
    fields: [giverepTweets.user_id],
    references: [giverepUsers.id],
  }),
}));

export const repUserRelations = relations(repUsers, ({ many }) => ({
  receivedPoints: many(repPoints, { relationName: "reputation_received" }),
  givenPoints: many(repPoints, { relationName: "reputation_given" }),
  quotas: many(repQuota)
}));

export const repPointsRelations = relations(repPoints, ({ one }) => ({
  giver: one(repUsers, {
    fields: [repPoints.fromHandle],
    references: [repUsers.twitterHandle],
    relationName: "reputation_given"
  }),
  receiver: one(repUsers, {
    fields: [repPoints.toHandle],
    references: [repUsers.twitterHandle],
    relationName: "reputation_received"
  }),
}));

export const repQuotaRelations = relations(repQuota, ({ one }) => ({
  user: one(repUsers, {
    fields: [repQuota.twitterHandle],
    references: [repUsers.twitterHandle]
  })
}));

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Tweet = typeof originalTweets.$inferSelect;
export type InsertTweet = typeof originalTweets.$inferInsert;
export type CollectionLog = typeof collectionLogs.$inferSelect;

export type GiveRepUser = typeof giverepUsers.$inferSelect;
export type InsertGiveRepUser = typeof giverepUsers.$inferInsert;
export type GiveRepTweet = typeof giverepTweets.$inferSelect;
export type InsertGiveRepTweet = typeof giverepTweets.$inferInsert;
export type GiveRepCollectionLog = typeof giverepCollectionLogs.$inferSelect;
export type InsertGiveRepCollectionLog = typeof giverepCollectionLogs.$inferInsert;

export type RepUser = typeof repUsers.$inferSelect;
export type InsertRepUser = typeof repUsers.$inferInsert;
export type RepPoint = typeof repPoints.$inferSelect;
export type InsertRepPoint = typeof repPoints.$inferInsert;
export type RepQuota = typeof repQuota.$inferSelect;
export type InsertRepQuota = typeof repQuota.$inferInsert;
export type RepScan = typeof repScans.$inferSelect;
export type InsertRepScan = typeof repScans.$inferInsert;
export type RepKeyword = typeof repKeywords.$inferSelect;
export type InsertRepKeyword = typeof repKeywords.$inferInsert;

// Rep Circles types - re-export from the same file
export type { RepCircle, InsertRepCircle } from "./rep_circles_schema";
export type { RepCircleMember, InsertRepCircleMember } from "./rep_circles_schema";
export type { RepCircleMessage, InsertRepCircleMessage } from "./rep_circles_schema";

// Mindshare types - re-export from the mindshare schema
export type { 
  MindshareProject, 
  InsertMindshareProject,
  MindshareKeyword,
  InsertMindshareKeyword,
  MindshareMetrics,
  InsertMindshareMetrics,
  MindshareTweet,
  InsertMindshareTweet
} from "./mindshare_schema";

// XPump types - re-export from xpump schema
export type {
  XpumpBuyIntentTweet,
  InsertXpumpBuyIntentTweet,
  XpumpBuyIntentTweetInsertSchema,
  XpumpRawTweet,
  InsertXpumpRawTweet,
  XpumpRawTweetInsertSchema
} from "./xpump_schema";

// Loyalty Program types - re-export from loyalty schema
export type {
  LoyaltyProject,
  InsertLoyaltyProject,
  LoyaltyMember,
  InsertLoyaltyMember,
  LoyaltyMetrics,
  InsertLoyaltyMetrics
} from "./loyalty_schema";

// Schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertTweetSchema = createInsertSchema(originalTweets);
export const selectTweetSchema = createSelectSchema(originalTweets);

export const insertGiveRepUserSchema = createInsertSchema(giverepUsers);
export const selectGiveRepUserSchema = createSelectSchema(giverepUsers);
export const insertGiveRepTweetSchema = createInsertSchema(giverepTweets);
export const selectGiveRepTweetSchema = createSelectSchema(giverepTweets);

export const insertRepUserSchema = createInsertSchema(repUsers);
export const selectRepUserSchema = createSelectSchema(repUsers);
export const insertRepPointSchema = createInsertSchema(repPoints);
export const selectRepPointSchema = createSelectSchema(repPoints);
export const insertRepQuotaSchema = createInsertSchema(repQuota);
export const selectRepQuotaSchema = createSelectSchema(repQuota);
export const insertRepKeywordSchema = createInsertSchema(repKeywords);
export const selectRepKeywordSchema = createSelectSchema(repKeywords);

// Rep Circles schemas
export {
  insertRepCircleSchema,
  selectRepCircleSchema,
  insertRepCircleMemberSchema,
  selectRepCircleMemberSchema,
  insertRepCircleMessageSchema,
  selectRepCircleMessageSchema
} from "./rep_circles_schema";

// Mindshare schemas
export {
  insertMindshareProjectSchema,
  selectMindshareProjectSchema,
  insertMindshareKeywordSchema,
  selectMindshareKeywordSchema,
  insertMindshareMetricsSchema,
  selectMindshareMetricsSchema,
  insertMindshareTweetSchema,
  selectMindshareTweetSchema
} from "./mindshare_schema";