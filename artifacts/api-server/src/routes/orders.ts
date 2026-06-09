import { Router } from "express";
import { db, ordersTable, accountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListOrdersQueryParams,
  CreateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  UpdateOrderBody,
  DeleteOrderParams,
  ToggleOrderParams,
} from "@workspace/api-zod";

const router = Router();

function fmt(order: typeof ordersTable.$inferSelect, accountName?: string | null, exchange?: string | null) {
  return { ...order, accountName: accountName ?? null, exchange: exchange ?? null, createdAt: order.createdAt.toISOString() };
}

router.get("/orders", async (req, res) => {
  try {
    const params = ListOrdersQueryParams.parse({
      accountId: req.query.accountId ? Number(req.query.accountId) : undefined,
      side: req.query.side,
      status: req.query.status,
    });
    const conditions = [];
    if (params.accountId) conditions.push(eq(ordersTable.accountId, params.accountId));
    if (params.side) conditions.push(eq(ordersTable.side, params.side));
    if (params.status && params.status !== "all") {
      conditions.push(eq(ordersTable.isActive, params.status === "active"));
    }
    const rows = await db
      .select({ order: ordersTable, accountName: accountsTable.name, exchange: accountsTable.exchange })
      .from(ordersTable)
      .leftJoin(accountsTable, eq(ordersTable.accountId, accountsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(ordersTable.id);
    res.json(rows.map((r) => fmt(r.order, r.accountName, r.exchange)));
  } catch (err) {
    req.log.error(err, "Failed to list orders");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/orders", async (req, res) => {
  try {
    const body = CreateOrderBody.parse(req.body);
    const [order] = await db.insert(ordersTable).values(body).returning();
    res.status(201).json(fmt(order));
  } catch (err) {
    req.log.error(err, "Failed to create order");
    res.status(400).json({ error: "Invalid input" });
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const { id } = GetOrderParams.parse({ id: Number(req.params.id) });
    const [row] = await db
      .select({ order: ordersTable, accountName: accountsTable.name, exchange: accountsTable.exchange })
      .from(ordersTable)
      .leftJoin(accountsTable, eq(ordersTable.accountId, accountsTable.id))
      .where(eq(ordersTable.id, id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(fmt(row.order, row.accountName, row.exchange));
  } catch (err) {
    req.log.error(err, "Failed to get order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/orders/:id", async (req, res) => {
  try {
    const { id } = UpdateOrderParams.parse({ id: Number(req.params.id) });
    const body = UpdateOrderBody.parse(req.body);
    const updateData: Record<string, unknown> = {};
    if (body.price !== undefined) updateData.price = body.price;
    if (body.minAmount !== undefined) updateData.minAmount = body.minAmount;
    if (body.maxAmount !== undefined) updateData.maxAmount = body.maxAmount;
    if (body.availableAmount !== undefined) updateData.availableAmount = body.availableAmount;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod;
    const [order] = await db.update(ordersTable).set(updateData).where(eq(ordersTable.id, id)).returning();
    if (!order) { res.status(404).json({ error: "Not found" }); return; }
    res.json(fmt(order));
  } catch (err) {
    req.log.error(err, "Failed to update order");
    res.status(400).json({ error: "Invalid input" });
  }
});

router.delete("/orders/:id", async (req, res) => {
  try {
    const { id } = DeleteOrderParams.parse({ id: Number(req.params.id) });
    await db.delete(ordersTable).where(eq(ordersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err, "Failed to delete order");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/orders/:id/toggle", async (req, res) => {
  try {
    const { id } = ToggleOrderParams.parse({ id: Number(req.params.id) });
    const [current] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
    if (!current) { res.status(404).json({ error: "Not found" }); return; }
    const [order] = await db.update(ordersTable).set({ isActive: !current.isActive }).where(eq(ordersTable.id, id)).returning();
    res.json(fmt(order));
  } catch (err) {
    req.log.error(err, "Failed to toggle order");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
