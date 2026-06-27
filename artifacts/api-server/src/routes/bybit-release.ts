import { Router } from "express";
import { autoReleaseState, startAutoRelease, stopAutoRelease, runAutoRelease, releaseSingleOrder } from "../lib/scheduler";
import { db, tradesTable, accountsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

// ── Статус авто-выпуска ──────────────────────────────────────────────────────

router.get("/bybit/auto-release/status", (_req, res) => {
  res.json({
    enabled: autoReleaseState.enabled,
    running: autoReleaseState.running,
    lastCheckAt: autoReleaseState.lastCheckAt?.toISOString() ?? null,
    releasedCount: autoReleaseState.releasedCount,
    delayMs: autoReleaseState.delayMs,
    lastReleased: autoReleaseState.lastReleased.slice(0, 10).map(r => ({
      orderId: r.orderId,
      at: r.at.toISOString(),
    })),
  });
});

// ── Включить / выключить авто-выпуск ────────────────────────────────────────

router.post("/bybit/auto-release/enable", (req, res) => {
  const delayMs = Number(req.body?.delayMs ?? 0);
  startAutoRelease(delayMs);
  res.json({ success: true, enabled: true, delayMs, message: "Авто-выпуск включён" });
});

router.post("/bybit/auto-release/disable", (_req, res) => {
  stopAutoRelease();
  res.json({ success: true, enabled: false, message: "Авто-выпуск выключен" });
});

// ── Запустить проверку прямо сейчас ─────────────────────────────────────────

router.post("/bybit/auto-release/check-now", async (req, res) => {
  try {
    await runAutoRelease();
    res.json({
      success: true,
      releasedCount: autoReleaseState.releasedCount,
      lastCheckAt: autoReleaseState.lastCheckAt?.toISOString() ?? null,
      lastReleased: autoReleaseState.lastReleased.slice(0, 5),
    });
  } catch (err) {
    req.log.error(err, "check-now failed");
    res.status(500).json({ error: "Ошибка проверки" });
  }
});

// ── Выпустить конкретный ордер вручную ───────────────────────────────────────

router.post("/bybit/release/:orderId", async (req, res) => {
  const { orderId } = req.params;
  if (!orderId) { res.status(400).json({ error: "orderId обязателен" }); return; }
  try {
    const result = await releaseSingleOrder(orderId);
    res.json(result);
  } catch (err) {
    req.log.error(err, "manual release failed");
    res.status(500).json({ error: "Ошибка выпуска ордера" });
  }
});

// ── Bybit P2P сделки из БД (для секции мерчантов) ───────────────────────────

router.get("/bybit/ads", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query["limit"] ?? 50), 200);

    // Find all Bybit accounts
    const bybitAccounts = await db
      .select({ id: accountsTable.id, name: accountsTable.name })
      .from(accountsTable)
      .where(eq(accountsTable.exchange, "bybit"));

    if (bybitAccounts.length === 0) {
      res.json({ ads: [], count: 0, total: 0, note: "Нет аккаунтов Bybit в БД" });
      return;
    }

    const accountIds = bybitAccounts.map(a => a.id);

    // Fetch latest trades for Bybit accounts
    const rows = await db
      .select({
        id: tradesTable.id,
        side: tradesTable.side,
        asset: tradesTable.asset,
        fiatCurrency: tradesTable.fiatCurrency,
        amount: tradesTable.amount,
        price: tradesTable.price,
        fiatAmount: tradesTable.fiatAmount,
        status: tradesTable.status,
        counterpartyName: tradesTable.counterpartyName,
        paymentMethod: tradesTable.paymentMethod,
        exchangeTradeId: tradesTable.exchangeTradeId,
        createdAt: tradesTable.createdAt,
        accountId: tradesTable.accountId,
      })
      .from(tradesTable)
      .where(eq(tradesTable.accountId, accountIds[0]))
      .orderBy(desc(tradesTable.createdAt))
      .limit(limit);

    res.json({ ads: rows, count: rows.length, total: rows.length });
  } catch (err) {
    req.log.error(err, "bybit/ads failed");
    res.status(500).json({ error: "Ошибка получения сделок Bybit" });
  }
});

// ── Webhook от Bybit (push-уведомление) ─────────────────────────────────────
// Bybit отправит POST сюда когда покупатель оплатил ордер.
// URL для настройки в Bybit: https://<ваш-домен>/api/bybit/webhook

router.post("/bybit/webhook", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    req.log.info({ body }, "Bybit webhook received");

    // Bybit P2P webhook payload format:
    // { topic: "order", data: { orderId: "...", status: 20, ... } }
    // or: { orderNo: "...", status: 20 }
    const data = (body.data ?? body) as Record<string, unknown>;
    const orderId = String(data.orderId ?? data.orderNo ?? data.order_id ?? "");
    const status = Number(data.status ?? data.orderStatus ?? 0);

    req.log.info({ orderId, status }, "Bybit webhook: parsed");

    // status 20 = paid → release
    if (orderId && (status === 20 || String(data.event) === "paid")) {
      if (autoReleaseState.enabled) {
        const result = await releaseSingleOrder(orderId);
        req.log.info({ orderId, result }, "Bybit webhook: auto-released");
        res.json({ received: true, released: result.success, message: result.message });
        return;
      }
    }

    res.json({ received: true, released: false, reason: autoReleaseState.enabled ? "status не paid" : "авто-выпуск выключен" });
  } catch (err) {
    req.log.error(err, "Bybit webhook error");
    res.status(500).json({ error: "webhook error" });
  }
});

export default router;
