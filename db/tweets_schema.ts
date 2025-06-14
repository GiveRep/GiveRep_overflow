import { pgTable, text, integer, timestamp, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * Schema for the tweets table
 * This table stores collected tweets and their engagement metrics
 *
 * Note: The following special indexes are created via direct SQL:
 * - CREATE INDEX tweets_mentions_gin_idx ON tweets USING gin (mentions);
 * - CREATE INDEX tweets_loyalty_mentions_gin_idx ON tweets USING gin (eligible_loyalty_mentions);
 * - CREATE INDEX tweets_collected_by_keywords_gin_idx ON tweets USING gin (collected_by_keywords);
 * - CREATE INDEX tweets_hash_tags_gin_idx ON tweets USING gin (hash_tags);
 * - CREATE INDEX tweets_symbols_gin_idx ON tweets USING gin (symbols);
 */
export const tweets = pgTable(
  "tweets",
  {
    tweet_id: text("tweet_id").primaryKey(),
    author_handle: text("author_handle").notNull(),
    author_id: text("author_id"),
    author_name: text("author_name"),
    content: text("content").notNull(),
    views: integer("views").default(0).notNull(),
    likes: integer("likes").default(0).notNull(),
    retweets: integer("retweets").default(0).notNull(),
    replies: integer("replies").default(0).notNull(),
    mentions: text("mentions").array(),
    eligible_loyalty_mentions: text("eligible_loyalty_mentions")
      .array()
      .default([]),
    collected_by_keywords: text("collected_by_keywords").array().default([]),
    hash_tags: text("hash_tags").array().default([]),
    symbols: text("symbols").array().default([]),
    created_at: timestamp("created_at").notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
    collected_at: timestamp("collected_at").defaultNow().notNull(),
    is_retweet: boolean("is_retweet").default(false),
    is_quote_tweet: boolean("is_quote_tweet").default(false),
    tweet_link: text("tweet_link"),
  },
  (table) => {
    return {
      authorHandleIdx: index("tweets_author_handle_idx").on(
        table.author_handle
      ),
      authorIdIdx: index("tweets_author_id_idx").on(
        table.author_id
      ),
      tweetIdIdx: index("tweets_tweet_id_idx").on(
        table.tweet_id
      ),
      createdAtIdx: index("tweets_created_at_idx").on(table.created_at),
      updatedAtIdx: index("tweets_updated_at_idx").on(table.updated_at),
      // Note: We no longer need a B-Tree index on collected_by_keywords
      // since we'll be using the GIN index below for better array searching
      // GIN indexes for arrays are created via direct SQL migration
      // (Drizzle ORM doesn't support GIN indexes directly through the schema)
      // These will be created in a separate SQL migration script
    };
  }
);

// For backward compatibility
export const tweetsCollection = tweets;

// Create Zod schemas for type validation
export const insertTweetsSchema = createInsertSchema(tweets).omit({
  updated_at: true,
  collected_at: true,
});

export const selectTweetsSchema = createSelectSchema(tweets);

// For backward compatibility
export const insertTweetsCollectionSchema = insertTweetsSchema;
export const selectTweetsCollectionSchema = selectTweetsSchema;

// Export TypeScript types
export type Tweet = typeof tweets.$inferSelect;
export type InsertTweet = typeof tweets.$inferInsert;

// For backward compatibility
export type TweetsCollection = Tweet;
export type InsertTweetsCollection = InsertTweet;
