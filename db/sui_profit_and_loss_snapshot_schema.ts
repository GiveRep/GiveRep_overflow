import { pgTable, serial, varchar, timestamp, numeric, jsonb, index } from 'drizzle-orm/pg-core';

export const sui_profit_and_loss_snapshot = pgTable('sui_profit_and_loss_snapshot', {
  id: serial('id').primaryKey(),
  sui_address: varchar('sui_address', { length: 66 }).notNull(),
  created_time: timestamp('created_time').defaultNow().notNull(),
  usd_value: numeric('usd_value', { precision: 20, scale: 6 }).notNull(), // Total USD value with 6 decimal precision
  coins_data: jsonb('coins_data').notNull(), // Store full coin data from BlockVision API
}, (table) => {
  return {
    // Index for faster queries by address
    addressIdx: index('idx_sui_pnl_address').on(table.sui_address),
    // Index for time-based queries
    createdTimeIdx: index('idx_sui_pnl_created_time').on(table.created_time),
    // Composite index for address + time queries
    addressTimeIdx: index('idx_sui_pnl_address_time').on(table.sui_address, table.created_time),
  };
});