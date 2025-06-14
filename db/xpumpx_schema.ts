import { pgTable, serial, text, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const xpumpxCoins = pgTable("xpumpx_coins", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 10 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  description: text("description").notNull(),
  image_url: text("image_url"),
  created_by: varchar("created_by", { length: 50 }),
  is_approved: boolean("is_approved").default(false).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at"),
});

export const xpumpxTrades = pgTable("xpumpx_trades", {
  id: serial("id").primaryKey(),
  coin_key: varchar("coin_key", { length: 10 }).notNull(),
  buyer: varchar("buyer", { length: 50 }).notNull(),
  seller: varchar("seller", { length: 50 }),
  amount: text("amount").notNull(),
  price: text("price").notNull(),
  is_completed: boolean("is_completed").default(false).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  completed_at: timestamp("completed_at"),
});

export const xpumpxHoldings = pgTable("xpumpx_holdings", {
  id: serial("id").primaryKey(),
  coin_key: varchar("coin_key", { length: 10 }).notNull(),
  owner: varchar("owner", { length: 50 }).notNull(),
  amount: text("amount").notNull(),
  last_updated: timestamp("last_updated").defaultNow().notNull(),
});

// Relations
export const xpumpxCoinsRelations = relations(xpumpxCoins, ({ many }) => ({
  trades: many(xpumpxTrades, { relationName: "coin_trades" }),
  holdings: many(xpumpxHoldings, { relationName: "coin_holdings" }),
}));

export const xpumpxTradesRelations = relations(xpumpxTrades, ({ one }) => ({
  coin: one(xpumpxCoins, {
    fields: [xpumpxTrades.coin_key],
    references: [xpumpxCoins.key],
    relationName: "coin_trades",
  }),
}));

export const xpumpxHoldingsRelations = relations(xpumpxHoldings, ({ one }) => ({
  coin: one(xpumpxCoins, {
    fields: [xpumpxHoldings.coin_key],
    references: [xpumpxCoins.key],
    relationName: "coin_holdings",
  }),
}));

// Types
export type XpumpxCoin = typeof xpumpxCoins.$inferSelect;
export type InsertXpumpxCoin = typeof xpumpxCoins.$inferInsert;
export type XpumpxTrade = typeof xpumpxTrades.$inferSelect;
export type InsertXpumpxTrade = typeof xpumpxTrades.$inferInsert;
export type XpumpxHolding = typeof xpumpxHoldings.$inferSelect;
export type InsertXpumpxHolding = typeof xpumpxHoldings.$inferInsert;

// Schemas
export const insertXpumpxCoinSchema = createInsertSchema(xpumpxCoins).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const selectXpumpxCoinSchema = createSelectSchema(xpumpxCoins);

export const insertXpumpxTradeSchema = createInsertSchema(xpumpxTrades).omit({
  id: true,
  created_at: true,
  completed_at: true,
});

export const selectXpumpxTradeSchema = createSelectSchema(xpumpxTrades);

export const insertXpumpxHoldingSchema = createInsertSchema(xpumpxHoldings).omit({
  id: true,
  last_updated: true,
});

export const selectXpumpxHoldingSchema = createSelectSchema(xpumpxHoldings);