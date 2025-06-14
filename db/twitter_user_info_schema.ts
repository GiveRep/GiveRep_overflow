import { serial, text, timestamp, integer, boolean, pgTable, index, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Twitter User Info schema
 * Stores Twitter user profile data with timestamps for freshness checking
 */
export const twitter_user_info = pgTable("twitter_user_info", {
  id: serial("id").primaryKey(),
  handle: text("handle").notNull().unique(),
  twitter_id: bigint("twitter_id", { mode: 'bigint' }),  // Twitter ID as bigint stored as string to preserve precision
  username: text("username"),
  display_name: text("display_name"),
  profile_image_url: text("profile_image_url"),
  profile_url: text("profile_url"),
  banner_url: text("banner_url"),
  follower_count: integer("follower_count"),
  following_count: integer("following_count"),
  tweet_count: integer("tweet_count"),
  created_at: timestamp("created_at"),
  description: text("description"),
  location: text("location"),
  is_verified: boolean("is_verified").default(false),
  is_blue_verified: boolean("is_blue_verified").default(false),
  creator_score: integer("creator_score").default(0), // Creator score from 0-1000
  last_updated_at: timestamp("last_updated_at").defaultNow(),
}, (table) => {
  return {
    // Index for case-insensitive handle lookup
    handleLowerIdx: index("idx_twitter_user_info_handle_lower").on(table.handle),
    // Index for efficient cleanup of stale data
    lastUpdatedIdx: index("idx_twitter_user_info_last_updated_at").on(table.last_updated_at),
    // Index for creator score to optimize sorting and filtering
    creatorScoreIdx: index("idx_twitter_user_info_creator_score").on(table.creator_score)
  };
});

// Define insert schema manually to ensure proper types
export const insertTwitterUserInfoSchema = z.object({
  handle: z.string().min(1).max(50),
  twitter_id: z.union([z.number(), z.bigint()]).nullable().optional(), // Twitter ID as bigint or number
  username: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  profile_image_url: z.string().nullable().optional(),
  profile_url: z.string().nullable().optional(),
  banner_url: z.string().nullable().optional(),
  follower_count: z.number().nullable().optional(),
  following_count: z.number().nullable().optional(),
  tweet_count: z.number().nullable().optional(),
  created_at: z.date().nullable().optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  is_verified: z.boolean().optional(),
  is_blue_verified: z.boolean().optional(),
  creator_score: z.number().min(0).max(1000).optional(), // Creator score from 0-1000
  last_updated_at: z.date().optional()
});

// Define select schema for completeness
export const selectTwitterUserInfoSchema = createSelectSchema(twitter_user_info);

// Define insert type using zod
export type InsertTwitterUserInfo = z.infer<typeof insertTwitterUserInfoSchema>;

// Define select type using drizzle
export type TwitterUserInfo = typeof twitter_user_info.$inferSelect;