import { pgTable, text, timestamp, integer, bigint } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { mindshareProjects } from "./mindshare_schema";

export const mindshareSnapshots = pgTable("mindshare_snapshots", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  projectId: bigint("project_id", { mode: "number" }).notNull(),
  projectHandle: text("project_handle").notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  sumOfViews: bigint("sum_of_views", { mode: "number" }).notNull().default(0),
  sumOfLikes: bigint("sum_of_likes", { mode: "number" }).notNull().default(0),
  sumOfReplies: bigint("sum_of_replies", { mode: "number" }).notNull().default(0),
  sumOfRetweets: bigint("sum_of_retweets", { mode: "number" }).notNull().default(0),
  tweetCount: integer("tweet_count").notNull().default(0),
  uniqueAuthors: integer("unique_authors").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mindshareSnapshotsRelations = relations(mindshareSnapshots, ({ one }) => ({
  project: one(mindshareProjects, {
    fields: [mindshareSnapshots.projectId],
    references: [mindshareProjects.id],
  }),
}));

// Type exports
export type MindshareSnapshot = typeof mindshareSnapshots.$inferSelect;
export type NewMindshareSnapshot = typeof mindshareSnapshots.$inferInsert;