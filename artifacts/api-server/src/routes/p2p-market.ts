import { Router } from "express";
import { createHmac } from "crypto";
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

async function fetchBybitTop(coin: string, currency: string, side: "buy" | "sell", amount: number) {
  const body: Record<string, string> = {
    tokenId: coin,
    currencyId: currency,
    side: side === "buy" ? "1" : "0",
    size: "10",
    page: "1",
  };
  if (amount > 0) body.amount = String(amount);
  const resp = await fetch("https://api2.bybit.com/fiat/otc/item/online", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: any = await resp.json();
  const items: any[] = json?.result?.items ?? [];
  return items.slice(0, 5).map((it: any, i: number) => ({
    rank: i + 1,
    nickname: it.nickName ?? String(it.userId).slice(0, 8),
    price: parseFloat(it.price),
    minAmount: parseFloat(it.minAmount ?? "0"),
    maxAmount: parseFloat(it.maxAmount ?? "0"),
  }));
}

async function fetchOkxTop(coin: string, currency: string, side: "buy" | "sell", amount: number) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const body: Record<string, string> = {
      side: side === "buy" ? "buy" : "sell",
      baseCurrency: coin,
      quoteCurrency: currency,
      paymentMethod: "",
      userType: "all",
      showTrade: "0",
      showFollow: "0",
      showAlreadyTraded: "0",
      isAbleFilter: "0",
    };
    if (amount > 0) body.amount = String(amount);
    const resp = await fetch("https://www.okx.com/v3/c2c/tradingOrders/books", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json",
        "Origin": "https://www.okx.com", "Referer": "https://www.okx.com/p2p-markets/vnd/" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const json: any = await resp.json();
    const items: any[] = (side === "buy" ? json?.data?.buy : json?.data?.sell) ?? [];
    return items.slice(0, 5).map((it: any, i: number) => ({
      rank: i + 1,
      nickname: it.nickName ?? it.publicUserId?.slice(0, 8) ?? "—",
      price: parseFloat(it.price),
      minAmount: parseFloat(it.minSingleTransAmount ?? it.minAmount ?? "0"),
      maxAmount: parseFloat(it.maxSingleTransAmount ?? it.maxAmount ?? "0"),
    }));
  } catch { return []; }
}

async function fetchBitgetTop(coin: string, currency: string, side: "buy" | "sell", _amount: number) {
  const apiKey    = process.env["BITGET_API_KEY"]    ?? "";
  const secret    = process.env["BITGET_SECRET_KEY"] ?? "";
  const passphrase = process.env["BITGET_PASSPHRASE"] ?? "";
  if (!apiKey || !secret) return [];

  // tradeType: "buy" means buyers posting (you sell to them); "sell" = sellers posting (you buy from them)
  const tradeType = side === "buy" ? "buy" : "sell";
  const path = `/api/v2/p2p/advList?coin=${coin}&fiatCurrency=${currency}&tradeType=${tradeType}&page=1&pageSize=10`;
  const ts   = Date.now().toString();
  const sign = createHmac("sha256", secret).update(ts + "GET" + path).digest("base64");

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const resp = await fetch("https://api.bitget.com" + path, {
      headers: {
        "ACCESS-KEY": apiKey,
        "ACCESS-SIGN": sign,
        "ACCESS-TIMESTAMP": ts,
        "ACCESS-PASSPHRASE": passphrase,
        "ACCESS-VERSION": "2",
        "Content-Type": "application/json",
      },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const json: any = await resp.json();
    if (json.code !== "00000") {
      logger.warn({ code: json.code, msg: json.msg }, "Bitget P2P advList non-success");
      return [];
    }
    const items: any[] = json?.data?.items ?? json?.data ?? [];
    return items.slice(0, 5).map((it: any, i: number) => ({
      rank: i + 1,
      nickname: it.nickName ?? it.merchantName ?? String(it.merchantId ?? "").slice(0, 8),
      price: parseFloat(it.price),
      minAmount: parseFloat(it.minOrderAmount ?? it.minAmount ?? "0"),
      maxAmount: parseFloat(it.maxOrderAmount ?? it.maxAmount ?? "0"),
    }));
  } catch {
    return [];
  }
}

router.get("/p2p/top-sellers", async (req, res) => {
  const exchange = ((req.query.exchange as string) ?? "bybit").toLowerCase();
  const side     = ((req.query.side as string) ?? "sell").toLowerCase() as "buy" | "sell";
  const coin     = (req.query.coin as string) ?? "USDT";
  const currency = (req.query.currency as string) ?? "VND";
  const amount   = parseFloat((req.query.amount as string) ?? "0");
  try {
    let top: any[];
    if (exchange === "okx") {
      top = await fetchOkxTop(coin, currency, side, amount);
    } else if (exchange === "bitget") {
      top = await fetchBitgetTop(coin, currency, side, amount);
    } else {
      top = await fetchBybitTop(coin, currency, side, amount);
    }
    return res.json({ exchange, side, coin, currency, amount, top });
  } catch (e: any) {
    logger.error({ err: e }, "p2p top-sellers error");
    return res.status(500).json({ error: e.message, top: [] });
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
