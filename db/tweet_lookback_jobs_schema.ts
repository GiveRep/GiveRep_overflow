import { pgTable, text, timestamp, bigint, integer, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Track tweet lookback jobs for historical data collection
export const tweetLookbackJobs = pgTable("tweet_lookback_jobs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  
  // Job configuration
  project_id: bigint("project_id", { mode: "number" }), // null means all projects
  start_date: timestamp("start_date", { withTimezone: true }).notNull(),
  end_date: timestamp("end_date", { withTimezone: true }).notNull(),
  batch_size: integer("batch_size").notNull().default(4),
  
  // Job status
  status: text("status").notNull().default("pending"), // pending, running, paused, completed, failed, cancelled
  started_at: timestamp("started_at", { withTimezone: true }),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  
  // Progress tracking
  total_intervals: integer("total_intervals").notNull().default(0),
  processed_intervals: integer("processed_intervals").notNull().default(0),
  skipped_intervals: integer("skipped_intervals").notNull().default(0),
  failed_intervals: integer("failed_intervals").notNull().default(0),
  
  // Tweet statistics
  total_tweets_collected: bigint("total_tweets_collected", { mode: "number" }).notNull().default(0),
  total_new_tweets: bigint("total_new_tweets", { mode: "number" }).notNull().default(0),
  
  // Resume capability
  last_processed_interval: jsonb("last_processed_interval"), // {start: Date, end: Date}
  failed_interval_details: jsonb("failed_interval_details").default([]), // Array of {interval, error}
  
  // Metadata
  created_by: text("created_by"), // admin username
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  
  // Error tracking
  error_message: text("error_message"),
  error_count: integer("error_count").notNull().default(0),
}, (table) => ({
  statusIdx: index("tweet_lookback_jobs_status_idx").on(table.status),
  projectStatusIdx: index("tweet_lookback_jobs_project_status_idx").on(table.project_id, table.status),
  createdAtIdx: index("tweet_lookback_jobs_created_at_idx").on(table.created_at),
}));

// Job progress logs for detailed tracking
export const tweetLookbackJobLogs = pgTable("tweet_lookback_job_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  job_id: bigint("job_id", { mode: "number" }).notNull().references(() => tweetLookbackJobs.id),
  
  log_type: text("log_type").notNull(), // info, warning, error, progress
  message: text("message").notNull(),
  details: jsonb("details"), // Additional structured data
  
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  jobIdIdx: index("tweet_lookback_job_logs_job_id_idx").on(table.job_id),
  logTypeIdx: index("tweet_lookback_job_logs_type_idx").on(table.log_type),
}));

// Relations
export const tweetLookbackJobsRelations = relations(tweetLookbackJobs, ({ many }) => ({
  logs: many(tweetLookbackJobLogs),
}));

export const tweetLookbackJobLogsRelations = relations(tweetLookbackJobLogs, ({ one }) => ({
  job: one(tweetLookbackJobs, {
    fields: [tweetLookbackJobLogs.job_id],
    references: [tweetLookbackJobs.id],
  }),
}));