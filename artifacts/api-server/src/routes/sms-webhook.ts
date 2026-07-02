import { Router } from "express";
import { logger } from "../lib/logger";
import { releaseSingleOrder } from "../lib/scheduler";
import { getBybitPaidOrders } from "../lib/bybit";

const router = Router();

// ── In-memory лог входящих SMS (последние 50) ─────────────────────────────────
export interface SmsEvent {
  id: string;
  receivedAt: string;
  bank: string | null;
  sender: string | null;
  amount: number | null;
  currency: string;
  rawText: string;
  matched: boolean;
  matchedOrderId: string | null;
  released: boolean;
  releaseResult: string | null;
}

export const smsLog: SmsEvent[] = [];

// ── Парсеры банковских SMS ─────────────────────────────────────────────────────

function parseSmsAmount(text: string): number | null {
  // Bybit/MEXC/банки VND: ищем число типа 130,000 или 2.500.000 или 1500000
  const patterns = [
    /([0-9]{1,3}(?:[.,][0-9]{3})+)/g,   // 130,000 / 2.500.000
    /([0-9]{6,10})/g,                     // 1500000
  ];
  for (const pat of patterns) {
    const matches = [...text.matchAll(pat)];
    if (matches.length > 0) {
      for (const m of matches) {
        const raw = m[1].replace(/[,\.]/g, "");
        const n = parseInt(raw, 10);
        if (n >= 100_000 && n <= 999_999_999) return n; // фильтр: реалистичные суммы VND
      }
    }
  }
  return null;
}

function detectBank(text: string, sender: string | null): string | null {
  const t = (text + " " + (sender ?? "")).toLowerCase();
  if (t.includes("vietcombank") || t.includes("vcb")) return "Vietcombank";
  if (t.includes("vietinbank") || t.includes("vtb")) return "Vietinbank";
  if (t.includes("bidv")) return "BIDV";
  if (t.includes("techcombank") || t.includes("tcb")) return "Techcombank";
  if (t.includes("mbbank") || t.includes("mb bank")) return "MBBank";
  if (t.includes("acb")) return "ACB";
  return null;
}

// ── Матчинг суммы с оплаченным Bybit-ордером ──────────────────────────────────

async function findMatchingBybitOrder(amount: number): Promise<string | null> {
  const apiKey = process.env["BYBIT_API_KEY"];
  const apiSecret = process.env["BYBIT_API_SECRET"];
  if (!apiKey || !apiSecret) return null;

  try {
    const paidOrders = await getBybitPaidOrders(apiKey, apiSecret);
    const TOLERANCE = 0.02; // ±2%
    for (const order of paidOrders) {
      const orderAmt = parseFloat(String(order.amount ?? "0"));
      if (orderAmt > 0) {
        const diff = Math.abs(orderAmt - amount) / orderAmt;
        if (diff <= TOLERANCE) {
          return String(order.id ?? order.orderId ?? "");
        }
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "sms-webhook: failed to fetch paid orders for matching");
  }
  return null;
}

// ── Webhook endpoint ──────────────────────────────────────────────────────────
// MacroDroid POST сюда с любым из форматов:
//   { text: "...", sender: "...", amount: 130000 }
//   { sms: "...", from: "..." }
//   { body: "...", address: "..." }   (стандарт MacroDroid)
//   Или просто строка в теле

router.post("/sms/webhook", async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;

    // Если тело — plain text (Content-Type: text/plain), используем его напрямую
    const isPlainText = typeof req.body === "string";
    const body = isPlainText ? {} : (req.body as Record<string, unknown>);

    const rawText = String(
      (isPlainText ? req.body : undefined) ??
      body["text"] ?? body["sms"] ?? body["body"] ?? body["message"] ?? body["content"] ??
      query["text"] ?? query["sms"] ?? query["body"] ?? query["message"] ?? query["content"] ?? ""
    );
    const sender = String(
      body["sender"] ?? body["from"] ?? body["address"] ?? body["phone"] ??
      query["sender"] ?? query["from"] ?? query["address"] ?? query["phone"] ?? ""
    ) || null;

    const amount = body["amount"] != null
      ? Number(body["amount"])
      : parseSmsAmount(rawText);

    const bank = detectBank(rawText, sender);
    const id = `sms-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    logger.info({ sender, bank, amount, rawText: rawText.slice(0, 200) }, "SMS webhook received");

    const event: SmsEvent = {
      id,
      receivedAt: new Date().toISOString(),
      bank,
      sender,
      amount,
      currency: "VND",
      rawText: rawText.slice(0, 500),
      matched: false,
      matchedOrderId: null,
      released: false,
      releaseResult: null,
    };

    // Матчинг с ордером
    if (amount != null && amount > 0) {
      const orderId = await findMatchingBybitOrder(amount);
      if (orderId) {
        event.matched = true;
        event.matchedOrderId = orderId;

        // Авто-релиз
        const result = await releaseSingleOrder(orderId);
        event.released = result.success;
        event.releaseResult = result.message;
        logger.info({ orderId, released: result.success, msg: result.message }, "SMS webhook: auto-released order");
      } else {
        logger.info({ amount }, "SMS webhook: no matching paid order found");
      }
    }

    // Сохраняем в лог (последние 50)
    smsLog.unshift(event);
    if (smsLog.length > 50) smsLog.pop();

    res.json({
      ok: true,
      event: {
        id: event.id,
        bank: event.bank,
        amount: event.amount,
        matched: event.matched,
        matchedOrderId: event.matchedOrderId,
        released: event.released,
        releaseResult: event.releaseResult,
      },
    });
  } catch (err) {
    logger.error({ err }, "SMS webhook error");
    res.status(500).json({ error: "webhook error" });
  }
});

// ── GET лог SMS для фронтенда ─────────────────────────────────────────────────
router.get("/sms/log", (_req, res) => {
  res.json({ events: smsLog, count: smsLog.length });
});

// ── Тестовый endpoint (для проверки из браузера) ──────────────────────────────
router.get("/sms/webhook/test", (_req, res) => {
  res.json({ ok: true, message: "SMS webhook работает. Используйте POST /api/sms/webhook" });
});

export default router;
