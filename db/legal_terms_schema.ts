import { pgTable, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core';

export const legalTermsAgreement = pgTable('legal_terms_agreement', {
  id: uuid('id').defaultRandom().primaryKey(),
  userHandle: text('user_handle').notNull(),
  walletAddress: text('wallet_address').notNull(),
  agreedAt: timestamp('agreed_at').notNull().defaultNow(),
  termsVersion: text('terms_version').notNull().default('2025-06-01'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
}, (table) => ({
  userHandleWalletIdx: uniqueIndex('user_handle_wallet_idx').on(table.userHandle, table.walletAddress),
}));