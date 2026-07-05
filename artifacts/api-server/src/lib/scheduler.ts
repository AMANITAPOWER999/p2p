import { logger } from "./logger";
import { getMexcC2COrdersWeb, mapMexcStatusToInternal, mapMexcTradeType, type MexcC2CWebOrder } from "./mexc";
import { getBybitP2POrders, getBybitPaidOrders, releaseBybitOrder, mapBybitStatus, mapBybitSide, type BybitP2POrder } from "./bybit";
import { getOkxPaidOrders, releaseOkxOrder } from "./okx";
import { getGatePaidOrders, releaseGateOrder } from "./gate";
import { db, tradesTable, accountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 час

export interface ExchangeSyncResult {
  success: boolean;
  imported: number;
  skipped: number;
  totalFetched: number;
  message: string;
  rawSample?: unknown;
}

export interface SyncState {
  mexc: {
    running: boolean;
    lastSyncAt: Date | null;
    lastResult: ExchangeSyncResult | null;
    enabled: boolean;
  };
  bybit: {
    running: boolean;
    lastSyncAt: Date | null;
    lastResult: ExchangeSyncResult | null;
    enabled: boolean;
  };
  nextSyncAt: Date | null;
}

export const syncState: SyncState = {
  mexc: { running: false, lastSyncAt: null, lastResult: null, enabled: false },
  bybit: { running: false, lastSyncAt: null, lastResult: null, enabled: false },
  nextSyncAt: null,
};

function parseNum(v: string | number | undefined): number {
  if (v === undefined || v === null) return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

async function getOrCreateAccount(exchange: "mexc" | "bybit", apiKey?: string): Promise<number> {
  const existing = await db.select().from(accountsTable).where(eq(accountsTable.exchange, exchange)).limit(1);
  if (existing.length > 0) return existing[0].id;

  const [newAcc] = await db.insert(accountsTable).values({
    name: exchange === "mexc" ? "MEXC C2C (авто)" : "Bybit P2P (авто)",
    exchange,
    ownerName: exchange === "mexc" ? "MEXC" : "Bybit",
    bankName: "",
    apiKey: apiKey ?? null,
    apiSecret: null,
  }).returning();
  return newAcc.id;
}

// ─── MEXC ────────────────────────────────────────────────────────────────────

export async function runMexcSync(webToken: string): Promise<ExchangeSyncResult> {
  if (syncState.mexc.running) return syncState.mexc.lastResult ?? { success: false, imported: 0, skipped: 0, totalFetched: 0, message: "уже запущено" };
  syncState.mexc.running = true;
  logger.info("MEXC auto-sync: starting");

  try {
    const accId = await getOrCreateAccount("mexc", webToken.trim());
    const PAGE_SIZE = 50;
    let pageNum = 1, totalFetched = 0, imported = 0, skipped = 0, keepGoing = true;
    let rawSample: unknown = null;

    while (keepGoing) {
      const result = await getMexcC2COrdersWeb(webToken.trim(), { pageNum, pageSize: PAGE_SIZE });
      if (pageNum === 1) rawSample = result.rawResponse;
      if (!result.orders?.length) break;

      totalFetched += result.orders.length;
      for (const order of result.orders) {
        const { didImport } = await insertMexcOrder(accId, order);
        didImport ? imported++ : skipped++;
      }
      keepGoing = result.orders.length >= PAGE_SIZE && pageNum < 100;
      pageNum++;
    }

    await refreshAccountStats(accId);
    const res: ExchangeSyncResult = {
      success: true, imported, skipped, totalFetched,
      message: `Найдено: ${totalFetched}, импортировано: ${imported}, дублей: ${skipped}`,
      ...(totalFetched === 0 ? { rawSample } : {}),
    };
    syncState.mexc.lastSyncAt = new Date();
    syncState.mexc.lastResult = res;
    logger.info({ imported, skipped, totalFetched }, "MEXC auto-sync: completed");
    return res;
  } catch (err) {
    logger.error({ err }, "MEXC auto-sync: failed");
    const res: ExchangeSyncResult = { success: false, imported: 0, skipped: 0, totalFetched: 0, message: `Ошибка: ${(err as Error).message}` };
    syncState.mexc.lastSyncAt = new Date();
    syncState.mexc.lastResult = res;
    return res;
  } finally {
    syncState.mexc.running = false;
  }
}

async function insertMexcOrder(accId: number, order: MexcC2CWebOrder): Promise<{ didImport: boolean }> {
  const externalId = String(order.orderId);
  if (externalId) {
    const existing = await db.select({ id: tradesTable.id }).from(tradesTable).where(eq(tradesTable.exchangeTradeId, externalId)).limit(1);
    if (existing.length > 0) return { didImport: false };
  }
  const asset = (order.coin ?? order.asset ?? "USDT").toUpperCase();
  const fiat = (order.fiatCurrency ?? order.fiat ?? "VND").toUpperCase();
  const amount = parseNum(order.amount);
  const price = parseNum(order.price);
  const totalPrice = parseNum(order.totalPrice ?? order.orderTotalPrice ?? String(amount * price));
  const completeTs = order.completedTime ?? order.completeTime ?? order.finishTime ?? null;
  const counterparty = order.advertiserNickName ?? order.counterpartNickName ?? null;
  const side = mapMexcTradeType(order.tradeType);
  const status = mapMexcStatusToInternal(order.orderStatus);
  const createdAt = order.createTime ? new Date(order.createTime) : new Date();
  const completedAt = completeTs ? new Date(completeTs) : null;

  await db.insert(tradesTable).values({
    accountId: accId,
    exchangeTradeId: externalId || null,
    side, asset, fiatCurrency: fiat, amount, price, fiatAmount: totalPrice,
    status, counterpartyName: counterparty, paymentMethod: order.paymentMethod ?? null,
    createdAt, completedAt: status === "completed" ? (completedAt ?? createdAt) : null,
  });
  return { didImport: true };
}

// ─── BYBIT ───────────────────────────────────────────────────────────────────

export async function runBybitSync(apiKey: string, apiSecret: string): Promise<ExchangeSyncResult> {
  if (syncState.bybit.running) return syncState.bybit.lastResult ?? { success: false, imported: 0, skipped: 0, totalFetched: 0, message: "уже запущено" };
  syncState.bybit.running = true;
  logger.info("Bybit auto-sync: starting");

  try {
    const accId = await getOrCreateAccount("bybit", apiKey);
    const PAGE_SIZE = 20;
    let page = 1, totalFetched = 0, imported = 0, skipped = 0, keepGoing = true;
    let rawSample: unknown = null;

    while (keepGoing) {
      const result = await getBybitP2POrders(apiKey, apiSecret, { page, size: PAGE_SIZE });
      if (page === 1) rawSample = result.rawResponse;
      if (!result.orders?.length) break;

      totalFetched += result.orders.length;
      for (const order of result.orders) {
        const { didImport } = await insertBybitOrder(accId, order);
        didImport ? imported++ : skipped++;
      }
      keepGoing = result.orders.length >= PAGE_SIZE && page < 100;
      page++;
    }

    await refreshAccountStats(accId);
    const res: ExchangeSyncResult = {
      success: true, imported, skipped, totalFetched,
      message: `Найдено: ${totalFetched}, импортировано: ${imported}, дублей: ${skipped}`,
      ...(totalFetched === 0 ? { rawSample } : {}),
    };
    syncState.bybit.lastSyncAt = new Date();
    syncState.bybit.lastResult = res;
    logger.info({ imported, skipped, totalFetched }, "Bybit auto-sync: completed");
    return res;
  } catch (err) {
    logger.error({ err }, "Bybit auto-sync: failed");
    const res: ExchangeSyncResult = { success: false, imported: 0, skipped: 0, totalFetched: 0, message: `Ошибка: ${(err as Error).message}` };
    syncState.bybit.lastSyncAt = new Date();
    syncState.bybit.lastResult = res;
    return res;
  } finally {
    syncState.bybit.running = false;
  }
}

function parseBybitDate(v: string | number | null | undefined): Date | null {
  if (!v) return null;
  const ms = Number(v);
  if (!isNaN(ms) && ms > 0) return new Date(ms);
  return null;
}

async function insertBybitOrder(accId: number, order: BybitP2POrder): Promise<{ didImport: boolean }> {
  // simplifyList uses "id"; full list uses "orderId"
  const externalId = String(order.id ?? order.orderId ?? "");
  if (externalId) {
    const existing = await db.select({ id: tradesTable.id }).from(tradesTable).where(eq(tradesTable.exchangeTradeId, externalId)).limit(1);
    if (existing.length > 0) return { didImport: false };
  }
  const asset = ((order.notifyTokenId ?? order.tokenId) ?? "USDT").toUpperCase();
  const fiat = (order.currencyId ?? "USD").toUpperCase();
  // simplifyList: notifyTokenQuantity = crypto qty, amount = fiat amount
  const amount = parseNum(order.notifyTokenQuantity ?? order.quantity ?? "0");
  const price = parseNum(order.price);
  const fiatAmount = parseNum(order.amount);
  const side = mapBybitSide(order.side);
  // simplifyList uses "status"; full list uses "orderStatus"
  const statusCode = order.status ?? order.orderStatus ?? 0;
  const status = mapBybitStatus(statusCode);
  const createdAt = parseBybitDate(order.createDate) ?? new Date();
  const completedAt = parseBybitDate(order.finishDate ?? null);
  const counterparty = order.targetNickName ?? order.nickName ?? (order.paymentInfo?.[0]?.realName) ?? null;

  await db.insert(tradesTable).values({
    accountId: accId,
    exchangeTradeId: externalId || null,
    side, asset, fiatCurrency: fiat, amount, price, fiatAmount,
    status, counterpartyName: counterparty, paymentMethod: null,
    createdAt, completedAt: status === "completed" ? (completedAt ?? createdAt) : null,
  });
  return { didImport: true };
}

// ─── Shared ───────────────────────────────────────────────────────────────────

async function refreshAccountStats(accId: number) {
  const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(tradesTable).where(eq(tradesTable.accountId, accId));
  await db.update(accountsTable).set({ completedTrades: Number(countRow.count), updatedAt: new Date() }).where(eq(accountsTable.id, accId));
}

// ─── Auto-release state ───────────────────────────────────────────────────────

const AUTO_RELEASE_INTERVAL_MS = 2 * 60 * 1000; // 2 минуты

export interface AutoReleaseState {
  enabled: boolean;
  running: boolean;
  lastCheckAt: Date | null;
  releasedCount: number;
  lastReleased: Array<{ orderId: string; at: Date }>;
  delayMs: number; // задержка перед выпуском (мс)
}

export const autoReleaseState: AutoReleaseState = {
  enabled: false,
  running: false,
  lastCheckAt: null,
  releasedCount: 0,
  lastReleased: [],
  delayMs: 0,
};

// Множество уже обработанных orderId (чтобы не дублировать)
const releasedOrderIds = new Set<string>();

async function releaseExchangeOrder(exchange: string, orderId: string): Promise<boolean> {
  try {
    let result: { success: boolean; message: string };
    if (exchange === "bybit") {
      const k = process.env["BYBIT_API_KEY"]!;
      const s = process.env["BYBIT_API_SECRET"]!;
      result = await releaseBybitOrder(k, s, orderId);
    } else if (exchange === "okx") {
      const k = process.env["OKX_API_KEY"]!;
      const s = process.env["OKX_API"]!;
      const p = process.env["OKX_PASSPHRASE"] ?? "";
      result = await releaseOkxOrder(k, s, p, orderId);
    } else if (exchange === "gate") {
      const k = process.env["GATE_API_KEY"]!;
      const s = process.env["GATE_API"]!;
      result = await releaseGateOrder(k, s, orderId);
    } else {
      return false;
    }
    logger.info({ exchange, orderId, success: result.success, msg: result.message }, "Auto-release: released order");
    return result.success;
  } catch (err) {
    logger.warn({ err, exchange, orderId }, "Auto-release: release error");
    return false;
  }
}

export async function runAutoRelease(): Promise<void> {
  if (autoReleaseState.running) return;
  autoReleaseState.running = true;
  autoReleaseState.lastCheckAt = new Date();

  try {
    const tasks: Array<{ exchange: string; orderId: string }> = [];

    // Bybit
    const bybitKey = process.env["BYBIT_API_KEY"];
    const bybitSecret = process.env["BYBIT_API_SECRET"];
    if (bybitKey && bybitSecret) {
      const paidOrders = await getBybitPaidOrders(bybitKey, bybitSecret);
      for (const o of paidOrders) {
        const id = String(o.id ?? o.orderId ?? "");
        if (id) tasks.push({ exchange: "bybit", orderId: id });
      }
    }

    // OKX
    const okxKey = process.env["OKX_API_KEY"];
    const okxSecret = process.env["OKX_API"];
    const okxPass = process.env["OKX_PASSPHRASE"] ?? "";
    if (okxKey && okxSecret) {
      const paidOrders = await getOkxPaidOrders(okxKey, okxSecret, okxPass);
      for (const o of paidOrders) tasks.push({ exchange: "okx", orderId: o.ordId });
    }

    // Gate
    const gateKey = process.env["GATE_API_KEY"];
    const gateSecret = process.env["GATE_API"];
    if (gateKey && gateSecret) {
      const paidOrders = await getGatePaidOrders(gateKey, gateSecret);
      for (const o of paidOrders) tasks.push({ exchange: "gate", orderId: o.id });
    }

    logger.info({ paidCount: tasks.length }, "Auto-release: checked paid orders across exchanges");

    for (const { exchange, orderId } of tasks) {
      const key = `${exchange}:${orderId}`;
      if (!orderId || releasedOrderIds.has(key)) continue;
      releasedOrderIds.add(key);

      if (autoReleaseState.delayMs > 0) {
        await new Promise(r => setTimeout(r, autoReleaseState.delayMs));
      }

      const success = await releaseExchangeOrder(exchange, orderId);

      if (success) {
        autoReleaseState.releasedCount++;
        autoReleaseState.lastReleased.unshift({ orderId: `${exchange}:${orderId}`, at: new Date() });
        if (autoReleaseState.lastReleased.length > 20) autoReleaseState.lastReleased.pop();
        await db.update(tradesTable)
          .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
          .where(eq(tradesTable.exchangeTradeId, orderId));
      } else {
        releasedOrderIds.delete(key);
      }
    }
  } catch (err) {
    logger.error({ err }, "Auto-release: check failed");
  } finally {
    autoReleaseState.running = false;
  }
}

export async function releaseSingleOrder(orderId: string): Promise<{ success: boolean; message: string }> {
  const apiKey = process.env["BYBIT_API_KEY"];
  const apiSecret = process.env["BYBIT_API_SECRET"];
  if (!apiKey || !apiSecret) return { success: false, message: "Ключи Bybit не настроены" };

  const result = await releaseBybitOrder(apiKey, apiSecret, orderId);
  if (result.success) {
    releasedOrderIds.add(orderId);
    autoReleaseState.releasedCount++;
    autoReleaseState.lastReleased.unshift({ orderId, at: new Date() });
    if (autoReleaseState.lastReleased.length > 20) autoReleaseState.lastReleased.pop();

    await db.update(tradesTable)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(tradesTable.exchangeTradeId, orderId));
  }
  return { success: result.success, message: result.message };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let syncInterval: ReturnType<typeof setInterval> | null = null;
let releaseInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSync(): void {
  const mexcToken = process.env["MEXC_WEB_TOKEN"];
  const bybitKey = process.env["BYBIT_API_KEY"];
  const bybitSecret = process.env["BYBIT_API_SECRET"];

  syncState.mexc.enabled = !!mexcToken;
  syncState.bybit.enabled = !!(bybitKey && bybitSecret);

  if (!syncState.mexc.enabled && !syncState.bybit.enabled) {
    logger.warn("No exchange credentials set — auto-sync disabled");
    return;
  }

  logger.info({ mexc: syncState.mexc.enabled, bybit: syncState.bybit.enabled, intervalMs: SYNC_INTERVAL_MS }, "Auto-sync: scheduler started");

  const runAll = () => {
    if (syncState.mexc.enabled) {
      const t = process.env["MEXC_WEB_TOKEN"]!;
      runMexcSync(t).catch(err => logger.error({ err }, "MEXC periodic sync failed"));
    }
    if (syncState.bybit.enabled) {
      const k = process.env["BYBIT_API_KEY"]!;
      const s = process.env["BYBIT_API_SECRET"]!;
      runBybitSync(k, s).catch(err => logger.error({ err }, "Bybit periodic sync failed"));
    }
  };

  // Первый запуск сразу
  runAll();

  syncInterval = setInterval(runAll, SYNC_INTERVAL_MS);
  syncState.nextSyncAt = new Date(Date.now() + SYNC_INTERVAL_MS);
}

export function stopAutoSync(): void {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
}

export function startAutoRelease(delayMs = 0): void {
  autoReleaseState.enabled = true;
  autoReleaseState.delayMs = delayMs;

  if (releaseInterval) clearInterval(releaseInterval);
  releaseInterval = setInterval(() => {
    runAutoRelease().catch(err => logger.error({ err }, "Auto-release interval failed"));
  }, AUTO_RELEASE_INTERVAL_MS);

  // Первая проверка через 10 секунд
  setTimeout(() => runAutoRelease().catch(() => {}), 10_000);
  logger.info({ delayMs, intervalMs: AUTO_RELEASE_INTERVAL_MS }, "Auto-release: started");
}

export function stopAutoRelease(): void {
  autoReleaseState.enabled = false;
  if (releaseInterval) { clearInterval(releaseInterval); releaseInterval = null; }
  logger.info("Auto-release: stopped");
}
