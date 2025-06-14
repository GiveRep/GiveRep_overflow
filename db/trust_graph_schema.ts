import { pgTable, serial, text, varchar, integer, timestamp, boolean, jsonb, index, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// Trust graph cache table - stores following/follower data
export const trustGraphCache = pgTable("trust_graph_cache", {
  id: serial("id").primaryKey(),
  twitter_handle: text("twitter_handle").notNull(),
  data_type: text("data_type").notNull(), // 'following' or 'followers'
  data: jsonb("data").notNull(), // Array of following/follower objects
  following_count: integer("following_count"), // Total count for filtering >10k
  last_updated: timestamp("last_updated").defaultNow().notNull(),
  is_valid: boolean("is_valid").default(true).notNull(),
}, (table) => ({
  handleTypeIdx: index("trust_graph_cache_handle_type_idx").on(table.twitter_handle, table.data_type),
  followingCountIdx: index("trust_graph_cache_following_count_idx").on(table.following_count),
}));

// Trust scores table - stores bot detection scores for users
export const trustScores = pgTable("trust_scores", {
  id: serial("id").primaryKey(),
  twitter_handle: text("twitter_handle").notNull().unique(),
  trust_score: integer("trust_score").notNull(), // Number of overlaps with trust graph
  total_following: integer("total_following"), // Total accounts they follow
  overlapping_accounts: jsonb("overlapping_accounts"), // Array of overlapping trusted accounts
  is_bot_flag: boolean("is_bot_flag").default(false).notNull(), // Auto-flagged as bot if score < 10
  last_calculated: timestamp("last_calculated").defaultNow().notNull(),
  notes: text("notes"),
}, (table) => ({
  trustScoreIdx: index("trust_scores_score_idx").on(table.trust_score),
  botFlagIdx: index("trust_scores_bot_flag_idx").on(table.is_bot_flag),
}));

// Trust graph build logs - tracks the building process
export const trustGraphBuildLogs = pgTable("trust_graph_build_logs", {
  id: serial("id").primaryKey(),
  root_account: text("root_account").notNull(), // 0xd34th
  total_trusted_accounts: integer("total_trusted_accounts"),
  accounts_processed: integer("accounts_processed"),
  accounts_skipped_10k: integer("accounts_skipped_10k"), // Skipped due to >10k following
  build_status: text("build_status").notNull(), // 'in_progress', 'completed', 'failed'
  started_at: timestamp("started_at").defaultNow().notNull(),
  completed_at: timestamp("completed_at"),
  error_message: text("error_message"),
});

// Relations
export const trustGraphCacheRelations = relations(trustGraphCache, ({ many }) => ({
  // No direct relations needed for cache table
}));

export const trustScoresRelations = relations(trustScores, ({ many }) => ({
  // Could relate to loyalty users if needed
}));

// Zod schemas for validation
export const insertTrustGraphCacheSchema = createInsertSchema(trustGraphCache);
export const selectTrustGraphCacheSchema = createSelectSchema(trustGraphCache);

export const insertTrustScoreSchema = createInsertSchema(trustScores);
export const selectTrustScoreSchema = createSelectSchema(trustScores);

export const insertTrustGraphBuildLogSchema = createInsertSchema(trustGraphBuildLogs);
export const selectTrustGraphBuildLogSchema = createSelectSchema(trustGraphBuildLogs);

// Types
export type TrustGraphCache = typeof trustGraphCache.$inferSelect;
export type InsertTrustGraphCache = typeof trustGraphCache.$inferInsert;

export type TrustScore = typeof trustScores.$inferSelect;
export type InsertTrustScore = typeof trustScores.$inferInsert;

export type TrustGraphBuildLog = typeof trustGraphBuildLogs.$inferSelect;
export type InsertTrustGraphBuildLog = typeof trustGraphBuildLogs.$inferInsert;

// Following relationships table - stores who follows whom
export const trustGraphFollowingRelationships = pgTable("trust_graph_following_relationships", {
  id: serial("id").primaryKey(),
  session_id: integer("session_id"), // Session that created this relationship (nullable for existing data)
  follower_user_id: varchar("follower_user_id", { length: 255 }).notNull(), // Twitter user ID of follower
  follower_handle: varchar("follower_handle", { length: 255 }).notNull(), // Twitter handle of follower
  following_user_id: varchar("following_user_id", { length: 255 }).notNull(), // Twitter user ID of who they follow
  following_handle: varchar("following_handle", { length: 255 }).notNull(), // Twitter handle of who they follow
  discovered_at: timestamp("discovered_at").defaultNow(),
  last_verified: timestamp("last_verified").defaultNow(),
  is_active: boolean("is_active").default(true),
}, (table) => ({
  // Unique constraint to prevent duplicate relationships per session
  uniqueRelationshipPerSession: unique().on(table.session_id, table.follower_user_id, table.following_user_id),
  // Indexes for fast lookups
  sessionIdx: index("following_relationships_session_idx").on(table.session_id),
  followerIdx: index("following_relationships_follower_idx").on(table.follower_user_id),
  followingIdx: index("following_relationships_following_idx").on(table.following_user_id),
  followerHandleIdx: index("following_relationships_follower_handle_idx").on(table.follower_handle),
  followingHandleIdx: index("following_relationships_following_handle_idx").on(table.following_handle),
  // Composite index for session-based queries
  sessionFollowerIdx: index("following_relationships_session_follower_idx").on(table.session_id, table.follower_user_id),
}));

export const insertTrustGraphFollowingRelationshipSchema = createInsertSchema(trustGraphFollowingRelationships);
export const selectTrustGraphFollowingRelationshipSchema = createSelectSchema(trustGraphFollowingRelationships);

export type TrustGraphFollowingRelationship = typeof trustGraphFollowingRelationships.$inferSelect;
export type InsertTrustGraphFollowingRelationship = typeof trustGraphFollowingRelationships.$inferInsert;

// Trusted follower metrics table - aggregated follower counts for fast trust analysis
export const trustedFollowerMetrics = pgTable("trusted_follower_metrics", {
  id: serial("id").primaryKey(),
  type: text("type").default("Sui").notNull(),
  twitter_handle: text("twitter_handle").notNull(),
  twitter_id: varchar("twitter_id", { length: 255 }), // Store as varchar to match relationships table
  trusted_follower_count: integer("trusted_follower_count").default(0).notNull(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Unique constraint for type, handle, and twitter_id combination
  uniqueConstraint: unique().on(table.type, table.twitter_handle, table.twitter_id),
  // Indexes for performance
  typeIdx: index("trusted_follower_metrics_type_idx").on(table.type),
  handleIdx: index("trusted_follower_metrics_handle_idx").on(table.twitter_handle),
  twitterIdIdx: index("trusted_follower_metrics_twitter_id_idx").on(table.twitter_id),
  countIdx: index("trusted_follower_metrics_count_idx").on(table.trusted_follower_count),
}));

export const insertTrustedFollowerMetricsSchema = createInsertSchema(trustedFollowerMetrics);
export const selectTrustedFollowerMetricsSchema = createSelectSchema(trustedFollowerMetrics);

export type TrustedFollowerMetrics = typeof trustedFollowerMetrics.$inferSelect;
export type InsertTrustedFollowerMetrics = typeof trustedFollowerMetrics.$inferInsert;

// Trust graph decompress progress table - tracks script execution progress for resumability
export const trustGraphDecompressProgress = pgTable("trust_graph_decompress_progress", {
  id: serial("id").primaryKey(),
  job_session_id: integer("job_session_id").notNull(), // Auto-incrementing session number
  cache_entry_id: integer("cache_entry_id").notNull(), // References trust_graph_cache.id
  cache_entry_handle: text("cache_entry_handle").notNull(), // Twitter handle for convenience
  processing_status: text("processing_status").notNull(), // 'pending', 'in_progress', 'completed', 'failed'
  last_batch_processed: integer("last_batch_processed").default(0), // For granular resume within cache entry
  total_batches: integer("total_batches"), // Total batches expected for this cache entry
  relationships_processed: integer("relationships_processed").default(0), // Count of relationships processed
  total_relationships: integer("total_relationships"), // Total relationships expected
  started_at: timestamp("started_at").defaultNow(),
  completed_at: timestamp("completed_at"),
  error_message: text("error_message"),
}, (table) => ({
  // Unique constraint per session and cache entry
  uniqueSessionCache: unique().on(table.job_session_id, table.cache_entry_id),
  // Indexes for performance
  sessionIdx: index("decompress_progress_session_idx").on(table.job_session_id),
  statusIdx: index("decompress_progress_status_idx").on(table.processing_status),
  cacheEntryIdx: index("decompress_progress_cache_entry_idx").on(table.cache_entry_id),
}));

export const insertTrustGraphDecompressProgressSchema = createInsertSchema(trustGraphDecompressProgress);
export const selectTrustGraphDecompressProgressSchema = createSelectSchema(trustGraphDecompressProgress);

export type TrustGraphDecompressProgress = typeof trustGraphDecompressProgress.$inferSelect;
export type InsertTrustGraphDecompressProgress = typeof trustGraphDecompressProgress.$inferInsert;

// Trust graph decompress sessions table - tracks session metadata
export const trustGraphDecompressSessions = pgTable("trust_graph_decompress_sessions", {
  id: serial("id").primaryKey(), // This becomes the session_id
  status: text("status").notNull().default('active'), // 'active', 'completed', 'failed', 'cancelled'
  total_cache_entries: integer("total_cache_entries").default(0),
  processed_cache_entries: integer("processed_cache_entries").default(0),
  total_relationships: integer("total_relationships").default(0),
  processed_relationships: integer("processed_relationships").default(0),
  started_at: timestamp("started_at").defaultNow().notNull(),
  completed_at: timestamp("completed_at"),
  error_message: text("error_message"),
  description: text("description"), // Optional description for the session
}, (table) => ({
  statusIdx: index("decompress_sessions_status_idx").on(table.status),
  startedAtIdx: index("decompress_sessions_started_at_idx").on(table.started_at),
}));

export const insertTrustGraphDecompressSessionSchema = createInsertSchema(trustGraphDecompressSessions);
export const selectTrustGraphDecompressSessionSchema = createSelectSchema(trustGraphDecompressSessions);

export type TrustGraphDecompressSession = typeof trustGraphDecompressSessions.$inferSelect;
export type InsertTrustGraphDecompressSession = typeof trustGraphDecompressSessions.$inferInsert;