import { Router } from "express";
import { db, tradesTable, accountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getMexcC2COrdersWeb, mapMexcStatusToInternal, mapMexcTradeType, type MexcC2CWebOrder } from "../lib/mexc";

const router = Router();

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

router.post("/mexc/c2c-sync", async (req, res) => {
  try {
    const { webToken, accountId } = req.body as { webToken?: string; accountId?: number };

    if (!webToken || typeof webToken !== "string" || webToken.trim().length < 10) {
      res.status(400).json({ error: "webToken обязателен" });
      return;
    }

    let accId: number | null = accountId ?? null;

    if (!accId) {
      const accounts = await db.select().from(accountsTable).where(eq(accountsTable.exchange, "mexc")).limit(1);
      if (accounts.length > 0) {
        accId = accounts[0].id;
      } else {
        const [newAcc] = await db.insert(accountsTable).values({
          name: "MEXC C2C (авто)",
          exchange: "mexc",
          ownerName: null,
          bankName: null,
          apiKey: webToken.trim(),
          apiSecret: null,
        }).returning();
        accId = newAcc.id;
      }
    }

    const PAGE_SIZE = 50;
    let pageNum = 1;
    let totalFetched = 0;
    let imported = 0;
    let skipped = 0;
    let keepGoing = true;
    const errors: string[] = [];
    let rawSample: unknown = null;

    while (keepGoing) {
      const result = await getMexcC2COrdersWeb(webToken.trim(), { pageNum, pageSize: PAGE_SIZE });

      if (pageNum === 1) {
        rawSample = result.rawResponse;
      }

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
        } catch (rowErr) {
          errors.push(`Order ${order.orderId}: ${(rowErr as Error).message}`);
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

    res.json({
      success: true,
      accountId: accId,
      pagesScanned: pageNum,
      totalFetched,
      imported,
      skipped,
      errors: errors.slice(0, 10),
      message: `Загружено страниц: ${pageNum}. Найдено: ${totalFetched}. Импортировано: ${imported}, пропущено дубликатов: ${skipped}.`,
      ...(totalFetched === 0 ? { rawSample } : {}),
    });
  } catch (err) {
    req.log.error(err, "MEXC C2C sync failed");
    res.status(500).json({ error: "Ошибка синхронизации MEXC C2C" });
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
