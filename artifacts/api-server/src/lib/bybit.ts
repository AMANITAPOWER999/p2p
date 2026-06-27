import { createHmac } from "crypto";
import { logger } from "./logger";

const BYBIT_BASE = "https://api.bybit.com";
const RECV_WINDOW = "5000";

function signBybit(timestamp: string, apiKey: string, secret: string, body: string): string {
  const raw = `${timestamp}${apiKey}${RECV_WINDOW}${body}`;
  return createHmac("sha256", secret).update(raw).digest("hex");
}

async function bybitPost(
  apiKey: string,
  secret: string,
  path: string,
  body: Record<string, unknown> = {}
): Promise<unknown> {
  const timestamp = Date.now().toString();
  const bodyStr = JSON.stringify(body);
  const signature = signBybit(timestamp, apiKey, secret, bodyStr);

  const res = await fetch(`${BYBIT_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": RECV_WINDOW,
    },
    body: bodyStr,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text, status: res.status };
  }
}

async function bybitGet(
  apiKey: string,
  secret: string,
  path: string,
  params: Record<string, string> = {}
): Promise<unknown> {
  const timestamp = Date.now().toString();
  const qs = new URLSearchParams(params).toString();
  const signature = signBybit(timestamp, apiKey, secret, qs);

  const url = `${BYBIT_BASE}${path}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": RECV_WINDOW,
    },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text, status: res.status };
  }
}

export interface BybitP2POrder {
  // simplifyList uses "id", full list uses "orderId"
  id?: string;
  orderId?: string;
  side: number; // 0=Buy, 1=Sell
  tokenId: string;
  currencyId: string;
  amount: string;        // fiat amount
  price: string;
  quantity?: string;           // crypto qty (full list)
  notifyTokenQuantity?: string; // crypto qty (simplifyList)
  notifyTokenId?: string;
  orderStatus?: number;  // full list field
  status?: number;       // simplifyList field
  createDate: string | number;
  finishDate?: string | number | null;
  nickName?: string;
  targetNickName?: string; // simplifyList
  paymentInfo?: Array<{ realName?: string }>;
}

export interface BybitP2PResult {
  orders: BybitP2POrder[];
  total: number;
  rawResponse?: unknown;
}

export async function getBybitP2POrders(
  apiKey: string,
  secret: string,
  params: { page?: number; size?: number; tokenId?: string; side?: string } = {}
): Promise<BybitP2PResult> {
  const page = params.page ?? 1;
  const size = params.size ?? 20;

  // Try multiple Bybit P2P endpoints
  const attempts = [
    // V5 P2P endpoints
    { path: "/v5/p2p/order/simplifyList", body: { page: String(page), size: String(size) } },
    { path: "/v5/p2p/order/list",          body: { page: String(page), size: String(size) } },
    // OTC / spot P2P endpoints
    { path: "/spot/v3/private/otc/order/listPage", body: { page: String(page), size: String(size) } },
    { path: "/spot/v1/private/otc/order/list",     body: { page: String(page), size: String(size) } },
    // V2-style
    { path: "/v2/private/p2p/order/list", body: { page: String(page), limit: String(size) } },
  ];

  for (const ep of attempts) {
    try {
      const data = await bybitPost(apiKey, secret, ep.path, ep.body) as Record<string, unknown>;
      // log full response for first attempt (debug)
      logger.info({ path: ep.path, response: JSON.stringify(data).slice(0, 400) }, "Bybit P2P raw response");

      const code = data.retCode ?? data.ret_code ?? data.code;
      const msg  = data.retMsg  ?? data.ret_msg  ?? data.msg ?? "";

      if (code !== 0 && code !== "0" && code !== 200 && code !== "200") {
        logger.warn({ path: ep.path, code, msg }, "Bybit P2P non-success, trying next");
        // If it's an auth error — stop trying, return raw response for debug
        const n = Number(code);
        if (n === 10003 || n === 33004 || n === 10004 || n === 10001) {
          return { orders: [], total: 0, rawResponse: data };
        }
        continue;
      }

      const result = (data.result ?? data.data ?? {}) as Record<string, unknown>;
      const list = result.list ?? result.rows ?? result.items ?? result.data ?? result.orders ?? [];
      const total = Number(result.count ?? result.total ?? result.totalCount ?? (Array.isArray(list) ? list.length : 0));
      const orders = Array.isArray(list) ? (list as BybitP2POrder[]) : [];

      logger.info({ path: ep.path, ordersFound: orders.length, total }, "Bybit P2P: success");
      return { orders, total, rawResponse: data };
    } catch (err) {
      logger.warn({ err, path: ep.path }, "Bybit P2P endpoint exception");
    }
  }

  return { orders: [], total: 0, rawResponse: { error: "All Bybit P2P endpoints failed" } };
}

