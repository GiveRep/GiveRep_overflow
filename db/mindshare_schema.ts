import { pgTable, serial, text, integer, timestamp, boolean, unique, index, real, integer as pgInteger } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// Mindshare Projects - the main projects we're tracking mindshare for
export const mindshareProjects = pgTable("mindshare_projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  logo_url: text("logo_url"),
  banner_url: text("banner_url"),
  website_url: text("website_url"),
  twitter_handle: text("twitter_handle"),
  tag_ids: pgInteger("tag_ids").array().default([]).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => {
  return {
    nameIdx: unique("mindshare_project_name_idx").on(table.name)
  };
});

// Keywords associated with each project
export const mindshareKeywords = pgTable("mindshare_keywords", {
  id: serial("id").primaryKey(),
  project_id: integer("project_id").references(() => mindshareProjects.id).notNull(),
  keyword: text("keyword").notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => {
  return {
    projectKeywordIdx: unique("mindshare_project_keyword_idx").on(table.project_id, table.keyword)
  };
});

// Metrics calculated for each project over time
export const mindshareMetrics = pgTable("mindshare_metrics", {
  id: serial("id").primaryKey(),
  project_id: integer("project_id").references(() => mindshareProjects.id).notNull(),
  start_date: timestamp("start_date").notNull(),
  end_date: timestamp("end_date").notNull(),
  tweet_count: integer("tweet_count").default(0).notNull(),
  views: integer("views").default(0).notNull(),
  likes: integer("likes").default(0).notNull(),
  retweets: integer("retweets").default(0).notNull(),
  replies: integer("replies").default(0).notNull(),
  engagement_rate: real("engagement_rate").default(0).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull()
}, (table) => {
  return {
    projectTimeframeIdx: unique("mindshare_project_timeframe_idx").on(
      table.project_id, 
      table.start_date, 
      table.end_date
    ),
    projectIdIdx: index("mindshare_metrics_project_id_idx").on(table.project_id)
  };
});

// Tweets collected for each project based on keywords
export const mindshareTweets = pgTable("mindshare_tweets", {
  id: serial("id").primaryKey(),
  project_id: integer("project_id").references(() => mindshareProjects.id).notNull(),
  keyword_id: integer("keyword_id").references(() => mindshareKeywords.id).notNull(),
  tweet_id: text("tweet_id").notNull(),
  user_handle: text("user_handle").notNull(),
  user_name: text("user_name"),
  user_profile_image: text("user_profile_image"),
  user_id: text("user_id"), // Twitter user ID field
  content: text("content").notNull(),
  views: integer("views").default(0).notNull(),
  likes: integer("likes").default(0).notNull(),
  retweets: integer("retweets").default(0).notNull(),
  replies: integer("replies").default(0).notNull(),
  eligible_loyalty_mentions: text("eligible_loyalty_mentions").array().default([]),
  created_at: timestamp("created_at").notNull(),
  collected_at: timestamp("collected_at").defaultNow().notNull()
}, (table) => {
  return {
    // Allow the same tweet to be stored for different projects
    projectTweetIdIdx: unique("mindshare_project_tweet_id_idx").on(table.project_id, table.tweet_id),
    tweetIdIdx: index("mindshare_tweet_id_idx").on(table.tweet_id), // Changed to non-unique index
    projectIdIdx: index("mindshare_tweets_project_id_idx").on(table.project_id),
    keywordIdIdx: index("mindshare_tweets_keyword_id_idx").on(table.keyword_id),
    createdAtIdx: index("mindshare_tweets_created_at_idx").on(table.created_at)
  };
});

// Relations
export const mindshareProjectsRelations = relations(mindshareProjects, ({ many }) => ({
  keywords: many(mindshareKeywords),
  metrics: many(mindshareMetrics),
  tweets: many(mindshareTweets)
}));

export const mindshareKeywordsRelations = relations(mindshareKeywords, ({ one }) => ({
  project: one(mindshareProjects, {
    fields: [mindshareKeywords.project_id],
    references: [mindshareProjects.id]
  })
}));

export const mindshareMetricsRelations = relations(mindshareMetrics, ({ one }) => ({
  project: one(mindshareProjects, {
    fields: [mindshareMetrics.project_id],
    references: [mindshareProjects.id]
  })
}));

export const mindshareTweetsRelations = relations(mindshareTweets, ({ one }) => ({
  project: one(mindshareProjects, {
    fields: [mindshareTweets.project_id],
    references: [mindshareProjects.id]
  }),
  keyword: one(mindshareKeywords, {
    fields: [mindshareTweets.keyword_id],
    references: [mindshareKeywords.id]
  })
}));

// Schemas
export const insertMindshareProjectSchema = createInsertSchema(mindshareProjects).omit({
  id: true,
  created_at: true,
  updated_at: true
});

export const selectMindshareProjectSchema = createSelectSchema(mindshareProjects);

export const insertMindshareKeywordSchema = createInsertSchema(mindshareKeywords).omit({
  id: true,
  created_at: true,
  updated_at: true
});

export const selectMindshareKeywordSchema = createSelectSchema(mindshareKeywords);

export const insertMindshareMetricsSchema = createInsertSchema(mindshareMetrics).omit({
  id: true,
  created_at: true,
  updated_at: true
});

export const selectMindshareMetricsSchema = createSelectSchema(mindshareMetrics);

export const insertMindshareTweetSchema = createInsertSchema(mindshareTweets).omit({
  id: true,
  collected_at: true
});

export const selectMindshareTweetSchema = createSelectSchema(mindshareTweets);

// Types
export type MindshareProject = typeof mindshareProjects.$inferSelect;
export type InsertMindshareProject = typeof mindshareProjects.$inferInsert;

export type MindshareKeyword = typeof mindshareKeywords.$inferSelect;
export type InsertMindshareKeyword = typeof mindshareKeywords.$inferInsert;

export type MindshareMetrics = typeof mindshareMetrics.$inferSelect;
export type InsertMindshareMetrics = typeof mindshareMetrics.$inferInsert;

export type MindshareTweet = typeof mindshareTweets.$inferSelect;
export type InsertMindshareTweet = typeof mindshareTweets.$inferInsert;