import { pgTable, serial, text, integer, timestamp, boolean, jsonb, decimal, uuid, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Enum for task status
export const taskStatusEnum = pgEnum('pfp_task_status', ['pending', 'running', 'paused', 'completed', 'failed']);

// Main task table - tracks overall PFP matching tasks
export const pfp_matching_tasks = pgTable('pfp_matching_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  status: taskStatusEnum('status').notNull().default('pending'),
  
  // Task configuration
  similarityThreshold: decimal('similarity_threshold', { precision: 3, scale: 2 }).notNull().default('0.80'),
  checkIntervalDays: integer('check_interval_days').notNull().default(7),
  batchSize: integer('batch_size').notNull().default(100),
  parallelLimit: integer('parallel_limit').notNull().default(10),
  
  // Progress tracking
  totalUsers: integer('total_users').notNull().default(0),
  processedUsers: integer('processed_users').notNull().default(0),
  matchedUsers: integer('matched_users').notNull().default(0),
  failedUsers: integer('failed_users').notNull().default(0),
  profilesUpdated: integer('profiles_updated').notNull().default(0),
  
  // Timing
  startedAt: timestamp('started_at'),
  pausedAt: timestamp('paused_at'),
  completedAt: timestamp('completed_at'),
  estimatedCompletionTime: timestamp('estimated_completion_time'),
  
  // Additional stats
  errorLog: jsonb('error_log').default(sql`'[]'::jsonb`),
  lastProcessedUserId: integer('last_processed_user_id'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Session table - tracks individual processing sessions within a task
export const pfp_matching_sessions = pgTable('pfp_matching_sessions', {
  id: serial('id').primaryKey(),
  taskId: uuid('task_id').notNull().references(() => pfp_matching_tasks.id, { onDelete: 'cascade' }),
  
  sessionNumber: integer('session_number').notNull(),
  status: taskStatusEnum('status').notNull().default('running'),
  
  // Session progress
  usersProcessed: integer('users_processed').notNull().default(0),
  usersMatched: integer('users_matched').notNull().default(0),
  usersFailed: integer('users_failed').notNull().default(0),
  
  // Timing
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),
  duration: integer('duration'), // in seconds
  
  // Processing rate
  processingRate: decimal('processing_rate', { precision: 10, scale: 2 }), // users per minute
  
  createdAt: timestamp('created_at').notNull().defaultNow()
});

// User processing log - tracks individual user processing results
export const pfp_processing_log = pgTable('pfp_processing_log', {
  id: serial('id').primaryKey(),
  taskId: uuid('task_id').notNull().references(() => pfp_matching_tasks.id, { onDelete: 'cascade' }),
  sessionId: integer('session_id').references(() => pfp_matching_sessions.id, { onDelete: 'cascade' }),
  
  userId: integer('user_id').notNull(),
  twitterHandle: text('twitter_handle').notNull(),
  
  // Processing result
  success: boolean('success').notNull(),
  profileImageUrl: text('profile_image_url'),
  matchedCollectionId: integer('matched_collection_id'),
  similarity: decimal('similarity', { precision: 3, scale: 2 }),
  error: text('error'),
  
  processedAt: timestamp('processed_at').notNull().defaultNow()
});

// Export types
export type PfpMatchingTask = typeof pfp_matching_tasks.$inferSelect;
export type NewPfpMatchingTask = typeof pfp_matching_tasks.$inferInsert;
export type PfpMatchingSession = typeof pfp_matching_sessions.$inferSelect;
export type NewPfpMatchingSession = typeof pfp_matching_sessions.$inferInsert;
export type PfpProcessingLog = typeof pfp_processing_log.$inferSelect;
export type NewPfpProcessingLog = typeof pfp_processing_log.$inferInsert;