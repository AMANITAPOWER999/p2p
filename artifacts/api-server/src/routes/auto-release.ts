import { Router } from "express";
import { autoReleaseState, startAutoRelease, stopAutoRelease } from "../lib/scheduler";

const router = Router();

const ALL_EXCHANGES = ["bybit", "mexc", "okx", "binance", "gate", "kucoin", "htx", "bitget"] as const;

const UNSUPPORTED_REASON: Record<string, string> = {
  mexc:    "Нет API выпуска",
  okx:     "Нет API ключей",
  binance: "Нет API ключей",
  gate:    "Нет API ключей",
  kucoin:  "Нет API ключей",
  htx:     "Нет API ключей",
  bitget:  "Нет API ключей",
};

function getExchangeState(exchange: string) {
  if (exchange === "bybit") {
    return {
      enabled: autoReleaseState.enabled,
      running: autoReleaseState.running,
      releasedCount: autoReleaseState.releasedCount,
      lastCheckAt: autoReleaseState.lastCheckAt?.toISOString() ?? null,
      supported: !!(process.env["BYBIT_API_KEY"] && process.env["BYBIT_API_SECRET"]),
    };
  }
  return {
    enabled: false,
    running: false,
    releasedCount: 0,
    lastCheckAt: null,
    supported: false,
    reason: UNSUPPORTED_REASON[exchange] ?? "Нет API ключей",
  };
}

router.get("/auto-release/status", (_req, res) => {
  const result: Record<string, unknown> = {};
  for (const ex of ALL_EXCHANGES) {
    result[ex] = getExchangeState(ex);
  }
  res.json(result);
});

router.post("/auto-release/:exchange/enable", (req, res) => {
  const exchange = req.params.exchange.toLowerCase();
  if (exchange === "bybit") {
    const delayMs = Number(req.body?.delayMs ?? 0);
    startAutoRelease(delayMs);
    return res.json({ success: true, enabled: true });
  }
  return res.status(400).json({
    success: false,
    error: UNSUPPORTED_REASON[exchange] ?? "Авто-выпуск для этой биржи не поддерживается",
  });
});

router.post("/auto-release/:exchange/disable", (req, res) => {
  const exchange = req.params.exchange.toLowerCase();
  if (exchange === "bybit") {
    stopAutoRelease();
    return res.json({ success: true, enabled: false });
  }
  return res.status(400).json({
    success: false,
    error: UNSUPPORTED_REASON[exchange] ?? "Авто-выпуск для этой биржи не поддерживается",
  });
});

export default router;
