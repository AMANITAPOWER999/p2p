import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

const SPREAD = 0.012; // 1.2%

async function fetchBybitSide(coin: string, currency: string, side: "BUY" | "SELL") {
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
  const top = items.slice(0, 5).map((it: any) => ({
    nickname: it.nickName ?? it.userId,
    price: parseFloat(it.price),
    minAmount: parseFloat(it.minAmount ?? "0"),
    maxAmount: parseFloat(it.maxAmount ?? "0"),
  }));
  const avg = top.length > 0 ? top.reduce((s, x) => s + x.price, 0) / top.length : 0;
  return { top, avg: parseFloat(avg.toFixed(2)) };
}

// Auto-rate: fetch both sides, compute mid + spread
router.get("/p2p/auto-rate", async (req, res) => {
  const coin     = (req.query.coin as string) ?? "USDT";
  const currency = (req.query.currency as string) ?? "VND";
  try {
    const [buyData, sellData] = await Promise.all([
      fetchBybitSide(coin, currency, "BUY"),
      fetchBybitSide(coin, currency, "SELL"),
    ]);
    const mid     = (buyData.avg + sellData.avg) / 2;
    const ourBuy  = parseFloat((mid * (1 - SPREAD / 2)).toFixed(0));
    const ourSell = parseFloat((mid * (1 + SPREAD / 2)).toFixed(0));
    return res.json({
      coin, currency, spread: SPREAD,
      market: { avgBuy: buyData.avg, avgSell: sellData.avg, mid: parseFloat(mid.toFixed(2)) },
      ourBuy, ourSell,
      topBuy: buyData.top, topSell: sellData.top,
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error({ err: e }, "p2p auto-rate error");
    return res.status(500).json({ error: e.message });
  }
});

router.get("/p2p/market-price", async (req, res) => {
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
