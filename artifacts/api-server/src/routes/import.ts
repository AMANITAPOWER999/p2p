import { Router } from "express";
import { db, tradesTable, accountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

// MEXC C2C CSV columns (flexible matching)
const SIDE_MAP: Record<string, "buy" | "sell"> = {
  buy: "buy", sell: "sell", покупка: "buy", продажа: "sell",
  "0": "buy", "1": "sell", beli: "buy", jual: "sell",
};

const STATUS_MAP: Record<string, "pending" | "paid" | "completed" | "cancelled" | "disputed"> = {
  completed: "completed", finished: "completed", success: "completed",
  cancelled: "cancelled", canceled: "cancelled",
  paid: "paid", appeal: "disputed", disputed: "disputed",
  pending: "pending",
};

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[\s_\-()]/g, "");
}

function findCol(headers: string[], candidates: string[]): number {
  const norm = headers.map(normalizeKey);
  for (const c of candidates) {
    const idx = norm.indexOf(normalizeKey(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v.replace(/\//g, "-"));
  return isNaN(d.getTime()) ? null : d;
}

function parseNum(v: string): number {
  const n = parseFloat(v?.replace(/,/g, "") ?? "0");
  return isNaN(n) ? 0 : n;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

router.post("/trades/import-csv", async (req, res) => {
  try {
    const accountId = Number(req.body?.accountId);
    const csv: string = req.body?.csv ?? "";
    if (!accountId || accountId <= 0) { res.status(400).json({ error: "accountId required" }); return; }
    if (!csv || csv.length < 10) { res.status(400).json({ error: "csv required" }); return; }

    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }

    const lines = csv.split(/\r?\n/).filter((l: string) => l.trim());
    if (lines.length < 2) { res.status(400).json({ error: "CSV must have header + data rows" }); return; }

    const headers: string[] = parseCsvLine(lines[0]);
    req.log.info({ headers }, "CSV import headers");

    // Map columns
    const colOrderId = findCol(headers, ["order number", "ordernumber", "orderid", "order id", "order no", "trade id", "tradeid"]);
    const colSide    = findCol(headers, ["trade type", "tradetype", "side", "type", "direction", "buysell"]);
    const colAsset   = findCol(headers, ["crypto", "asset", "coin", "currency", "digital currency"]);
    const colFiat    = findCol(headers, ["fiat", "fiat currency", "fiatcurrency", "local currency"]);
    const colAmount  = findCol(headers, ["crypto amount", "amount", "qty", "quantity", "crypto"]);
    const colFiatAmt = findCol(headers, ["fiat amount", "total", "total amount", "totalamount", "price total", "total price"]);
    const colPrice   = findCol(headers, ["unit price", "price", "rate", "unitprice", "exchange rate"]);
    const colStatus  = findCol(headers, ["status", "order status", "orderstatus", "state"]);
    const colParty   = findCol(headers, ["counterpart", "counterparty", "trader", "buyer", "seller", "name", "nickname"]);
    const colCreated = findCol(headers, ["created", "create time", "createtime", "date", "time", "order time", "ordertime"]);
    const colCompleted = findCol(headers, ["completed", "complete time", "completetime", "finish time", "finishtime"]);
    const colPayment = findCol(headers, ["payment", "payment method", "paymentmethod", "payment type"]);

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      if (row.every((c) => !c)) continue;

      try {
        const rawSide = colSide !== -1 ? row[colSide]?.toLowerCase() ?? "" : "";
        const side = SIDE_MAP[rawSide] ?? "buy";
        const rawStatus = colStatus !== -1 ? row[colStatus]?.toLowerCase() ?? "" : "";
        const status = STATUS_MAP[rawStatus] ?? "completed";

        const asset = colAsset !== -1 ? row[colAsset]?.toUpperCase() ?? "USDT" : "USDT";
        const fiatCurrency = colFiat !== -1 ? row[colFiat]?.toUpperCase() ?? "VND" : "VND";
        const amount = colAmount !== -1 ? parseNum(row[colAmount]) : 0;
        const fiatAmount = colFiatAmt !== -1 ? parseNum(row[colFiatAmt]) : 0;
        const price = colPrice !== -1 ? parseNum(row[colPrice]) : (amount > 0 ? fiatAmount / amount : 0);
        const counterpartyName = colParty !== -1 ? row[colParty] || null : null;
        const paymentMethod = colPayment !== -1 ? row[colPayment] || null : null;
        const externalId = colOrderId !== -1 ? row[colOrderId] || null : null;
        const createdAt = colCreated !== -1 ? parseDate(row[colCreated]) ?? new Date() : new Date();
        const completedAt = colCompleted !== -1 ? parseDate(row[colCompleted]) : null;

        if (amount === 0 && fiatAmount === 0) { skipped++; continue; }

        // Skip duplicates by exchangeTradeId
        if (externalId) {
          const existing = await db
            .select({ id: tradesTable.id })
            .from(tradesTable)
            .where(eq(tradesTable.exchangeTradeId, externalId))
            .limit(1);
          if (existing.length > 0) { skipped++; continue; }
        }

        await db.insert(tradesTable).values({
          accountId,
          exchangeTradeId: externalId,
          side,
          asset,
          fiatCurrency,
          amount,
          price,
          fiatAmount,
          status,
          counterpartyName,
          paymentMethod,
          createdAt,
          completedAt: status === "completed" ? (completedAt ?? createdAt) : null,
        });
        imported++;
      } catch (rowErr) {
        errors.push(`Row ${i}: ${(rowErr as Error).message}`);
      }
    }

    // Update account stats
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tradesTable)
      .where(eq(tradesTable.accountId, accountId));
    await db.update(accountsTable).set({ completedTrades: Number(countRow.count) }).where(eq(accountsTable.id, accountId));

    res.json({
      success: true,
      imported,
      skipped,
      total: lines.length - 1,
      errors: errors.slice(0, 5),
      message: `Импортировано ${imported} сделок, пропущено ${skipped}`,
    });
  } catch (err) {
    req.log.error(err, "CSV import failed");
    res.status(400).json({ error: "Ошибка импорта CSV" });
  }
});

export default router;
