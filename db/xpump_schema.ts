/**
 * Database schema for XPump system
 * Includes tables for all tweets, buy-intent tweets, and processing history
 */

import { pgTable, serial, text, timestamp, boolean, integer, real, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * XPump raw tweets table
 * Stores all incoming tweets before analysis
 * This ensures no tweets are lost even if analysis fails
 */
export const xpumpRawTweets = pgTable("xpump_raw_tweets", {
  id: serial("id").primaryKey(),
  tweet_id: text("tweet_id").notNull().unique(),
  user_id: text("user_id").notNull(), // Twitter handle of the user
  tweet_text: text("tweet_text").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(), // When the tweet was created on Twitter
  received_at: timestamp("received_at").notNull().defaultNow(), // When we received the tweet
  is_analyzed: boolean("is_analyzed").notNull().default(false), // Whether the tweet has been analyzed
  analysis_attempts: integer("analysis_attempts").notNull().default(0), // Number of analysis attempts
  last_analysis_attempt: timestamp("last_analysis_attempt"), // When the last analysis was attempted
  url: text("url"), // URL to the tweet
  author_name: text("author_name"), // Name of the author
  author_profile_pic: text("author_profile_pic"), // Profile picture URL
  author_created_at: timestamp("author_created_at"), // When the author's account was created
  follower_count: integer("follower_count"), // Number of followers
  following_count: integer("following_count"), // Number of accounts following
  favourites_count: integer("favourites_count"), // Number of likes
  media_count: integer("media_count"), // Number of media posts
  statuses_count: integer("statuses_count") // Number of tweets/posts
});

/**
 * XPump buy-intent tweets table
 * Stores analyzed tweets with buying intent
 */
export const xpumpBuyIntentTweets = pgTable("xpump_buy_intent_tweets", {
  id: serial("id").primaryKey(),
  tweet_id: text("tweet_id").notNull().unique(),
  user_id: text("user_id").notNull(), // Twitter handle of the user
  tweet_text: text("tweet_text").notNull(),
  has_buy_intent: boolean("has_buy_intent").notNull().default(false),
  confidence: real("confidence").notNull().default(0),
  amount: real("amount"),
  currency: text("currency").default("SUI"),
  percentage_of_supply: real("percentage_of_supply"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  processed_at: timestamp("processed_at").notNull().defaultNow(),
  is_processed: boolean("is_processed").notNull().default(false),
  is_displayed: boolean("is_displayed").notNull().default(false),
  is_simulated: boolean("is_simulated").default(false), // Flag to identify simulated tweets
  // User profile information
  author_name: text("author_name"), // Name of the author
  author_profile_pic: text("author_profile_pic"), // Profile picture URL
  author_created_at: timestamp("author_created_at"), // When the author's account was created
  follower_count: integer("follower_count"), // Number of followers
  following_count: integer("following_count"), // Number of accounts following
  favourites_count: integer("favourites_count"), // Number of likes by author
  media_count: integer("media_count"), // Number of media posts by author
  statuses_count: integer("statuses_count"), // Number of tweets/posts by author
  is_verified: boolean("is_verified"), // Whether the account is verified
  is_blue_verified: boolean("is_blue_verified") // Whether the account has Twitter Blue verification
});

// Define relationships
export const xpumpRawTweetsRelations = relations(xpumpRawTweets, ({ one }) => ({
  buyIntentTweet: one(xpumpBuyIntentTweets, {
    fields: [xpumpRawTweets.tweet_id],
    references: [xpumpBuyIntentTweets.tweet_id],
  }),
}));

export const xpumpBuyIntentTweetsRelations = relations(xpumpBuyIntentTweets, ({ one }) => ({
  rawTweet: one(xpumpRawTweets, {
    fields: [xpumpBuyIntentTweets.tweet_id],
    references: [xpumpRawTweets.tweet_id],
  }),
}));

// Create insert and select schemas for zod validation
export const insertXpumpRawTweetSchema = createInsertSchema(xpumpRawTweets, {
  analysis_attempts: z.number().min(0),
});

export const insertXpumpBuyIntentTweetSchema = createInsertSchema(xpumpBuyIntentTweets, {
  has_buy_intent: z.boolean(),
  confidence: z.number().min(0).max(1)
});

export const selectXpumpRawTweetSchema = createSelectSchema(xpumpRawTweets);
export const selectXpumpBuyIntentTweetSchema = createSelectSchema(xpumpBuyIntentTweets);

// Type definitions for TypeScript
export type XpumpRawTweet = typeof xpumpRawTweets.$inferSelect;
export type InsertXpumpRawTweet = typeof xpumpRawTweets.$inferInsert;
export type XpumpRawTweetInsertSchema = z.infer<typeof insertXpumpRawTweetSchema>;

export type XpumpBuyIntentTweet = typeof xpumpBuyIntentTweets.$inferSelect;
export type InsertXpumpBuyIntentTweet = typeof xpumpBuyIntentTweets.$inferInsert;
export type XpumpBuyIntentTweetInsertSchema = z.infer<typeof insertXpumpBuyIntentTweetSchema>;