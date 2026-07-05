import { createHmac } from "crypto";
import { logger } from "./logger";

const OKX_BASE = "https://www.okx.com";

function signOkx(timestamp: string, method: string, path: string, body: string, secret: string): string {
  const prehash = `${timestamp}${method}${path}${body}`;
  return createHmac("sha256", secret).update(prehash).digest("base64");
}

function okxHeaders(apiKey: string, secret: string, passphrase: string, method: string, path: string, body = "") {
  const timestamp = new Date().toISOString();
  const sign = signOkx(timestamp, method, path, body, secret);
  return {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "x-simulated-trading": "0",
  };
}

async function okxGet(apiKey: string, secret: string, passphrase: string, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  const fullPath = qs ? `${path}?${qs}` : path;
  const headers = okxHeaders(apiKey, secret, passphrase, "GET", fullPath);
  const res = await fetch(`${OKX_BASE}${fullPath}`, { method: "GET", headers });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { error: text, status: res.status }; }
}

async function okxPost(apiKey: string, secret: string, passphrase: string, path: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const bodyStr = JSON.stringify(body);
  const headers = okxHeaders(apiKey, secret, passphrase, "POST", path, bodyStr);
  const res = await fetch(`${OKX_BASE}${path}`, { method: "POST", headers, body: bodyStr });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { error: text, status: res.status }; }
}

export interface OkxP2POrder {
  ordId: string;
  side: string;       // "buy" | "sell"
  ccy: string;        // crypto currency
  fiatCcy: string;
  amt: string;        // crypto amount
  fiatAmt: string;
  price: string;
  state: string;      // "1"=pending,"2"=paid,"3"=completed,"4"=cancelled
  nickName?: string;
  cTime?: string;
  uTime?: string;
}

export interface OkxP2PResult {
  orders: OkxP2POrder[];
  total: number;
  rawResponse?: unknown;
}

export async function getOkxP2POrders(apiKey: string, secret: string, passphrase: string): Promise<OkxP2PResult> {
  const endpoints = [
    { method: "get" as const, path: "/api/v5/p2p/orders", params: { limit: "20" } },
    { method: "get" as const, path: "/api/v5/p2p/order/list", params: { limit: "20" } },
    { method: "get" as const, path: "/api/v5/c2c/orders", params: { limit: "20" } },
  ];

  for (const ep of endpoints) {
    try {
      const data = await okxGet(apiKey, secret, passphrase, ep.path, ep.params) as Record<string, unknown>;
      logger.info({ path: ep.path, response: JSON.stringify(data).slice(0, 300) }, "OKX P2P raw response");

      const code = data.code ?? data.retCode;
      if (code !== "0" && code !== 0) {
        logger.warn({ path: ep.path, code, msg: data.msg }, "OKX P2P non-success, trying next");
        continue;
      }

      const rawData = data.data;
      const list = Array.isArray(rawData) ? rawData
        : Array.isArray((rawData as Record<string, unknown>)?.list) ? (rawData as Record<string, unknown>).list
        : [];
      const orders = (list as OkxP2POrder[]);
      logger.info({ path: ep.path, ordersFound: orders.length }, "OKX P2P: success");
      return { orders, total: orders.length, rawResponse: data };
    } catch (err) {
      logger.warn({ err, path: ep.path }, "OKX P2P endpoint exception");
    }
  }
  return { orders: [], total: 0, rawResponse: { error: "All OKX P2P endpoints failed" } };
}

export async function getOkxPaidOrders(apiKey: string, secret: string, passphrase: string): Promise<OkxP2POrder[]> {
  const result = await getOkxP2POrders(apiKey, secret, passphrase);
  return result.orders.filter(o => o.state === "2");
}

export interface OkxReleaseResult {
  success: boolean;
  orderId: string;
  message: string;
  raw?: unknown;
}

export async function releaseOkxOrder(apiKey: string, secret: string, passphrase: string, orderId: string): Promise<OkxReleaseResult> {
  const endpoints = [
    "/api/v5/p2p/orders/release",
    "/api/v5/c2c/orders/release",
  ];

  for (const path of endpoints) {
    try {
      const data = await okxPost(apiKey, secret, passphrase, path, { ordId: orderId }) as Record<string, unknown>;
      const code = data.code ?? data.retCode;
      const msg = String(data.msg ?? data.retMsg ?? "");
      logger.info({ path, orderId, code, msg }, "OKX release attempt");

      if (code === "0" || code === 0) {
        return { success: true, orderId, message: "Ордер выпущен", raw: data };
      }
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("released")) {
        return { success: true, orderId, message: "Уже выпущен", raw: data };
      }
      logger.warn({ path, code, msg }, "OKX release non-success, trying next");
    } catch (err) {
      logger.warn({ err, path }, "OKX release exception");
    }
  }
  return { success: false, orderId, message: "Не удалось выпустить ордер OKX" };
}

export function mapOkxStatus(state: string): "pending" | "paid" | "completed" | "cancelled" | "disputed" {
  switch (state) {
    case "1": return "pending";
    case "2": return "paid";
    case "3": return "completed";
    case "4": return "cancelled";
    case "5": return "disputed";
    default: return "pending";
  }
}
