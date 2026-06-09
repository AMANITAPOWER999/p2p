import { Router } from "express";
import { db, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListAccountsResponse,
  CreateAccountBody,
  GetAccountParams,
  UpdateAccountBody,
  UpdateAccountParams,
  SyncAccountParams,
} from "@workspace/api-zod";

const router = Router();

function fmt(a: typeof accountsTable.$inferSelect & { apiKeySet?: boolean }) {
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
    res.json({ success: true, message: "Sync complete (API keys required for live data)", ordersSync: 0, tradesSync: 0 });
  } catch (err) {
    req.log.error(err, "Failed to sync account");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
