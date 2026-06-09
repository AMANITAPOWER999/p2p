import { Router } from "express";
import { db, tradesTable, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { syncState, runMexcSync, runBybitSync } from "../lib/scheduler";

const router = Router();

// ── Статус обоих бирж ────────────────────────────────────────────────────────

router.get("/mexc/sync-status", (_req, res) => {
  res.json({
    mexc: {
      enabled: syncState.mexc.enabled,
      running: syncState.mexc.running,
      lastSyncAt: syncState.mexc.lastSyncAt?.toISOString() ?? null,
      lastResult: syncState.mexc.lastResult,
    },
    bybit: {
      enabled: syncState.bybit.enabled,
      running: syncState.bybit.running,
      lastSyncAt: syncState.bybit.lastSyncAt?.toISOString() ?? null,
      lastResult: syncState.bybit.lastResult,
    },
    nextSyncAt: syncState.nextSyncAt
      ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
      : null,
  });
});

// ── Ручной запуск MEXC ───────────────────────────────────────────────────────

router.post("/mexc/sync-now", async (req, res) => {
  const token = (req.body?.webToken as string | undefined)?.trim() || process.env["MEXC_WEB_TOKEN"];
  if (!token) { res.status(400).json({ error: "Токен не задан" }); return; }
  if (syncState.mexc.running) { res.status(409).json({ error: "Синхронизация уже запущена", running: true }); return; }
  try {
    const result = await runMexcSync(token);
    res.json({ success: true, ...result });
  } catch (err) {
    req.log.error(err, "mexc sync-now failed");
    res.status(500).json({ error: "Ошибка синхронизации" });
  }
});

// ── Ручной запуск Bybit ──────────────────────────────────────────────────────

router.post("/bybit/sync-now", async (req, res) => {
  const apiKey = (req.body?.apiKey as string | undefined)?.trim() || process.env["BYBIT_API_KEY"];
  const apiSecret = (req.body?.apiSecret as string | undefined)?.trim() || process.env["BYBIT_API_SECRET"];
  if (!apiKey || !apiSecret) { res.status(400).json({ error: "BYBIT_API_KEY и BYBIT_API_SECRET не заданы" }); return; }
  if (syncState.bybit.running) { res.status(409).json({ error: "Bybit синхронизация уже запущена", running: true }); return; }
  try {
    const result = await runBybitSync(apiKey, apiSecret);
    res.json({ success: true, ...result });
  } catch (err) {
    req.log.error(err, "bybit sync-now failed");
    res.status(500).json({ error: "Ошибка Bybit синхронизации" });
  }
});

// ── Экспорт CSV/JSON ──────────────────────────────────────────────────────────

router.get("/mexc/c2c-export", async (req, res) => {
  try {
    const accountId = req.query.accountId ? Number(req.query.accountId) : undefined;
    const exchange = req.query.exchange as string | undefined;

    let query = db
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
      .$dynamic();

    if (accountId) {
      query = query.where(eq(tradesTable.accountId, accountId));
    } else if (exchange) {
      const accounts = await db.select({ id: accountsTable.id })
        .from(accountsTable)
        .where(eq(accountsTable.exchange, exchange));
      const ids = accounts.map(a => a.id);
      if (ids.length > 0) {
        query = query.where(eq(tradesTable.accountId, ids[0]));
      }
    }

    const trades = await query.orderBy(tradesTable.createdAt);

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
      res.setHeader("Content-Disposition", `attachment; filename="trades_${exchange ?? "all"}_${Date.now()}.csv"`);
      res.send([header, ...rows].join("\n"));
      return;
    }

    res.json({ trades, total: trades.length });
  } catch (err) {
    req.log.error(err, "Export failed");
    res.status(500).json({ error: "Ошибка экспорта" });
  }
});

export default router;
