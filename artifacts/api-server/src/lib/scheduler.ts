import { logger } from "./logger";
import { getMexcC2COrdersWeb, mapMexcStatusToInternal, mapMexcTradeType, type MexcC2CWebOrder } from "./mexc";
import { db, tradesTable, accountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 час

export interface SyncState {
  lastSyncAt: Date | null;
  lastSyncResult: {
    success: boolean;
    imported: number;
    skipped: number;
    totalFetched: number;
    message: string;
  } | null;
  nextSyncAt: Date | null;
  running: boolean;
}

export const syncState: SyncState = {
  lastSyncAt: null,
  lastSyncResult: null,
  nextSyncAt: null,
  running: false,
};

function parseNum(v: string | number | undefined): number {
  if (v === undefined || v === null) return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function normalizeOrder(o: MexcC2CWebOrder) {
  const asset = (o.coin ?? o.asset ?? "USDT").toUpperCase();
  const fiat = (o.fiatCurrency ?? o.fiat ?? "VND").toUpperCase();
  const amount = parseNum(o.amount);
  const price = parseNum(o.price);
  const totalPrice = parseNum(o.totalPrice ?? o.orderTotalPrice ?? String(amount * price));
  const completeTs = o.completedTime ?? o.completeTime ?? o.finishTime ?? null;
  const counterparty = o.advertiserNickName ?? o.counterpartNickName ?? null;
  return { asset, fiat, amount, price, totalPrice, completeTs, counterparty };
}

export async function runMexcSync(webToken: string): Promise<typeof syncState.lastSyncResult> {
  if (syncState.running) {
    logger.info("MEXC auto-sync: already running, skipping");
    return syncState.lastSyncResult;
  }

  syncState.running = true;
  logger.info("MEXC auto-sync: starting");

  try {
    let accId: number | null = null;
    const accounts = await db.select().from(accountsTable).where(eq(accountsTable.exchange, "mexc")).limit(1);
    if (accounts.length > 0) {
      accId = accounts[0].id;
    } else {
      const [newAcc] = await db.insert(accountsTable).values({
        name: "MEXC C2C (авто)",
        exchange: "mexc",
        ownerName: "MEXC",
        bankName: "",
        apiKey: webToken.trim(),
        apiSecret: null,
      }).returning();
      accId = newAcc.id;
    }

    const PAGE_SIZE = 50;
    let pageNum = 1;
    let totalFetched = 0;
    let imported = 0;
    let skipped = 0;
    let keepGoing = true;

    while (keepGoing) {
      const result = await getMexcC2COrdersWeb(webToken.trim(), { pageNum, pageSize: PAGE_SIZE });

      if (!result.orders || result.orders.length === 0) {
        keepGoing = false;
        break;
      }

      totalFetched += result.orders.length;

      for (const order of result.orders) {
        try {
          const externalId = String(order.orderId);
          if (externalId) {
            const existing = await db
              .select({ id: tradesTable.id })
              .from(tradesTable)
              .where(eq(tradesTable.exchangeTradeId, externalId))
              .limit(1);
            if (existing.length > 0) { skipped++; continue; }
          }

          const { asset, fiat, amount, price, totalPrice, completeTs, counterparty } = normalizeOrder(order);
          const side = mapMexcTradeType(order.tradeType);
          const status = mapMexcStatusToInternal(order.orderStatus);
          const createdAt = order.createTime ? new Date(order.createTime) : new Date();
          const completedAt = completeTs ? new Date(completeTs) : null;

          await db.insert(tradesTable).values({
            accountId: accId!,
            exchangeTradeId: externalId || null,
            side,
            asset,
            fiatCurrency: fiat,
            amount,
            price,
            fiatAmount: totalPrice,
            status,
            counterpartyName: counterparty,
            paymentMethod: order.paymentMethod ?? null,
            createdAt,
            completedAt: status === "completed" ? (completedAt ?? createdAt) : null,
          });
          imported++;
        } catch (err) {
          logger.warn({ err, orderId: order.orderId }, "Failed to insert C2C order");
        }
      }

      if (result.orders.length < PAGE_SIZE) {
        keepGoing = false;
      } else {
        pageNum++;
        if (pageNum > 100) keepGoing = false;
      }
    }

    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tradesTable)
      .where(eq(tradesTable.accountId, accId!));
    await db.update(accountsTable)
      .set({ completedTrades: Number(countRow.count), updatedAt: new Date() })
      .where(eq(accountsTable.id, accId!));

    const result = {
      success: true,
      imported,
      skipped,
      totalFetched,
      message: `Найдено: ${totalFetched}, импортировано: ${imported}, дублей: ${skipped}`,
    };

    syncState.lastSyncAt = new Date();
    syncState.lastSyncResult = result;
    logger.info({ imported, skipped, totalFetched }, "MEXC auto-sync: completed");
    return result;
  } catch (err) {
    logger.error({ err }, "MEXC auto-sync: failed");
    const result = {
      success: false,
      imported: 0,
      skipped: 0,
      totalFetched: 0,
      message: `Ошибка: ${(err as Error).message}`,
    };
    syncState.lastSyncAt = new Date();
    syncState.lastSyncResult = result;
    return result;
  } finally {
    syncState.running = false;
  }
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSync(): void {
  const token = process.env["MEXC_WEB_TOKEN"];
  if (!token) {
    logger.warn("MEXC_WEB_TOKEN not set — auto-sync disabled");
    return;
  }

  logger.info({ intervalMs: SYNC_INTERVAL_MS }, "MEXC auto-sync: scheduler started");

  // первый запуск сразу
  runMexcSync(token).catch((err) => logger.error({ err }, "MEXC initial sync failed"));

  syncInterval = setInterval(() => {
    const t = process.env["MEXC_WEB_TOKEN"];
    if (!t) return;
    runMexcSync(t).catch((err) => logger.error({ err }, "MEXC periodic sync failed"));
  }, SYNC_INTERVAL_MS);

  syncState.nextSyncAt = new Date(Date.now() + SYNC_INTERVAL_MS);
}

export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
