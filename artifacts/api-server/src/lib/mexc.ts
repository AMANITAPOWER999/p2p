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
  tradeType: string;
  asset: string;
  fiat: string;
  amount: string;
  price: string;
  totalPrice: string;
  orderStatus: string;
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
  logger.info("MEXC C2C: P2P trade history requires web session auth (not API key)");
  return [];
}

export interface MexcC2CWebOrder {
  orderId: string;
  tradeType: string;
  coin?: string;
  asset?: string;
  fiatCurrency?: string;
  fiat?: string;
  amount: string;
  price: string;
  totalPrice?: string;
  orderTotalPrice?: string;
  orderStatus: string;
  createTime: number;
  completedTime?: number | null;
  completeTime?: number | null;
  finishTime?: number | null;
  advertiserNickName?: string;
  counterpartNickName?: string;
  paymentMethod?: string;
  advertId?: string;
}

export interface MexcC2CWebResult {
  orders: MexcC2CWebOrder[];
  total: number;
  rawResponse?: unknown;
}

export async function getMexcC2COrdersWeb(
  webToken: string,
  params: { tradeType?: string; pageNum?: number; pageSize?: number } = {}
): Promise<MexcC2CWebResult> {
  const pageNum = params.pageNum ?? 1;
  const pageSize = params.pageSize ?? 20;

  const endpoints = [
    {
      url: "https://www.mexc.com/api/platform/spot/order/c2c-list",
      method: "POST" as const,
      body: JSON.stringify({
        pageNum,
        pageSize,
        ...(params.tradeType ? { tradeType: params.tradeType } : {}),
      }),
    },
    {
      url: `https://www.mexc.com/api/platform/spot/order/c2c-list?pageNum=${pageNum}&pageSize=${pageSize}`,
      method: "GET" as const,
      body: undefined,
    },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: {
          Authorization: `Bearer ${webToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; TradingBot/1.0)",
        },
        ...(ep.body ? { body: ep.body } : {}),
      });

      const text = await res.text();
      logger.info({ url: ep.url, status: res.status, bodySnippet: text.slice(0, 200) }, "MEXC C2C web response");

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text);
      } catch {
        logger.warn({ text: text.slice(0, 300) }, "MEXC C2C: non-JSON response");
        continue;
      }

      if (data.code && Number(data.code) !== 200 && Number(data.code) !== 0) {
        logger.warn({ code: data.code, msg: data.msg ?? data.message }, "MEXC C2C API error code");
        return { orders: [], total: 0, rawResponse: data };
      }

      const inner = (data.data ?? data.result ?? data) as Record<string, unknown>;
      const list = inner.list ?? inner.rows ?? inner.data ?? inner.records ?? inner.orders ?? [];
      const total = Number(inner.total ?? inner.totalCount ?? inner.count ?? (Array.isArray(list) ? list.length : 0));
      const orders = Array.isArray(list) ? (list as MexcC2CWebOrder[]) : [];

      return { orders, total, rawResponse: data };
    } catch (err) {
      logger.warn({ err, url: ep.url }, "MEXC C2C endpoint failed");
    }
  }

  return { orders: [], total: 0 };
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
    case "FINISH":
    case "SUCCESS":
      return "completed";
    case "PAID":
    case "BUYER_PAID":
    case "TRANSFERRED":
      return "paid";
    case "CANCELLED":
    case "CANCELED":
    case "CANCEL":
      return "cancelled";
    case "APPEAL":
    case "DISPUTE":
    case "APPEALING":
      return "disputed";
    default:
      return "pending";
  }
}

export function mapMexcTradeType(tradeType: string): "buy" | "sell" {
  return tradeType?.toUpperCase() === "BUY" ? "buy" : "sell";
}
