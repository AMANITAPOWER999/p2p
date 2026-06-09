import { pgTable, text, serial, timestamp, doublePrecision, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  orderId: integer("order_id"),
  exchangeTradeId: text("exchange_trade_id"),
  counterpartyName: text("counterparty_name"),
  side: text("side").notNull(), // buy | sell
  asset: text("asset").notNull(),
  fiatCurrency: text("fiat_currency").notNull(),
  amount: doublePrecision("amount").notNull(),
  fiatAmount: doublePrecision("fiat_amount").notNull(),
  price: doublePrecision("price").notNull(),
  status: text("status").notNull().default("pending"), // pending | paid | completed | cancelled | disputed
  paymentMethod: text("payment_method"),
  paymentDetails: text("payment_details"),
  notes: text("notes"),
  profit: doublePrecision("profit"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
