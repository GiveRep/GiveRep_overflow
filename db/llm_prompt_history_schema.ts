import { pgTable, text, timestamp, bigint, jsonb, varchar, integer } from "drizzle-orm/pg-core";

export const llmPromptHistory = pgTable("llm_prompt_history", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  handle: varchar("handle", { length: 255 }),
  project_id: integer("project_id"),
  type: varchar("type", { length: 100 }).notNull(), // 'relevance_score', 'creator_score', etc.
  input: text("input").notNull(),
  output: text("output").notNull(),
  model: varchar("model", { length: 100 }),
  token_usage: jsonb("token_usage"), // { input: number, output: number, total: number }
  created_at: timestamp("created_at").defaultNow().notNull(),
  metadata: jsonb("metadata"), // Additional context like project name, scores, etc.
});