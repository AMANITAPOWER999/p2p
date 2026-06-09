import { Router } from "express";
import { Telegraf } from "telegraf";
import { db, tradesTable, accountsTable, notificationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

let bot: Telegraf | null = null;

if (process.env.TELEGRAM_BOT_TOKEN) {
  bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

  bot.start((ctx) => {
    ctx.reply(
      "P2P Trading Bot\n\nКоманды:\n/status — сводка\n/trades — активные сделки\n/accounts — аккаунты\n/help — помощь"
    );
  });

  bot.command("help", (ctx) => {
    ctx.reply(
      "Команды:\n\n/status — общая сводка\n/trades — активные сделки\n/accounts — аккаунты и балансы"
    );
  });

  bot.command("status", async (ctx) => {
    try {
      const [activeRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(tradesTable)
        .where(sql`status IN ('pending', 'paid')`);
      const [completedRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(tradesTable)
        .where(eq(tradesTable.status, "completed"));
      const [volumeRow] = await db
        .select({ total: sql<number>`coalesce(sum(fiat_amount), 0)` })
        .from(tradesTable)
        .where(eq(tradesTable.status, "completed"));
      ctx.reply(
        `Сводка P2P:\n\nАктивных сделок: ${activeRow.count}\nЗавершено: ${completedRow.count}\nОбщий объём: ${Number(volumeRow.total).toFixed(0)}`
      );
    } catch {
      ctx.reply("Ошибка получения статуса");
    }
  });

  bot.command("trades", async (ctx) => {
    try {
      const trades = await db
        .select({ trade: tradesTable, accountName: accountsTable.name })
        .from(tradesTable)
        .leftJoin(accountsTable, eq(tradesTable.accountId, accountsTable.id))
        .where(sql`${tradesTable.status} IN ('pending', 'paid')`)
        .limit(10);
      if (!trades.length) { ctx.reply("Нет активных сделок"); return; }
      const lines = trades.map(
        (r) =>
          `#${r.trade.id} | ${r.trade.side.toUpperCase()} ${r.trade.amount} ${r.trade.asset} | ${r.trade.fiatAmount.toFixed(0)} ${r.trade.fiatCurrency} | ${r.trade.status.toUpperCase()}`
      );
      ctx.reply("Активные сделки:\n\n" + lines.join("\n"));
    } catch {
      ctx.reply("Ошибка получения сделок");
    }
  });

  bot.command("accounts", async (ctx) => {
    try {
      const accounts = await db.select().from(accountsTable);
      if (!accounts.length) { ctx.reply("Аккаунты не настроены"); return; }
      const lines = accounts.map(
        (a) =>
          `${a.name} (${a.exchange.toUpperCase()})\nВладелец: ${a.ownerName}\nБанк: ${a.bankName}\nСделок: ${a.completedTrades ?? 0}`
      );
      ctx.reply("Аккаунты:\n\n" + lines.join("\n\n"));
    } catch {
      ctx.reply("Ошибка получения аккаунтов");
    }
  });

  if (process.env.NODE_ENV !== "production") {
    bot.launch().catch((err) => logger.error(err, "Failed to launch bot"));
    logger.info("Telegram bot launched in polling mode");
  } else {
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (domain) {
      bot.telegram
        .setWebhook(`https://${domain}/api/telegram/webhook`)
        .then(() => logger.info({ domain }, "Webhook set"))
        .catch((err) => logger.error(err, "Failed to set webhook"));
    }
    router.post("/telegram/webhook", (req, res) => {
      bot!.handleUpdate(req.body, res);
    });
  }
} else {
  logger.warn("TELEGRAM_BOT_TOKEN not set — bot disabled");
}

// Payment notification endpoint (for PUSH/SMS/email forwarding)
router.post("/telegram/payment-notify", async (req, res) => {
  try {
    const { accountId, amount, currency, senderName, source, rawText } = req.body;
    if (!accountId || !amount || !currency) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    await db.insert(notificationsTable).values({
      type: "payment",
      title: "Входящий платеж",
      message: `${amount} ${currency}${senderName ? ` от ${senderName}` : ""} (${source ?? "push"})`,
      relatedType: "payment",
    });
    if (bot && process.env.TELEGRAM_CHAT_ID) {
      await bot.telegram.sendMessage(
        process.env.TELEGRAM_CHAT_ID,
        `Входящий платеж\n\nСумма: ${amount} ${currency}${senderName ? `\nОтправитель: ${senderName}` : ""}\nИсточник: ${source ?? "push"}${rawText ? `\n\nТекст: ${String(rawText).slice(0, 200)}` : ""}`
      );
    }
    res.json({ success: true });
  } catch (err) {
    logger.error(err, "Failed to process payment notification");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
