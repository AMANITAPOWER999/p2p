import { Router } from "express";
import { db, tradesTable, accountsTable, notificationsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  ListTradesQueryParams,
  CreateTradeBody,
  GetTradeParams,
  UpdateTradeParams,
  UpdateTradeBody,
  ConfirmPaymentParams,
  ReleaseCryptoParams,
} from "@workspace/api-zod";

const router = Router();

function fmt(trade: typeof tradesTable.$inferSelect, accountName?: string | null, exchange?: string | null) {
  return {
    ...trade,
    accountName: accountName ?? null,
    exchange: exchange ?? null,
    completedAt: trade.completedAt ? trade.completedAt.toISOString() : null,
    createdAt: trade.createdAt.toISOString(),
  };
}

router.get("/trades", async (req, res) => {
  try {
    const params = ListTradesQueryParams.parse({
      accountId: req.query.accountId ? Number(req.query.accountId) : undefined,
      status: req.query.status,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    const conditions = [];
    if (params.accountId) conditions.push(eq(tradesTable.accountId, params.accountId));
    if (params.status && params.status !== "all") conditions.push(eq(tradesTable.status, params.status));
    const base = db
      .select({ trade: tradesTable, accountName: accountsTable.name, exchange: accountsTable.exchange })
      .from(tradesTable)
      .leftJoin(accountsTable, eq(tradesTable.accountId, accountsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tradesTable.createdAt));
    const rows = params.limit ? await base.limit(params.limit) : await base;
    res.json(rows.map((r) => fmt(r.trade, r.accountName, r.exchange)));
  } catch (err) {
    req.log.error(err, "Failed to list trades");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/trades", async (req, res) => {
  try {
    const body = CreateTradeBody.parse(req.body);
    const [trade] = await db.insert(tradesTable).values(body).returning();
    await db.insert(notificationsTable).values({
      type: "trade",
      title: "New Trade",
      message: `New ${trade.side} trade: ${trade.amount} ${trade.asset}`,
      relatedId: trade.id,
      relatedType: "trade",
    });
    res.status(201).json(fmt(trade));
  } catch (err) {
    req.log.error(err, "Failed to create trade");
    res.status(400).json({ error: "Invalid input" });
  }
});

router.get("/trades/:id", async (req, res) => {
  try {
    const { id } = GetTradeParams.parse({ id: Number(req.params.id) });
    const [row] = await db
      .select({ trade: tradesTable, accountName: accountsTable.name, exchange: accountsTable.exchange })
      .from(tradesTable)
      .leftJoin(accountsTable, eq(tradesTable.accountId, accountsTable.id))
      .where(eq(tradesTable.id, id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(fmt(row.trade, row.accountName, row.exchange));
  } catch (err) {
    req.log.error(err, "Failed to get trade");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/trades/:id", async (req, res) => {
  try {
    const { id } = UpdateTradeParams.parse({ id: Number(req.params.id) });
    const body = UpdateTradeBody.parse(req.body);
    const updateData: Record<string, unknown> = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.paymentDetails !== undefined) updateData.paymentDetails = body.paymentDetails;
    if (body.profit !== undefined) updateData.profit = body.profit;
    if (body.status === "completed") updateData.completedAt = new Date();
    const [trade] = await db.update(tradesTable).set(updateData).where(eq(tradesTable.id, id)).returning();
    if (!trade) { res.status(404).json({ error: "Not found" }); return; }
    res.json(fmt(trade));
  } catch (err) {
    req.log.error(err, "Failed to update trade");
    res.status(400).json({ error: "Invalid input" });
  }
});

router.post("/trades/:id/confirm-payment", async (req, res) => {
  try {
    const { id } = ConfirmPaymentParams.parse({ id: Number(req.params.id) });
    const [trade] = await db.update(tradesTable).set({ status: "paid" }).where(eq(tradesTable.id, id)).returning();
    if (!trade) { res.status(404).json({ error: "Not found" }); return; }
    await db.insert(notificationsTable).values({
      type: "payment",
      title: "Payment Confirmed",
      message: `Payment confirmed for trade #${id}`,
      relatedId: id,
      relatedType: "trade",
    });
    res.json(fmt(trade));
  } catch (err) {
    req.log.error(err, "Failed to confirm payment");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/trades/:id/release", async (req, res) => {
  try {
    const { id } = ReleaseCryptoParams.parse({ id: Number(req.params.id) });
    const [trade] = await db
      .update(tradesTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(tradesTable.id, id))
      .returning();
    if (!trade) { res.status(404).json({ error: "Not found" }); return; }
    await db
      .update(accountsTable)
      .set({
        totalVolume: sql`total_volume + ${trade.fiatAmount}`,
        completedTrades: sql`completed_trades + 1`,
        totalProfit: trade.profit ? sql`total_profit + ${trade.profit}` : accountsTable.totalProfit,
      })
      .where(eq(accountsTable.id, trade.accountId));
    await db.insert(notificationsTable).values({
      type: "trade",
      title: "Crypto Released",
      message: `Trade #${id} completed — ${trade.amount} ${trade.asset} released`,
      relatedId: id,
      relatedType: "trade",
    });
    res.json(fmt(trade));
  } catch (err) {
    req.log.error(err, "Failed to release crypto");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
