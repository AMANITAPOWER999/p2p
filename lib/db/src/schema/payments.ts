import { pgTable, text, serial, timestamp, doublePrecision, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  tradeId: integer("trade_id"),
  type: text("type").notNull(), // incoming | outgoing
  amount: doublePrecision("amount").notNull(),
  currency: text("currency").notNull(),
  bankName: text("bank_name"),
  senderName: text("sender_name"),
  reference: text("reference"),
  status: text("status").notNull().default("pending"), // pending | confirmed | failed
  source: text("source"), // push | email | sms | manual
  notificationRaw: text("notification_raw"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
