import { Router } from "express";
import { db, tradesTable, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { syncState, runMexcSync } from "../lib/scheduler";

const router = Router();

router.get("/mexc/sync-status", (_req, res) => {
  const token = process.env["MEXC_WEB_TOKEN"];
  res.json({
    autoSyncEnabled: !!token,
    running: syncState.running,
    lastSyncAt: syncState.lastSyncAt?.toISOString() ?? null,
    nextSyncAt: syncState.nextSyncAt
      ? new Date(syncState.lastSyncAt
          ? syncState.lastSyncAt.getTime() + 60 * 60 * 1000
          : Date.now() + 60 * 60 * 1000).toISOString()
      : null,
    lastSyncResult: syncState.lastSyncResult,
  });
});

router.post("/mexc/sync-now", async (req, res) => {
  const token = (req.body?.webToken as string | undefined)?.trim() || process.env["MEXC_WEB_TOKEN"];
  if (!token) {
    res.status(400).json({ error: "Токен не задан. Укажите MEXC_WEB_TOKEN или передайте webToken в теле запроса." });
    return;
  }
  if (syncState.running) {
    res.status(409).json({ error: "Синхронизация уже запущена", running: true });
    return;
  }
  try {
    const result = await runMexcSync(token);
    res.json({ success: true, ...result });
  } catch (err) {
    req.log.error(err, "mexc sync-now failed");
    res.status(500).json({ error: "Ошибка синхронизации" });
  }
});

router.get("/mexc/c2c-export", async (req, res) => {
  try {
    const accountId = req.query.accountId ? Number(req.query.accountId) : undefined;

    const trades = await db
      .select({
        id: tradesTable.id,
        exchangeTradeId: tradesTable.exchangeTradeId,
        side: tradesTable.side,
        asset: tradesTable.asset,
        fiatCurrency: tradesTable.fiatCurrency,
        amount: tradesTable.amount,
        price: tradesTable.price,
        fiatAmount: tradesTable.fiatAmount,
        status: tradesTable.status,
        counterpartyName: tradesTable.counterpartyName,
        paymentMethod: tradesTable.paymentMethod,
        createdAt: tradesTable.createdAt,
        completedAt: tradesTable.completedAt,
      })
      .from(tradesTable)
      .where(accountId ? eq(tradesTable.accountId, accountId) : undefined as never)
      .orderBy(tradesTable.createdAt);

    if (req.query.format === "csv") {
      const header = "ID,ExchangeTradeId,Side,Asset,FiatCurrency,Amount,Price,FiatAmount,Status,Counterparty,PaymentMethod,CreatedAt,CompletedAt";
      const rows = trades.map(t =>
        [
          t.id,
          t.exchangeTradeId ?? "",
          t.side,
          t.asset,
          t.fiatCurrency,
          t.amount,
          t.price ?? "",
          t.fiatAmount,
          t.status,
          `"${(t.counterpartyName ?? "").replace(/"/g, '""')}"`,
          `"${(t.paymentMethod ?? "").replace(/"/g, '""')}"`,
          t.createdAt ? new Date(t.createdAt).toISOString() : "",
          t.completedAt ? new Date(t.completedAt).toISOString() : "",
        ].join(",")
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="mexc_trades_${Date.now()}.csv"`);
      res.send([header, ...rows].join("\n"));
      return;
    }

    res.json({ trades, total: trades.length });
  } catch (err) {
    req.log.error(err, "MEXC export failed");
    res.status(500).json({ error: "Ошибка экспорта" });
  }
});

export default router;
