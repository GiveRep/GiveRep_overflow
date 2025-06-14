import { pgTable, serial, text, integer, timestamp, boolean, unique, index, json, bigint, date, numeric } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// Project Tags - tags that can be applied to loyalty projects
export const projectTags = pgTable("project_tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  visible: boolean("visible").default(true).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => {
  return {
    nameIdx: unique("project_tags_name_idx").on(table.name)
  };
});

// Daily Project Tweets - aggregated daily tweet metrics by project for fast calculations
export const loyaltyDailyTweets = pgTable("loyalty_daily_tweets", {
  id: serial("id").primaryKey(),
  project_id: integer("project_id").notNull(),
  tweet_date: date("tweet_date").notNull(),
  user_handle: text("user_handle").notNull(),
  tweet_count: integer("tweet_count").default(0).notNull(),
  views: integer("views").default(0).notNull(),
  likes: integer("likes").default(0).notNull(),
  retweets: integer("retweets").default(0).notNull(),
  replies: integer("replies").default(0).notNull(),
  last_updated: timestamp("last_updated").defaultNow().notNull()
}, (table) => {
  return {
    // Only one record per project, date, and user combination
    projectDateUserIdx: unique("loyalty_daily_tweets_project_date_user_idx").on(
      table.project_id, table.tweet_date, table.user_handle
    ),
    projectDateIdx: index("loyalty_daily_tweets_project_date_idx").on(
      table.project_id, table.tweet_date
    ),
    userIdx: index("loyalty_daily_tweets_user_idx").on(table.user_handle)
  };
});

// Loyalty Projects - projects that users can join to track their contributions
export const loyaltyProjects = pgTable("loyalty_projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  logo_url: text("logo_url"),
  banner_url: text("banner_url"),
  website_url: text("website_url"),
  twitter_handle: text("twitter_handle"),
  is_active: boolean("is_active").default(true).notNull(),
  is_featured: boolean("is_featured").default(false), // New field to mark featured projects
  is_incentivized: boolean("is_incentivized").default(false),
  incentive_type: text("incentive_type").default("usdc").notNull(), // "usdc" or "points"
  points_name: text("points_name").default("Points"), // Custom name for points (e.g., "Pawtato Points")
  incentive_budget: integer("incentive_budget").default(0), // Total budget allocated for the incentive program
  price_per_view: numeric("price_per_view", { precision: 20, scale: 9 }).default("0.0004"), // Price per view in USD with up to 9 decimal places
  total_incentive_spent: integer("total_incentive_spent").default(0), // Running total of what's been spent
  min_follower_count: integer("min_follower_count").default(0), // Minimum follower count for tweets to be counted (0 means no minimum)
  tag_ids: integer("tag_ids").array().default([]), // Array of tag IDs for filtering projects
  hashtags: text("hashtags").array().default([]), // Array of hashtags that tweets must contain (case sensitive)
  start_time: timestamp("start_time").defaultNow(), // When the loyalty program starts
  end_time: timestamp("end_time"), // When the loyalty program ends (null = no end date)
  password_hash: text("password_hash"), // Password hash for project-specific authentication
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => {
  return {
    nameIdx: unique("loyalty_project_name_idx").on(table.name)
  };
});

// Loyalty Members - users who have joined a loyalty program
export const loyaltyMembers = pgTable("loyalty_members", {
  id: serial("id").primaryKey(),
  project_id: integer("project_id").references(() => loyaltyProjects.id).notNull(),
  twitter_handle: text("twitter_handle").notNull(), // User's Twitter handle
  joined_at: timestamp("joined_at").defaultNow().notNull(), // When the user joined the program
  is_active: boolean("is_active").default(true).notNull(),
}, (table) => {
  return {
    // Each user can only join a project once (active or not)
    memberProjectIdx: unique("loyalty_member_project_idx").on(table.project_id, table.twitter_handle),
    // Index for active members by project
    // Note: The actual index in the database includes a WHERE condition (is_active = true)
    // This conditional index is created directly in the database
    projectIdIdx: index("idx_loyalty_members_project_id").on(table.project_id)
  };
});

