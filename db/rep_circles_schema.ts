import { pgTable, serial, text, integer, timestamp, boolean, pgEnum, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// Create circles table for reputation-based group chats
export const repCircles = pgTable("rep_circles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  profile_image: text("profile_image"),
  min_reputation: integer("min_reputation").default(0).notNull(),
  created_by: text("created_by").notNull(), // Twitter handle of the admin who created the circle
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  is_active: boolean("is_active").default(true).notNull(),
});

// Create circle members table
export const repCircleMembers = pgTable("rep_circle_members", {
  id: serial("id").primaryKey(),
  circle_id: integer("circle_id").notNull().references(() => repCircles.id, { onDelete: "cascade" }),
  twitter_handle: text("twitter_handle").notNull(),
  joined_at: timestamp("joined_at").defaultNow().notNull(),
  is_admin: boolean("is_admin").default(false).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
});

// Create messages table for each circle
export const repCircleMessages = pgTable("rep_circle_messages", {
  id: serial("id").primaryKey(),
  circle_id: integer("circle_id").notNull().references(() => repCircles.id, { onDelete: "cascade" }),
  sender: text("sender").notNull(), // Twitter handle of the sender
  message: text("message").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  is_pinned: boolean("is_pinned").default(false).notNull(),
  is_deleted: boolean("is_deleted").default(false).notNull(),
});

// Define relationships between tables
export const repCirclesRelations = relations(repCircles, ({ many }) => ({
  members: many(repCircleMembers),
  messages: many(repCircleMessages),
}));

export const repCircleMembersRelations = relations(repCircleMembers, ({ one }) => ({
  circle: one(repCircles, {
    fields: [repCircleMembers.circle_id],
    references: [repCircles.id],
  }),
}));

export const repCircleMessagesRelations = relations(repCircleMessages, ({ one }) => ({
  circle: one(repCircles, {
    fields: [repCircleMessages.circle_id],
    references: [repCircles.id],
  }),
}));

// Create types for the tables
export type RepCircle = typeof repCircles.$inferSelect;
export type InsertRepCircle = typeof repCircles.$inferInsert;
export type RepCircleMember = typeof repCircleMembers.$inferSelect;
export type InsertRepCircleMember = typeof repCircleMembers.$inferInsert;
export type RepCircleMessage = typeof repCircleMessages.$inferSelect;
export type InsertRepCircleMessage = typeof repCircleMessages.$inferInsert;

// Create Zod schemas for validation
export const insertRepCircleSchema = createInsertSchema(repCircles);
export const selectRepCircleSchema = createSelectSchema(repCircles);
export const insertRepCircleMemberSchema = createInsertSchema(repCircleMembers);
export const selectRepCircleMemberSchema = createSelectSchema(repCircleMembers);
export const insertRepCircleMessageSchema = createInsertSchema(repCircleMessages);
export const selectRepCircleMessageSchema = createSelectSchema(repCircleMessages);