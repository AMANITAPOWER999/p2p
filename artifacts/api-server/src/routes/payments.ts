import { Router } from "express";
import { db, paymentsTable, accountsTable, notificationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListPaymentsQueryParams,
  CreatePaymentBody,
  UpdatePaymentParams,
  UpdatePaymentBody,
} from "@workspace/api-zod";

const router = Router();

function fmt(payment: typeof paymentsTable.$inferSelect, accountName?: string | null) {
  return {
    ...payment,
    accountName: accountName ?? null,
    confirmedAt: payment.confirmedAt ? payment.confirmedAt.toISOString() : null,
    createdAt: payment.createdAt.toISOString(),
  };
}

router.get("/payments", async (req, res) => {
  try {
    const params = ListPaymentsQueryParams.parse({
      accountId: req.query.accountId ? Number(req.query.accountId) : undefined,
      type: req.query.type,
      status: req.query.status,
    });
    const conditions = [];
    if (params.accountId) conditions.push(eq(paymentsTable.accountId, params.accountId));
    if (params.type && params.type !== "all") conditions.push(eq(paymentsTable.type, params.type));
    if (params.status && params.status !== "all") conditions.push(eq(paymentsTable.status, params.status));
    const rows = await db
      .select({ payment: paymentsTable, accountName: accountsTable.name })
      .from(paymentsTable)
      .leftJoin(accountsTable, eq(paymentsTable.accountId, accountsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(paymentsTable.id);
    res.json(rows.map((r) => fmt(r.payment, r.accountName)));
  } catch (err) {
    req.log.error(err, "Failed to list payments");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/payments", async (req, res) => {
  try {
    const body = CreatePaymentBody.parse(req.body);
    const [payment] = await db.insert(paymentsTable).values(body).returning();
    if (body.type === "incoming") {
      await db.insert(notificationsTable).values({
        type: "payment",
        title: "Incoming Payment",
        message: `Received ${payment.amount} ${payment.currency}${payment.senderName ? ` from ${payment.senderName}` : ""}`,
        relatedId: payment.id,
        relatedType: "payment",
      });
    }
    res.status(201).json(fmt(payment));
  } catch (err) {
    req.log.error(err, "Failed to create payment");
    res.status(400).json({ error: "Invalid input" });
  }
});

router.patch("/payments/:id", async (req, res) => {
  try {
    const { id } = UpdatePaymentParams.parse({ id: Number(req.params.id) });
    const body = UpdatePaymentBody.parse(req.body);
    const updateData: Record<string, unknown> = {};
    if (body.status !== undefined) {
      updateData.status = body.status;
      if (body.status === "confirmed") updateData.confirmedAt = new Date();
    }
    if (body.reference !== undefined) updateData.reference = body.reference;
    const [payment] = await db.update(paymentsTable).set(updateData).where(eq(paymentsTable.id, id)).returning();
    if (!payment) { res.status(404).json({ error: "Not found" }); return; }
    res.json(fmt(payment));
  } catch (err) {
    req.log.error(err, "Failed to update payment");
    res.status(400).json({ error: "Invalid input" });
  }
});

export default router;
