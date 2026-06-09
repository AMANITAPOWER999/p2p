import { pgTable, text, serial, timestamp, boolean, doublePrecision, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  side: text("side").notNull(), // buy | sell
  asset: text("asset").notNull(), // USDT, BTC, etc
  fiatCurrency: text("fiat_currency").notNull(), // VND, USD, etc
  price: doublePrecision("price").notNull(),
  minAmount: doublePrecision("min_amount").notNull(),
  maxAmount: doublePrecision("max_amount").notNull(),
  availableAmount: doublePrecision("available_amount"),
  paymentMethod: text("payment_method"),
  isActive: boolean("is_active").notNull().default(true),
  completedTrades: integer("completed_trades").default(0),
  completionRate: doublePrecision("completion_rate"),
  exchangeOrderId: text("exchange_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
