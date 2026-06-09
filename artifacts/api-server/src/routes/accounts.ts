import { Router } from "express";
import { db, accountsTable, tradesTable, ordersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  ListAccountsResponse,
  CreateAccountBody,
  GetAccountParams,
  UpdateAccountBody,
  UpdateAccountParams,
  SyncAccountParams,
} from "@workspace/api-zod";
import {
  getMexcAccount,
  getMexcC2COrders,
  mapMexcStatusToInternal,
  mapMexcTradeType,
} from "../lib/mexc";

const router = Router();

function fmt(a: typeof accountsTable.$inferSelect) {
  return {
    ...a,
    apiKeySet: !!(a.apiKey && a.apiSecret),
    apiKey: undefined,
    apiSecret: undefined,
    createdAt: a.createdAt.toISOString(),
  };
}

router.get("/accounts", async (req, res) => {
  try {
    const accounts = await db.select().from(accountsTable).orderBy(accountsTable.id);
    const parsed = ListAccountsResponse.parse(accounts.map(fmt));
    res.json(parsed);
  } catch (err) {
    req.log.error(err, "Failed to list accounts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/accounts", async (req, res) => {
  try {
    const body = CreateAccountBody.parse(req.body);
    const [account] = await db
      .insert(accountsTable)
      .values({
        name: body.name,
        exchange: body.exchange,
        ownerName: body.ownerName,
        bankName: body.bankName,
        bankUrl: body.bankUrl ?? null,
        apiKey: body.apiKey ?? null,
        apiSecret: body.apiSecret ?? null,
      })
      .returning();
    res.status(201).json(fmt(account));
  } catch (err) {
    req.log.error(err, "Failed to create account");
    res.status(400).json({ error: "Invalid input" });
  }
});

router.get("/accounts/:id", async (req, res) => {
  try {
    const { id } = GetAccountParams.parse({ id: Number(req.params.id) });
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, id));
    if (!account) { res.status(404).json({ error: "Not found" }); return; }
    res.json(fmt(account));
  } catch (err) {
    req.log.error(err, "Failed to get account");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/accounts/:id", async (req, res) => {
  try {
    const { id } = UpdateAccountParams.parse({ id: Number(req.params.id) });
    const body = UpdateAccountBody.parse(req.body);
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.bankName !== undefined) updateData.bankName = body.bankName;
    if (body.bankUrl !== undefined) updateData.bankUrl = body.bankUrl;
    if (body.apiKey !== undefined) updateData.apiKey = body.apiKey;
    if (body.apiSecret !== undefined) updateData.apiSecret = body.apiSecret;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    const [account] = await db.update(accountsTable).set(updateData).where(eq(accountsTable.id, id)).returning();
    if (!account) { res.status(404).json({ error: "Not found" }); return; }
    res.json(fmt(account));
  } catch (err) {
    req.log.error(err, "Failed to update account");
    res.status(400).json({ error: "Invalid input" });
  }
});

router.post("/accounts/:id/sync", async (req, res) => {
  try {
    const { id } = SyncAccountParams.parse({ id: Number(req.params.id) });
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, id));
    if (!account) { res.status(404).json({ error: "Not found" }); return; }

    if (!account.apiKey || !account.apiSecret) {
      res.json({ success: false, message: "API ключи не настроены", tradesSync: 0, ordersSync: 0 });
      return;
    }

    let tradesSync = 0;
    let balance: number | null = null;
    let message = "";

    if (account.exchange === "mexc") {
      // Получаем баланс через spot API
      try {
        const accountInfo = await getMexcAccount(account.apiKey, account.apiSecret);
        if (accountInfo?.balances) {
          const usdtBalance = accountInfo.balances.find((b) => b.asset === "USDT");
          if (usdtBalance) {
            balance = parseFloat(usdtBalance.free) + parseFloat(usdtBalance.locked);
          }
          req.log.info(
            { canTrade: accountInfo.canTrade, accountType: accountInfo.accountType },
            "MEXC account verified"
          );
        }
      } catch (err) {
        req.log.warn(err, "Failed to fetch MEXC account balance");
        res.status(502).json({
          success: false,
          message: "Ошибка подключения к MEXC. Проверьте API ключ и секрет.",
          tradesSync: 0,
          ordersSync: 0,
        });
        return;
      }

      // MEXC P2P/C2C trade history requires web-based JWT auth (not API keys).
      // Standard API keys only access spot/futures. We get balance but not P2P trades.
      message = `MEXC аккаунт подключён. Баланс USDT: ${balance?.toFixed(8) ?? "0"}. P2P история недоступна через API ключ (требуется веб-сессия MEXC).`;
    } else if (account.exchange === "bybit") {
      message = "Bybit синхронизация будет доступна позже";
    }

    // Обновляем баланс если получили
    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (balance !== null) updateFields.balance = balance;
    await db.update(accountsTable).set(updateFields).where(eq(accountsTable.id, id));

    // Пересчитываем completedTrades из DB
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tradesTable)
      .where(eq(tradesTable.accountId, id));
    await db
      .update(accountsTable)
      .set({ completedTrades: Number(countRow.count) })
      .where(eq(accountsTable.id, id));

    res.json({ success: true, message, tradesSync, ordersSync: 0 });
  } catch (err) {
    req.log.error(err, "Failed to sync account");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
