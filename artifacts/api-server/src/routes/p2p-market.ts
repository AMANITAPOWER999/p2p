import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

router.get("/api/p2p/market-price", async (req, res) => {
  const exchange = ((req.query.exchange as string) ?? "bybit").toLowerCase();
  const side     = ((req.query.side as string) ?? "BUY").toUpperCase();
  const coin     = (req.query.coin as string) ?? "USDT";
  const currency = (req.query.currency as string) ?? "VND";

  try {
    if (exchange === "bybit") {
      const body = {
        tokenId: coin,
        currencyId: currency,
        side: side === "BUY" ? "1" : "0",
        size: "5",
        page: "1",
      };
      const resp = await fetch("https://api2.bybit.com/fiat/otc/item/online", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: any = await resp.json();

      const items: any[] = json?.result?.items ?? [];
      const top3 = items.slice(0, 3).map((it: any) => ({
        nickname: it.nickName ?? it.userId,
        price: parseFloat(it.price),
        minAmount: parseFloat(it.minAmount ?? "0"),
        maxAmount: parseFloat(it.maxAmount ?? "0"),
        quantity: parseFloat(it.quantity ?? "0"),
        paymentMethods: (it.payments ?? []).map((p: any) => p.paymentType ?? p),
      }));

      const avg =
        top3.length > 0
          ? top3.reduce((s, x) => s + x.price, 0) / top3.length
          : 0;

      return res.json({ exchange, side, coin, currency, top3, avg: parseFloat(avg.toFixed(2)) });
    }

    return res.status(400).json({ error: `Exchange '${exchange}' not supported for market price yet` });
  } catch (e: any) {
    logger.error({ err: e }, "p2p market-price error");
    return res.status(500).json({ error: e.message });
  }
});

export default router;
