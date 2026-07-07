import { createHmac } from "crypto";
import { logger } from "./logger";

const BITGET_BASE = "https://api.bitget.com";

function signBitget(timestamp: string, method: string, path: string, body: string, secret: string): string {
  const prehash = `${timestamp}${method.toUpperCase()}${path}${body}`;
  return createHmac("sha256", secret).update(prehash).digest("base64");
}

function bitgetHeaders(apiKey: string, secret: string, passphrase: string, method: string, path: string, body = "") {
  const timestamp = Date.now().toString();
  const sign = signBitget(timestamp, method, path, body, secret);
  return {
    "Content-Type": "application/json",
    "ACCESS-KEY": apiKey,
    "ACCESS-SIGN": sign,
    "ACCESS-TIMESTAMP": timestamp,
    "ACCESS-PASSPHRASE": passphrase,
    "ACCESS-VERSION": "2",
  };
}

async function bitgetGet(
  apiKey: string, secret: string, passphrase: string,
  path: string, params: Record<string, string> = {}
): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  const fullPath = qs ? `${path}?${qs}` : path;
  const headers = bitgetHeaders(apiKey, secret, passphrase, "GET", fullPath);
  const res = await fetch(`${BITGET_BASE}${fullPath}`, { method: "GET", headers });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { error: text, status: res.status }; }
}

async function bitgetPost(
  apiKey: string, secret: string, passphrase: string,
  path: string, body: Record<string, unknown> = {}
): Promise<unknown> {
  const bodyStr = JSON.stringify(body);
  const headers = bitgetHeaders(apiKey, secret, passphrase, "POST", path, bodyStr);
  const res = await fetch(`${BITGET_BASE}${path}`, { method: "POST", headers, body: bodyStr });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { error: text, status: res.status }; }
}

export interface BitgetP2POrder {
  orderId: string;
  side: string;         // "BUY" | "SELL"
  coinName?: string;    // "USDT"
  currencyName?: string; // "VND"
  totalPrice?: string;  // fiat amount
  orderAmount?: string; // fiat amount (alt field)
  price?: string;
  amount?: string;      // crypto amount
  status?: string;      // "INIT"|"PENDING"|"PAID"|"COMPLETE"|"COMPLETED"|"CANCEL"|"CANCELLED"
  orderStatus?: string;
  nickName?: string;
  counterNickName?: string;
  createTime?: string;
  updateTime?: string;
}

export interface BitgetP2PResult {
  orders: BitgetP2POrder[];
  total: number;
  rawResponse?: unknown;
}

export async function getBitgetP2POrders(
  apiKey: string, secret: string, passphrase: string,
  params: { page?: number; limit?: number } = {}
): Promise<BitgetP2PResult> {
  const page = String(params.page ?? 1);
  const limit = String(params.limit ?? 20);

  const endpoints = [
    { path: "/api/v2/p2p/merchantTrade/orderList", p: { pageNo: page, pageSize: limit } },
    { path: "/api/v2/p2p/order/list",              p: { pageNo: page, pageSize: limit } },
    { path: "/api/v2/p2p/order/advancedList",      p: { pageNo: page, pageSize: limit } },
  ];

  for (const ep of endpoints) {
    try {
      const data = await bitgetGet(apiKey, secret, passphrase, ep.path, ep.p) as Record<string, unknown>;
      logger.info({ path: ep.path, response: JSON.stringify(data).slice(0, 400) }, "Bitget P2P raw response");

      const code = data.code ?? data.retCode;
      if (code !== "00000" && code !== 0 && code !== "0" && code !== 200) {
        logger.warn({ path: ep.path, code, msg: data.msg ?? data.message }, "Bitget P2P non-success, trying next");
        continue;
      }

      const rawData = (data.data ?? data.result ?? {}) as Record<string, unknown>;
      const list = rawData.orderList ?? rawData.list ?? rawData.rows ?? rawData.data ?? rawData.orders ?? [];
      const total = Number(rawData.total ?? rawData.totalCount ?? (Array.isArray(list) ? list.length : 0));
      const orders = Array.isArray(list) ? (list as BitgetP2POrder[]) : [];

      logger.info({ path: ep.path, ordersFound: orders.length, total }, "Bitget P2P: success");
      return { orders, total, rawResponse: data };
    } catch (err) {
      logger.warn({ err, path: ep.path }, "Bitget P2P endpoint exception");
    }
  }

  return { orders: [], total: 0, rawResponse: { error: "All Bitget P2P endpoints failed" } };
}

export async function getBitgetPaidOrders(
  apiKey: string, secret: string, passphrase: string
): Promise<BitgetP2POrder[]> {
  const result = await getBitgetP2POrders(apiKey, secret, passphrase, { page: 1, limit: 20 });
  return result.orders.filter(o => {
    const s = (o.status ?? o.orderStatus ?? "").toUpperCase();
    return s === "PAID" || s === "BUYER_PAID";
  });
}

export interface BitgetReleaseResult {
  success: boolean;
  orderId: string;
  message: string;
  raw?: unknown;
}

export async function releaseBitgetOrder(
  apiKey: string, secret: string, passphrase: string, orderId: string
): Promise<BitgetReleaseResult> {
  const endpoints = [
    "/api/v2/p2p/merchantTrade/releaseOrder",
    "/api/v2/p2p/order/release",
  ];

  for (const path of endpoints) {
    try {
      const data = await bitgetPost(apiKey, secret, passphrase, path, { orderId }) as Record<string, unknown>;
      const code = data.code ?? data.retCode;
      const msg = String(data.msg ?? data.message ?? data.retMsg ?? "");

      logger.info({ path, orderId, code, msg }, "Bitget release attempt");

      if (code === "00000" || code === 0 || code === "0" || code === 200) {
        return { success: true, orderId, message: "Ордер выпущен", raw: data };
      }
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("released") || msg.toLowerCase().includes("complete")) {
        return { success: true, orderId, message: "Уже выпущен", raw: data };
      }
      logger.warn({ path, orderId, code, msg }, "Bitget release non-success, trying next");
    } catch (err) {
      logger.warn({ err, path, orderId }, "Bitget release exception");
    }
  }
  return { success: false, orderId, message: "Не удалось выпустить ордер Bitget" };
}

export function mapBitgetStatus(status: string): "pending" | "paid" | "completed" | "cancelled" | "disputed" {
  const s = (status ?? "").toUpperCase();
  switch (s) {
    case "INIT":
    case "PENDING": return "pending";
    case "PAID":
    case "BUYER_PAID": return "paid";
    case "COMPLETE":
    case "COMPLETED": return "completed";
    case "CANCEL":
    case "CANCELLED": return "cancelled";
    case "APPEAL": return "disputed";
    default: return "pending";
  }
}

export function mapBitgetSide(side: string): "buy" | "sell" {
  return (side ?? "").toUpperCase() === "BUY" ? "buy" : "sell";
}