// Loyalty Metrics - metrics for each user in the loyalty program
export const loyaltyMetrics = pgTable("loyalty_metrics", {
  id: serial("id").primaryKey(),
  project_id: integer("project_id").references(() => loyaltyProjects.id).notNull(),
  twitter_handle: text("twitter_handle").notNull(),
  twitter_id: bigint("twitter_id", { mode: "number" }),
  tweet_count: integer("tweet_count").default(0).notNull(),
  views: integer("views").default(0).notNull(),
  likes: integer("likes").default(0).notNull(),
  retweets: integer("retweets").default(0).notNull(),
  replies: integer("replies").default(0).notNull(),
  last_updated: timestamp("last_updated").defaultNow().notNull(),
}, (table) => {
  return {
    // Each user can only have one metric record per project
    metricsProjectUserIdx: unique("loyalty_metrics_project_user_idx").on(table.project_id, table.twitter_handle),
    projectIdIdx: index("loyalty_metrics_project_id_idx").on(table.project_id),
    twitterIdIdx: index("loyalty_metrics_twitter_id_idx").on(table.twitter_id)
  };
});

// Tweet Content Analysis - stores analyzed tweet content for quality scoring
export const loyaltyTweetContent = pgTable("loyalty_tweet_content", {
  id: serial("id").primaryKey(),
  project_id: integer("project_id").notNull(),
  twitter_handle: text("twitter_handle").notNull(),
  tweet_id: text("tweet_id").notNull(),
  content: text("content").notNull(),
  tweet_date: date("tweet_date").notNull(),
  quality_score: integer("quality_score"),
  quality_confidence: numeric("quality_confidence", { precision: 4, scale: 3 }),
  quality_category: text("quality_category"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  analyzed_at: timestamp("analyzed_at"),
}, (table) => {
  return {
    projectTweetIdx: unique("loyalty_tweet_content_project_tweet_idx").on(table.project_id, table.tweet_id),
    projectHandleIdx: index("loyalty_tweet_content_project_handle_idx").on(table.project_id, table.twitter_handle),
    dateIdx: index("loyalty_tweet_content_date_idx").on(table.tweet_date)
  };
});

// Relations
export const loyaltyDailyTweetsRelations = relations(loyaltyDailyTweets, ({ one }) => ({
  project: one(loyaltyProjects, {
    fields: [loyaltyDailyTweets.project_id],
    references: [loyaltyProjects.id]
  })
}));

export const projectTagsRelations = relations(projectTags, ({ many }) => ({
  // No direct relations needed, projects reference tags via tag_ids array
}));

export const loyaltyProjectsRelations = relations(loyaltyProjects, ({ many }) => ({
  members: many(loyaltyMembers),
  metrics: many(loyaltyMetrics),
  dailyTweets: many(loyaltyDailyTweets),
  tweetContent: many(loyaltyTweetContent)
}));

export const loyaltyMembersRelations = relations(loyaltyMembers, ({ one }) => ({
  project: one(loyaltyProjects, {
    fields: [loyaltyMembers.project_id],
    references: [loyaltyProjects.id]
  })
}));

export const loyaltyMetricsRelations = relations(loyaltyMetrics, ({ one }) => ({
  project: one(loyaltyProjects, {
    fields: [loyaltyMetrics.project_id],
    references: [loyaltyProjects.id]
  })
}));

export const loyaltyTweetContentRelations = relations(loyaltyTweetContent, ({ one }) => ({
  project: one(loyaltyProjects, {
    fields: [loyaltyTweetContent.project_id],
    references: [loyaltyProjects.id]
  })
}));

// Cached Leaderboard - stores pre-calculated leaderboard data for faster loading
export const loyaltyLeaderboard = pgTable("loyalty_leaderboard", {
  id: serial("id").primaryKey(),
  project_id: integer("project_id").references(() => loyaltyProjects.id).notNull(),
  leaderboard_data: json("leaderboard_data").notNull(), // Stores the pre-calculated leaderboard as JSON
  total_views: integer("total_views").default(0).notNull(), // Total views across all entries
  total_likes: integer("total_likes").default(0).notNull(), // Total likes across all entries
  total_tweets: integer("total_tweets").default(0).notNull(), // Total tweets across all entries
  total_retweets: integer("total_retweets").default(0).notNull(), // Total retweets across all entries
  total_replies: integer("total_replies").default(0).notNull(), // Total replies across all entries
  start_date: timestamp("start_date"), // Optional date range filter
  end_date: timestamp("end_date"), // Optional date range filter
  last_calculated: timestamp("last_calculated").defaultNow().notNull(), // When this leaderboard was last calculated
}, (table) => {
  return {
    // Only one leaderboard entry per project (optionally filtered by date range)
    leaderboardProjectIdx: unique("loyalty_leaderboard_project_idx").on(table.project_id, table.start_date, table.end_date),
    projectIdIdx: index("loyalty_leaderboard_project_id_idx").on(table.project_id)
  };
});

// Relations for leaderboard
export const loyaltyLeaderboardRelations = relations(loyaltyLeaderboard, ({ one }) => ({
  project: one(loyaltyProjects, {
    fields: [loyaltyLeaderboard.project_id],
    references: [loyaltyProjects.id]
  })
}));

// Schemas
export const insertLoyaltyProjectSchema = createInsertSchema(loyaltyProjects).omit({
  id: true,
  created_at: true,
  updated_at: true
});

export const selectLoyaltyProjectSchema = createSelectSchema(loyaltyProjects);

export const insertLoyaltyMemberSchema = createInsertSchema(loyaltyMembers).omit({
  id: true,
  joined_at: true
});

export const selectLoyaltyMemberSchema = createSelectSchema(loyaltyMembers);

export const insertLoyaltyMetricsSchema = createInsertSchema(loyaltyMetrics).omit({
  id: true,
  last_updated: true
});

export const selectLoyaltyMetricsSchema = createSelectSchema(loyaltyMetrics);

// Leaderboard schemas
export const insertLoyaltyLeaderboardSchema = createInsertSchema(loyaltyLeaderboard).omit({
  id: true,
  last_calculated: true
});

export const selectLoyaltyLeaderboardSchema = createSelectSchema(loyaltyLeaderboard);

// Daily Tweets schemas
export const insertLoyaltyDailyTweetSchema = createInsertSchema(loyaltyDailyTweets).omit({
  id: true,
  last_updated: true
});

export const selectLoyaltyDailyTweetSchema = createSelectSchema(loyaltyDailyTweets);

// Project tags schemas
export const insertProjectTagSchema = createInsertSchema(projectTags).omit({
  id: true,
  created_at: true,
  updated_at: true
});

export const selectProjectTagSchema = createSelectSchema(projectTags);

// Loyalty Reward Config - configuration for reward pools per project
export const loyaltyRewardConfig = pgTable("loyalty_reward_config", {
  id: serial("id").primaryKey(),
  project_id: integer("project_id").references(() => loyaltyProjects.id).notNull(),
  pool_object_id: text("pool_object_id").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  coin_type: text("coin_type").notNull(),
  is_available: boolean("is_available").default(false).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    projectIdx: index("loyalty_reward_config_project_idx").on(table.project_id),
    poolObjectIdx: index("loyalty_reward_config_pool_object_idx").on(table.pool_object_id),
    availableIdx: index("loyalty_reward_config_available_idx").on(table.is_available)
  };
});

