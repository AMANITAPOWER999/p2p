import { Router } from "express";
import { db, tradesTable, paymentsTable, ordersTable, accountsTable, notificationsTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
import { GetStatsHistoryQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/stats/dashboard", async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [volumeRow] = await db
      .select({ total: sql<number>`coalesce(sum(fiat_amount), 0)` })
      .from(tradesTable)
      .where(eq(tradesTable.status, "completed"));

    const [profitRow] = await db
      .select({ total: sql<number>`coalesce(sum(profit), 0)` })
      .from(tradesTable)
      .where(eq(tradesTable.status, "completed"));

    const [activeRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tradesTable)
      .where(sql`status IN ('pending', 'paid')`);

    const [completedRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tradesTable)
      .where(eq(tradesTable.status, "completed"));

    const [pendingPayRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(paymentsTable)
      .where(eq(paymentsTable.status, "pending"));

    const [activeOrderRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ordersTable)
      .where(eq(ordersTable.isActive, true));

    const [todayVolumeRow] = await db
      .select({ total: sql<number>`coalesce(sum(fiat_amount), 0)` })
      .from(tradesTable)
      .where(and(eq(tradesTable.status, "completed"), gte(tradesTable.createdAt, startOfDay)));

    const [todayProfitRow] = await db
      .select({ total: sql<number>`coalesce(sum(profit), 0)` })
      .from(tradesTable)
      .where(and(eq(tradesTable.status, "completed"), gte(tradesTable.createdAt, startOfDay)));

    const [todayTradesRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tradesTable)
      .where(gte(tradesTable.createdAt, startOfDay));

    const [unreadRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notificationsTable)
      .where(eq(notificationsTable.isRead, false));

    res.json({
      totalVolume: Number(volumeRow.total) || 0,
      totalProfit: Number(profitRow.total) || 0,
      activeTrades: Number(activeRow.count) || 0,
      completedTrades: Number(completedRow.count) || 0,
      pendingPayments: Number(pendingPayRow.count) || 0,
      activeOrders: Number(activeOrderRow.count) || 0,
      todayVolume: Number(todayVolumeRow.total) || 0,
      todayProfit: Number(todayProfitRow.total) || 0,
      todayTrades: Number(todayTradesRow.count) || 0,
      unreadNotifications: Number(unreadRow.count) || 0,
    });
  } catch (err) {
    req.log.error(err, "Failed to get dashboard stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats/history", async (req, res) => {
  try {
    const params = GetStatsHistoryQueryParams.parse({
      days: req.query.days ? Number(req.query.days) : undefined,
    });
    const days = params.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await db
      .select({
        date: sql<string>`date_trunc('day', created_at)::date::text`,
        volume: sql<number>`coalesce(sum(fiat_amount), 0)`,
        profit: sql<number>`coalesce(sum(profit), 0)`,
        tradesCount: sql<number>`count(*)`,
      })
      .from(tradesTable)
      .where(and(eq(tradesTable.status, "completed"), gte(tradesTable.createdAt, since)))
      .groupBy(sql`date_trunc('day', created_at)::date`)
      .orderBy(sql`date_trunc('day', created_at)::date`);

    res.json(
      rows.map((r) => ({
        date: r.date,
        volume: Number(r.volume) || 0,
        profit: Number(r.profit) || 0,
        tradesCount: Number(r.tradesCount) || 0,
      }))
    );
  } catch (err) {
    req.log.error(err, "Failed to get stats history");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stats/by-account", async (req, res) => {
  try {
    const accounts = await db.select().from(accountsTable);
    const result = await Promise.all(
      accounts.map(async (account) => {
        const [volumeRow] = await db
          .select({ total: sql<number>`coalesce(sum(fiat_amount), 0)` })
          .from(tradesTable)
          .where(and(eq(tradesTable.accountId, account.id), eq(tradesTable.status, "completed")));

        const [profitRow] = await db
          .select({ total: sql<number>`coalesce(sum(profit), 0)` })
          .from(tradesTable)
          .where(and(eq(tradesTable.accountId, account.id), eq(tradesTable.status, "completed")));

        const [tradesRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(tradesTable)
          .where(and(eq(tradesTable.accountId, account.id), eq(tradesTable.status, "completed")));

        const [ordersRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(ordersTable)
          .where(and(eq(ordersTable.accountId, account.id), eq(ordersTable.isActive, true)));

        return {
          accountId: account.id,
          accountName: account.name,
          exchange: account.exchange,
          ownerName: account.ownerName,
          volume: Number(volumeRow.total) || 0,
          profit: Number(profitRow.total) || 0,
          tradesCount: Number(tradesRow.count) || 0,
          activeOrders: Number(ordersRow.count) || 0,
        };
      })
    );
    res.json(result);
  } catch (err) {
    req.log.error(err, "Failed to get stats by account");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