// ─── Release order ────────────────────────────────────────────────────────────

export interface BybitReleaseResult {
  success: boolean;
  orderId: string;
  message: string;
  raw?: unknown;
}

export async function releaseBybitOrder(
  apiKey: string,
  secret: string,
  orderId: string
): Promise<BybitReleaseResult> {
  const endpoints = [
    "/v5/p2p/order/release",
    "/spot/v3/private/otc/order/release",
  ];

  for (const path of endpoints) {
    try {
      const data = await bybitPost(apiKey, secret, path, { orderId }) as Record<string, unknown>;
      const code = data.retCode ?? data.ret_code ?? data.code;
      const msg  = String(data.retMsg ?? data.ret_msg ?? data.msg ?? "");

      logger.info({ path, orderId, code, msg }, "Bybit release attempt");

      if (code === 0 || code === "0" || code === 200) {
        return { success: true, orderId, message: "Ордер выпущен", raw: data };
      }
      // If "order not in correct state" or "already released" — treat as OK
      const n = Number(code);
      if (n === 20013 || n === 20014 || msg.toLowerCase().includes("already")) {
        return { success: true, orderId, message: "Уже выпущен", raw: data };
      }
      logger.warn({ path, orderId, code, msg }, "Bybit release non-success, trying next");
    } catch (err) {
      logger.warn({ err, path, orderId }, "Bybit release endpoint exception");
    }
  }
  return { success: false, orderId, message: "Не удалось выпустить ордер" };
}

// ─── Fetch orders by status ───────────────────────────────────────────────────

export async function getBybitPaidOrders(
  apiKey: string,
  secret: string
): Promise<BybitP2POrder[]> {
  const result = await getBybitP2POrders(apiKey, secret, { page: 1, size: 20 });
  // status 20 = paid (buyer paid, waiting for release)
  return result.orders.filter(o => (o.status ?? o.orderStatus) === 20);
}

export function mapBybitStatus(status: number): "pending" | "paid" | "completed" | "cancelled" | "disputed" {
  switch (status) {
    case 10: case 20: return "pending";
    case 30: return "completed";
    case 40: return "cancelled";
    case 50: return "disputed";
    default: return "pending";
  }
}

export function mapBybitSide(side: number): "buy" | "sell" {
  return side === 0 ? "buy" : "sell";
}

// ─── P2P Ads (merchant listings) ─────────────────────────────────────────────

export interface BybitP2PAd {
  itemId: string;
  side: number;        // 0=Buy, 1=Sell
  tokenId: string;
  currencyId: string;
  price: string;
  minAmount: string;
  maxAmount: string;
  quantity: string;    // available amount
  paymentMethods?: Array<{ paymentType: string; realName?: string }>;
  status?: number;     // 1=online, 2=offline
  nickName?: string;
}

// getBybitP2PAds returns active P2P trade orders (pending/paid status).
// Note: /v5/p2p/item/personal/list (merchant listings) requires special P2P API permissions
// that are not available with standard trade API keys.
export async function getBybitP2PAds(
  apiKey: string,
  secret: string,
): Promise<{ ads: BybitP2PAd[]; total: number; rawResponses: Record<string, unknown>[] }> {
  const rawResponses: Record<string, unknown>[] = [];
  const allAds: BybitP2PAd[] = [];
  let total = 0;

  // Fetch active orders (pending + paid) from p2p order list
  // status 10=pending, 20=paid (buyer paid, waiting release)
  const result = await getBybitP2POrders(apiKey, secret, { page: 1, size: 50 });
  rawResponses.push({ source: "order/simplifyList", total: result.total });
  total = result.total;

  for (const order of result.orders) {
    const statusCode = order.status ?? order.orderStatus ?? 0;
    // Map to ad-like shape for UI display
    allAds.push({
      itemId: String(order.id ?? order.orderId ?? ""),
      side: order.side,
      tokenId: (order.notifyTokenId ?? order.tokenId ?? "USDT"),
      currencyId: order.currencyId ?? "VND",
      price: order.price,
      minAmount: "0",
      maxAmount: order.amount,
      quantity: order.notifyTokenQuantity ?? order.quantity ?? "0",
      status: statusCode,
      nickName: order.targetNickName ?? order.nickName ?? undefined,
    });
  }

  return { ads: allAds, total, rawResponses };
}

export async function getBybitAccountInfo(apiKey: string, secret: string): Promise<{ uid?: string; email?: string } | null> {
  try {
    const data = await bybitGet(apiKey, secret, "/v5/user/query-api") as Record<string, unknown>;
    if (data.retCode === 0) {
      const result = data.result as Record<string, unknown>;
      return { uid: String(result.uid ?? ""), email: String(result.email ?? "") };
    }
  } catch (err) {
    logger.warn({ err }, "Bybit account info failed");
  }
  return null;
}