// Loyalty Rewards - stores rewards data for loyalty program participants
export const loyaltyRewards = pgTable("loyalty_rewards", {
  id: serial("id").primaryKey(),
  project_id: integer("project_id").references(() => loyaltyProjects.id).notNull(),
  twitter_handle: text("twitter_handle").notNull(),
  twitter_id: bigint("twitter_id", { mode: "number" }),
  token_type: text("token_type"),
  initial_amount: bigint("initial_amount", { mode: "number" }).default(0),
  adjust_amount: bigint("adjust_amount", { mode: "number" }).default(0),
  manual_adjustment: bigint("manual_adjustment", { mode: "number" }).default(0),
  notes: text("notes"),
  tags: text("tags").array().default([]),
  claimed: boolean("claimed").default(false),
  claimer: text("claimer"), // Wallet address of the user who claimed the reward
  claimed_at: timestamp("claimed_at"), // Timestamp when the reward was claimed
  claim_transaction_digest: text("claim_transaction_digest"), // Transaction digest from the blockchain
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    projectHandleIdx: index("loyalty_rewards_project_handle_idx").on(table.project_id, table.twitter_handle),
    tagsIdx: index("loyalty_rewards_tags_idx").on(table.tags),
    claimedIdx: index("loyalty_rewards_claimed_idx").on(table.claimed),
    claimerIdx: index("idx_loyalty_rewards_claimer").on(table.claimer)
  };
});

