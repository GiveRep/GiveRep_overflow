import { pgTable, serial, integer, text, timestamp, unique, index } from "drizzle-orm/pg-core";

/**
 * Project Creator Scores schema
 * Stores creator scores and relevance scores specific to each project
 * This allows users to have different scores for different projects
 */
export const projectCreatorScores = pgTable("project_creator_scores", {
  id: serial("id").primaryKey(),
  project_id: integer("project_id").notNull(),
  twitter_handle: text("twitter_handle").notNull(), // lowercase handle
  creator_score: integer("creator_score").notNull().default(0), // 0-1000 - global creator quality score
  relevance_score: integer("relevance_score").notNull().default(0), // 0-1000 - project-specific relevance
  categories: text("categories").array().default([]), // Array of category tags (FARMER, CREATOR, etc.)
  last_updated: timestamp("last_updated").defaultNow(),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    // Unique constraint on project_id + twitter_handle
    projectHandleUnique: unique("project_handle_unique").on(table.project_id, table.twitter_handle),
    // Index for efficient lookups
    projectIdIdx: index("idx_project_creator_scores_project_id").on(table.project_id),
    handleIdx: index("idx_project_creator_scores_handle").on(table.twitter_handle),
    scoreIdx: index("idx_project_creator_scores_score").on(table.creator_score),
    relevanceIdx: index("idx_project_creator_scores_relevance").on(table.relevance_score),
  };
});

export type ProjectCreatorScore = typeof projectCreatorScores.$inferSelect;
export type InsertProjectCreatorScore = typeof projectCreatorScores.$inferInsert;