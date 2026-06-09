import { createHmac } from "crypto";
import { logger } from "./logger";

const MEXC_BASE = "https://api.mexc.com";

function sign(queryString: string, secret: string): string {
  return createHmac("sha256", secret).update(queryString).digest("hex");
}

async function mexcGet(
  apiKey: string,
  secret: string,
  path: string,
  params: Record<string, string> = {}
): Promise<unknown> {
  const ts = Date.now().toString();
  const qs = new URLSearchParams({ ...params, timestamp: ts }).toString();
  const sig = sign(qs, secret);
  const url = `${MEXC_BASE}${path}?${qs}&signature=${sig}`;
  const res = await fetch(url, {
    headers: {
      "X-MEXC-APIKEY": apiKey,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export interface MexcBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface MexcAccountInfo {
  balances: MexcBalance[];
  accountType: string;
  canTrade: boolean;
}

export interface MexcC2COrder {
  orderId: string;
  advertId: string;
  tradeType: string; // BUY | SELL
  asset: string;
  fiat: string;
  amount: string;
  price: string;
  totalPrice: string;
  orderStatus: string; // COMPLETED | CANCELLED | PENDING | PAID
  createTime: number;
  completeTime: number | null;
  counterpartNickName?: string;
}

export async function getMexcAccount(
  apiKey: string,
  secret: string
): Promise<MexcAccountInfo> {
  const data = await mexcGet(apiKey, secret, "/api/v3/account");
  return data as MexcAccountInfo;
}

export async function getMexcC2COrders(
  _apiKey: string,
  _secret: string,
  _params: { tradeType?: string; pageNum?: number; pageSize?: number } = {}
): Promise<MexcC2COrder[]> {
  // MEXC P2P/C2C trade history is NOT accessible via standard spot API keys.
  // Their C2C platform uses web-based JWT session authentication, separate from
  // the HMAC-SHA256 spot API key system. Standard API keys only grant access
  // to spot/futures trading data.
  logger.info("MEXC C2C: P2P trade history requires web session auth (not API key)");
  return [];
}

export async function getMexcSpotTrades(
  apiKey: string,
  secret: string,
  symbol = "USDTVND"
): Promise<Array<{ symbol: string; id: string; price: string; qty: string; quoteQty: string; time: number; isBuyer: boolean }>> {
  try {
    const data = await mexcGet(apiKey, secret, "/api/v3/myTrades", { symbol }) as Record<string, unknown>;
    if (Array.isArray(data)) return data as ReturnType<typeof getMexcSpotTrades> extends Promise<infer T> ? T : never;
  } catch (err) {
    logger.warn({ err }, "MEXC spot trades fetch failed");
  }
  return [];
}

export function mapMexcStatusToInternal(
  status: string
): "pending" | "paid" | "completed" | "cancelled" | "disputed" {
  switch (status?.toUpperCase()) {
    case "COMPLETED":
    case "FINISHED":
      return "completed";
    case "PAID":
    case "BUYER_PAID":
      return "paid";
    case "CANCELLED":
    case "CANCELED":
      return "cancelled";
    case "APPEAL":
    case "DISPUTE":
      return "disputed";
    default:
      return "pending";
  }
}

export function mapMexcTradeType(tradeType: string): "buy" | "sell" {
  return tradeType?.toUpperCase() === "BUY" ? "buy" : "sell";
}
