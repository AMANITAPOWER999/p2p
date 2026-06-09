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

  const bodyObj = {
    pageNum,
    pageSize,
    ...(params.tradeType ? { tradeType: params.tradeType } : {}),
  };

  // Common headers required by MEXC web platform (nginx rejects without Origin)
  const webHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.mexc.com",
    "Referer": "https://www.mexc.com/",
  };
  const otcHeaders = {
    ...webHeaders,
    "Origin": "https://otc.mexc.com",
    "Referer": "https://otc.mexc.com/",
  };

  // Different MEXC C2C endpoints and auth strategies to try
  const attempts: Array<{
    url: string;
    method: "POST" | "GET";
    headers: Record<string, string>;
    body?: string;
  }> = [
    // 1. OTC domain — v1 GET (most common)
    {
      url: `https://otc.mexc.com/api/v1/order/page?page=${pageNum}&size=${pageSize}`,
      method: "GET",
      headers: { ...otcHeaders, Authorization: `Bearer ${webToken}` },
    },
    // 2. OTC domain — v1 POST
    {
      url: "https://otc.mexc.com/api/v1/order/page",
      method: "POST",
      headers: { ...otcHeaders, Authorization: `Bearer ${webToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ page: pageNum, size: pageSize }),
    },
    // 3. OTC c2c order list
    {
      url: `https://otc.mexc.com/api/v1/c2c/order/list?pageNum=${pageNum}&pageSize=${pageSize}`,
      method: "GET",
      headers: { ...otcHeaders, Authorization: `Bearer ${webToken}` },
    },
    // 4. OTC order history
    {
      url: `https://otc.mexc.com/api/v1/c2c/order/history?pageNum=${pageNum}&pageSize=${pageSize}`,
      method: "GET",
      headers: { ...otcHeaders, Authorization: `Bearer ${webToken}` },
    },
    // 5. Main domain c2c-list with Origin (was 400 without it)
    {
      url: "https://www.mexc.com/api/platform/spot/order/c2c-list",
      method: "POST",
      headers: { ...webHeaders, Authorization: `Bearer ${webToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
    },
    // 6. Main domain — token without Bearer prefix
    {
      url: "https://www.mexc.com/api/platform/spot/order/c2c-list",
      method: "POST",
      headers: { ...webHeaders, Authorization: webToken, "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
    },
    // 7. Token as cookie with Origin
    {
      url: "https://www.mexc.com/api/platform/spot/order/c2c-list",
      method: "POST",
      headers: {
        ...webHeaders,
        Cookie: `authToken=${webToken}; token=${webToken}; _token=${webToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyObj),
    },
    // 8. OTC — token without Bearer
    {
      url: `https://otc.mexc.com/api/v1/order/page?page=${pageNum}&size=${pageSize}`,
      method: "GET",
      headers: { ...otcHeaders, Authorization: webToken },
    },
  ];

  for (const ep of attempts) {
    try {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          ...ep.headers,
        },
        ...(ep.body ? { body: ep.body } : {}),
      });

      const text = await res.text();
      logger.info(
        { url: ep.url, method: ep.method, status: res.status, bodySnippet: text.slice(0, 300) },
        "MEXC C2C web response"
      );

      // Skip non-JSON HTML error pages
      if (text.trim().startsWith("<")) {
        logger.warn({ url: ep.url, status: res.status }, "MEXC C2C: HTML response, skipping");
        continue;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text);
      } catch {
        logger.warn({ text: text.slice(0, 300) }, "MEXC C2C: non-JSON response");
        continue;
      }

      // Auth failure codes — don't try extracting orders
      const code = Number(data.code ?? data.status ?? 0);
      if (code === 401 || code === 403 || code === 10000 || code === 10001 || code === 30001) {
        logger.warn({ url: ep.url, code, msg: data.msg ?? data.message }, "MEXC C2C: auth error, trying next");
        continue;
      }

      if (code !== 0 && code !== 200 && code !== 0) {
        logger.warn({ url: ep.url, code, msg: data.msg ?? data.message }, "MEXC C2C: non-success code");
        return { orders: [], total: 0, rawResponse: data };
      }

      const inner = (data.data ?? data.result ?? data) as Record<string, unknown>;
      const list = inner.list ?? inner.rows ?? inner.data ?? inner.records ?? inner.orders ?? [];
      const total = Number(inner.total ?? inner.totalCount ?? inner.count ?? (Array.isArray(list) ? list.length : 0));
      const orders = Array.isArray(list) ? (list as MexcC2CWebOrder[]) : [];

      logger.info({ url: ep.url, ordersFound: orders.length, total }, "MEXC C2C: success");
      return { orders, total, rawResponse: data };
    } catch (err) {
      logger.warn({ err, url: ep.url }, "MEXC C2C endpoint failed");
    }
  }

  return { orders: [], total: 0, rawResponse: { error: "All endpoints failed" } };
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
