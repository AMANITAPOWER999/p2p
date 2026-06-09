import { pgTable, text, serial, timestamp, boolean, doublePrecision, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  exchange: text("exchange").notNull(), // mexc | bybit
  ownerName: text("owner_name").notNull(),
  bankName: text("bank_name").notNull(),
  bankUrl: text("bank_url"),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  isActive: boolean("is_active").notNull().default(true),
  balance: doublePrecision("balance"),
  frozenBalance: doublePrecision("frozen_balance"),
  totalVolume: doublePrecision("total_volume").default(0),
  totalProfit: doublePrecision("total_profit").default(0),
  completedTrades: integer("completed_trades").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
