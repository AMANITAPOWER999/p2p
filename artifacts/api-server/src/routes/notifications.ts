import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ListNotificationsQueryParams, MarkNotificationReadParams } from "@workspace/api-zod";

const router = Router();

function fmt(n: typeof notificationsTable.$inferSelect) {
  return { ...n, createdAt: n.createdAt.toISOString() };
}

router.get("/notifications", async (req, res) => {
  try {
    const params = ListNotificationsQueryParams.parse({
      unreadOnly: req.query.unreadOnly === "true",
    });
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(params.unreadOnly ? eq(notificationsTable.isRead, false) : undefined)
      .orderBy(desc(notificationsTable.createdAt))
      .limit(100);
    res.json(rows.map(fmt));
  } catch (err) {
    req.log.error(err, "Failed to list notifications");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/notifications/:id/read", async (req, res) => {
  try {
    const { id } = MarkNotificationReadParams.parse({ id: Number(req.params.id) });
    const [n] = await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, id)).returning();
    if (!n) { res.status(404).json({ error: "Not found" }); return; }
    res.json(fmt(n));
  } catch (err) {
    req.log.error(err, "Failed to mark notification read");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/notifications/read-all", async (req, res) => {
  try {
    await db.update(notificationsTable).set({ isRead: true });
    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "Failed to mark all read");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