// Loyalty Reward Adjustments - tracks all manual adjustments made to rewards
export const loyaltyRewardAdjustments = pgTable("loyalty_reward_adjustments", {
  id: serial("id").primaryKey(),
  reward_id: integer("reward_id").references(() => loyaltyRewards.id, { onDelete: "cascade" }).notNull(),
  project_id: integer("project_id").references(() => loyaltyProjects.id, { onDelete: "cascade" }).notNull(),
  twitter_handle: text("twitter_handle").notNull(),
  adjustment_amount: bigint("adjustment_amount", { mode: "number" }).notNull(),
  previous_amount: bigint("previous_amount", { mode: "number" }).notNull(),
  new_amount: bigint("new_amount", { mode: "number" }).notNull(),
  reason: text("reason").notNull(),
  adjusted_by: text("adjusted_by").notNull(), // 'admin' or 'manager_{projectId}'
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    rewardIdIdx: index("idx_loyalty_reward_adjustments_reward_id").on(table.reward_id),
    projectIdIdx: index("idx_loyalty_reward_adjustments_project_id").on(table.project_id),
    twitterHandleIdx: index("idx_loyalty_reward_adjustments_twitter_handle").on(table.twitter_handle),
    createdAtIdx: index("idx_loyalty_reward_adjustments_created_at").on(table.created_at)
  };
});

// Relations for reward config
export const loyaltyRewardConfigRelations = relations(loyaltyRewardConfig, ({ one }) => ({
  project: one(loyaltyProjects, {
    fields: [loyaltyRewardConfig.project_id],
    references: [loyaltyProjects.id]
  })
}));

// Relations for rewards
export const loyaltyRewardsRelations = relations(loyaltyRewards, ({ one, many }) => ({
  project: one(loyaltyProjects, {
    fields: [loyaltyRewards.project_id],
    references: [loyaltyProjects.id]
  }),
  adjustments: many(loyaltyRewardAdjustments)
}));

// Relations for reward adjustments
export const loyaltyRewardAdjustmentsRelations = relations(loyaltyRewardAdjustments, ({ one }) => ({
  reward: one(loyaltyRewards, {
    fields: [loyaltyRewardAdjustments.reward_id],
    references: [loyaltyRewards.id]
  }),
  project: one(loyaltyProjects, {
    fields: [loyaltyRewardAdjustments.project_id],
    references: [loyaltyProjects.id]
  })
}));

// Loyalty Reward Config schemas
export const insertLoyaltyRewardConfigSchema = createInsertSchema(loyaltyRewardConfig).omit({
  id: true,
  created_at: true,
  updated_at: true
});

export const selectLoyaltyRewardConfigSchema = createSelectSchema(loyaltyRewardConfig);

// Loyalty Rewards schemas
export const insertLoyaltyRewardSchema = createInsertSchema(loyaltyRewards).omit({
  id: true,
  created_at: true,
  updated_at: true
});

export const selectLoyaltyRewardSchema = createSelectSchema(loyaltyRewards);

// Loyalty Reward Adjustments schemas
export const insertLoyaltyRewardAdjustmentSchema = createInsertSchema(loyaltyRewardAdjustments).omit({
  id: true,
  created_at: true
});

export const selectLoyaltyRewardAdjustmentSchema = createSelectSchema(loyaltyRewardAdjustments);

// Types
export type ProjectTag = typeof projectTags.$inferSelect;
export type InsertProjectTag = typeof projectTags.$inferInsert;

export type LoyaltyProject = typeof loyaltyProjects.$inferSelect;
export type InsertLoyaltyProject = typeof loyaltyProjects.$inferInsert;

export type LoyaltyMember = typeof loyaltyMembers.$inferSelect;
export type InsertLoyaltyMember = typeof loyaltyMembers.$inferInsert;

export type LoyaltyMetrics = typeof loyaltyMetrics.$inferSelect;
export type InsertLoyaltyMetrics = typeof loyaltyMetrics.$inferInsert;

export type LoyaltyLeaderboard = typeof loyaltyLeaderboard.$inferSelect;
export type InsertLoyaltyLeaderboard = typeof loyaltyLeaderboard.$inferInsert;

export type LoyaltyDailyTweet = typeof loyaltyDailyTweets.$inferSelect;
export type InsertLoyaltyDailyTweet = typeof loyaltyDailyTweets.$inferInsert;

export type LoyaltyTweetContent = typeof loyaltyTweetContent.$inferSelect;
export type InsertLoyaltyTweetContent = typeof loyaltyTweetContent.$inferInsert;

export type LoyaltyRewardConfig = typeof loyaltyRewardConfig.$inferSelect;
export type InsertLoyaltyRewardConfig = typeof loyaltyRewardConfig.$inferInsert;

export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;
export type InsertLoyaltyReward = typeof loyaltyRewards.$inferInsert;

export type LoyaltyRewardAdjustment = typeof loyaltyRewardAdjustments.$inferSelect;
export type InsertLoyaltyRewardAdjustment = typeof loyaltyRewardAdjustments.$inferInsert;