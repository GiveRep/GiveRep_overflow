import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * Schema for the affiliated_accounts table
 * This table tracks accounts that are affiliated with each other and should not
 * be able to award reputation points to each other (preventing self-promotion)
 */
export const affiliatedAccounts = pgTable(
  "affiliated_accounts",
  {
    id: serial("id").primaryKey(),
    accountGroup: text("account_group").notNull(),
    twitterHandle: text("twitter_handle").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => {
    return {
      groupHandleUnique: uniqueIndex("affiliated_accounts_account_group_twitter_handle_key").on(
        table.accountGroup,
        table.twitterHandle
      ),
    };
  }
);

// Schemas for insert and select operations
export const insertAffiliatedAccountSchema = createInsertSchema(affiliatedAccounts);
export const selectAffiliatedAccountSchema = createSelectSchema(affiliatedAccounts);

// Types
export type AffiliatedAccount = typeof affiliatedAccounts.$inferSelect;
export type NewAffiliatedAccount = typeof affiliatedAccounts.$inferInsert;