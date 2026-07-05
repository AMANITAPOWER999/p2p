import { createHmac, createHash } from "crypto";
import { logger } from "./logger";

const GATE_BASE = "https://api.gateio.ws";

function signGate(apiSecret: string, method: string, path: string, query: string, body: string): { sign: string; timestamp: string } {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyHash = createHash("sha512").update(body).digest("hex");
  const prehash = `${method}\n${path}\n${query}\n${bodyHash}\n${timestamp}`;
  const sign = createHmac("sha512", apiSecret).update(prehash).digest("hex");
  return { sign, timestamp };
}

async function gateGet(apiKey: string, apiSecret: string, path: string, params: Record<string, string> = {}): Promise<unknown> {
  const query = new URLSearchParams(params).toString();
  const { sign, timestamp } = signGate(apiSecret, "GET", path, query, "");
  const url = `${GATE_BASE}${path}${query ? "?" + query : ""}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "KEY": apiKey,
      "SIGN": sign,
      "Timestamp": timestamp,
    },
  });
  const text = await res.text();
  if (!text.trim()) return [];
  try { return JSON.parse(text); } catch { return { error: text, status: res.status }; }
}

async function gatePost(apiKey: string, apiSecret: string, path: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const bodyStr = JSON.stringify(body);
  const { sign, timestamp } = signGate(apiSecret, "POST", path, "", bodyStr);
  const res = await fetch(`${GATE_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "KEY": apiKey,
      "SIGN": sign,
      "Timestamp": timestamp,
    },
    body: bodyStr,
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { error: text, status: res.status }; }
}

export interface GateP2POrder {
  id: string;
  side: string;       // "buy" | "sell"
  currency: string;   // crypto
  fiat_currency: string;
  amount: string;
  fiat_amount: string;
  price: string;
  status: string;     // "open","paid","finished","cancelled"
  nick_name?: string;
  create_time?: string;
  finish_time?: string;
}

export interface GateP2PResult {
  orders: GateP2POrder[];
  total: number;
  rawResponse?: unknown;
}

export async function getGateP2POrders(apiKey: string, apiSecret: string): Promise<GateP2PResult> {
  const endpoints = [
    { path: "/api/v4/p2p/orders", params: { limit: "20" } },
    { path: "/api/v4/p2p/order/list", params: { limit: "20" } },
  ];

  for (const ep of endpoints) {
    try {
      const data = await gateGet(apiKey, apiSecret, ep.path, ep.params);
      logger.info({ path: ep.path, response: JSON.stringify(data).slice(0, 300) }, "Gate P2P raw response");

      if (Array.isArray(data)) {
        logger.info({ path: ep.path, ordersFound: data.length }, "Gate P2P: success (array)");
        return { orders: data as GateP2POrder[], total: data.length, rawResponse: data };
      }

      const d = data as Record<string, unknown>;
      if (d.label || d.message) {
        logger.warn({ path: ep.path, err: d }, "Gate P2P error, trying next");
        continue;
      }

      const list = d.data ?? d.orders ?? d.list ?? d.items ?? [];
      if (Array.isArray(list)) {
        logger.info({ path: ep.path, ordersFound: list.length }, "Gate P2P: success");
        return { orders: list as GateP2POrder[], total: list.length, rawResponse: data };
      }
    } catch (err) {
      logger.warn({ err, path: ep.path }, "Gate P2P endpoint exception");
    }
  }
  return { orders: [], total: 0, rawResponse: { error: "All Gate P2P endpoints failed" } };
}

export async function getGatePaidOrders(apiKey: string, apiSecret: string): Promise<GateP2POrder[]> {
  const result = await getGateP2POrders(apiKey, apiSecret);
  return result.orders.filter(o => o.status === "paid");
}

export interface GateReleaseResult {
  success: boolean;
  orderId: string;
  message: string;
  raw?: unknown;
}

export async function releaseGateOrder(apiKey: string, apiSecret: string, orderId: string): Promise<GateReleaseResult> {
  const endpoints = [
    `/api/v4/p2p/orders/${orderId}/release`,
    `/api/v4/p2p/order/${orderId}/release`,
  ];

  for (const path of endpoints) {
    try {
      const data = await gatePost(apiKey, apiSecret, path) as Record<string, unknown>;
      logger.info({ path, orderId, data: JSON.stringify(data).slice(0, 200) }, "Gate release attempt");

      if (data.label || data.message) {
        const msg = String(data.message ?? data.label ?? "");
        if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("finished")) {
          return { success: true, orderId, message: "Уже выпущен", raw: data };
        }
        logger.warn({ path, msg }, "Gate release non-success, trying next");
        continue;
      }
      return { success: true, orderId, message: "Ордер выпущен", raw: data };
    } catch (err) {
      logger.warn({ err, path }, "Gate release exception");
    }
  }
  return { success: false, orderId, message: "Не удалось выпустить ордер Gate" };
}

export function mapGateStatus(status: string): "pending" | "paid" | "completed" | "cancelled" | "disputed" {
  switch (status) {
    case "open": return "pending";
    case "paid": return "paid";
    case "finished": return "completed";
    case "cancelled": return "cancelled";
    case "disputed": return "disputed";
    default: return "pending";
  }
}
