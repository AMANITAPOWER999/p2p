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

// Bitget's public P2P ad-list API (queryAdvList) is geo-blocked for non-VN IPs and returns
// an empty dataList regardless of auth/cookies. As a free workaround, we render p2p.army's
// public Bitget/VND price-aggregation page (real, live, sourced from Bitget P2P ads across
// payment methods) via Cloudflare Browser Rendering, and parse the rendered HTML table.
// This gives real per-payment-method buy/sell prices, but NOT individual merchant orders,
// so there is no per-order min/max amount — the same price list is used for all amount tiers.
type BitgetRow = { method: string; buy: number | null; sell: number | null; adsBuy: number; adsSell: number };

let bitgetP2pArmyCache: { data: BitgetRow[]; fetchedAt: number } | null = null;
// Cloudflare's Workers Free plan only grants 10 minutes of Browser Rendering time per day
// (and 1 request/10s), so we cache aggressively to stay within that budget. On a paid
// Workers plan (browser hours unmetered) this could safely be lowered for fresher data.
const BITGET_P2P_ARMY_TTL_MS = 5 * 60_000;
// Concurrent requests (e.g. buy+sell fired together by the client) must share a single
// in-flight fetch, otherwise they race past the cache check and both hit the CF API,
// tripping the "1 request/10s" rate limit.
let bitgetP2pArmyInFlight: Promise<BitgetRow[]> | null = null;

async function fetchBitgetRowsFromP2pArmy(coin: string, currency: string): Promise<BitgetRow[]> {
  const now = Date.now();
  if (bitgetP2pArmyCache && now - bitgetP2pArmyCache.fetchedAt < BITGET_P2P_ARMY_TTL_MS) {
    return bitgetP2pArmyCache.data;
  }
  if (bitgetP2pArmyInFlight) {
    return bitgetP2pArmyInFlight;
  }
  bitgetP2pArmyInFlight = fetchBitgetRowsFromP2pArmyUncached(coin, currency);
  try {
    return await bitgetP2pArmyInFlight;
  } finally {
    bitgetP2pArmyInFlight = null;
  }
}

async function fetchBitgetRowsFromP2pArmyUncached(coin: string, currency: string): Promise<BitgetRow[]> {
  const now = Date.now();
  const accountId = process.env["CF_ACCOUNT_ID"] ?? "";
  const apiToken = process.env["CF_API_TOKEN"] ?? "";
  if (!accountId || !apiToken) {
    logger.warn("Bitget P2P: CF_ACCOUNT_ID/CF_API_TOKEN not configured, cannot render p2p.army");
    return bitgetP2pArmyCache?.data ?? [];
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/content`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `https://p2p.army/en/p2p/prices/bitget/${currency}/${coin}`,
          gotoOptions: { waitUntil: "networkidle0", timeout: 20000 },
        }),
        signal: ctrl.signal,
      }
    );
    clearTimeout(t);
    const json: any = await resp.json();
    if (!json.success || typeof json.result !== "string") {
      logger.warn({ errors: json.errors }, "Bitget P2P: browser-rendering call failed");
      return bitgetP2pArmyCache?.data ?? [];
    }
    const html: string = json.result;
    const rows: BitgetRow[] = [];
    for (const row of html.split("<tr").slice(1)) {
      const nameM = row.match(/<span class="text-sm tracking-tight">([^<]+)<\/span>/);
      if (!nameM) continue;
      const buyM = row.match(/data-tooltip-id="prices-buy-tooltip" data-tooltip-content="([0-9.]+)"/);
      const sellM = row.match(/data-tooltip-id="prices-sell-tooltip" data-tooltip-content="([0-9.]+)"/);
      const adsM = row.match(/text-p2p-text-main">(\d+)<\/span><span class="mx-1 opacity-30">\/<\/span><span class="[^"]*">(\d+)<\/span>/);
      rows.push({
        method: nameM[1],
        buy: buyM ? parseFloat(buyM[1]) : null,
        sell: sellM ? parseFloat(sellM[1]) : null,
        adsBuy: adsM ? parseInt(adsM[1], 10) : 0,
        adsSell: adsM ? parseInt(adsM[2], 10) : 0,
      });
    }
    if (rows.length === 0) {
      logger.warn("Bitget P2P: p2p.army page parsed but no rows found");
      return bitgetP2pArmyCache?.data ?? [];
    }
    bitgetP2pArmyCache = { data: rows, fetchedAt: now };
    return rows;
  } catch (e) {
    logger.warn({ err: String(e) }, "Bitget P2P: p2p.army fetch/parse error");
    return bitgetP2pArmyCache?.data ?? [];
  }
}

async function fetchBitgetTop(coin: string, currency: string, side: "buy" | "sell", _amount: number) {
  const rows = await fetchBitgetRowsFromP2pArmy(coin, currency);
  // "buy" (user buys USDT) → merchants are selling → use the "Section BUY(selling)" price;
  // for the user this is the ask price, so cheapest first. "sell" → use "Section SELL(buying)"
  // price, best (highest) for the user first.
  const key = side === "buy" ? "buy" : "sell";
  const withAds = side === "buy" ? "adsBuy" : "adsSell";
  const filtered = rows.filter(r => r[key] !== null && r[withAds] > 0);
  filtered.sort((a, b) => (side === "buy" ? (a[key]! - b[key]!) : (b[key]! - a[key]!)));
  return filtered.slice(0, 10).map((r, i) => ({
    rank: i + 1,
    nickname: r.method,
    price: r[key] as number,
    minAmount: 0,
    maxAmount: 0,
  }));
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
    if (exchange === "bitget") {
      const tradeType = side === "BUY" ? "buy" : "sell";
      const items = await fetchBitgetTop(coin, currency, tradeType as "buy" | "sell", 0);
      const top3 = items.slice(0, 3);
      const avg = top3.length > 0 ? top3.reduce((s, x) => s + x.price, 0) / top3.length : 0;
      return res.json({ exchange, side, coin, currency, top3, avg: parseFloat(avg.toFixed(2)) });
    }

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
      const avg = top3.length > 0 ? top3.reduce((s, x) => s + x.price, 0) / top3.length : 0;
      return res.json({ exchange, side, coin, currency, top3, avg: parseFloat(avg.toFixed(2)) });
    }

    return res.status(400).json({ error: `Exchange '${exchange}' not supported for market price yet` });
  } catch (e: any) {
    logger.error({ err: e }, "p2p market-price error");
    return res.status(500).json({ error: e.message });
  }
});

export default router;
