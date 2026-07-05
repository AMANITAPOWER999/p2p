import { Router } from "express";
import { getOkxP2POrders, releaseOkxOrder } from "../lib/okx";

const router = Router();

router.get("/okx/orders", async (req, res) => {
  const apiKey = process.env["OKX_API"];
  const secret = process.env["OKX_API_KEY"];
  const passphrase = process.env["OKX_PASSPHRASE"] ?? "";

  if (!apiKey || !secret) {
    res.json({ orders: [], total: 0, note: "OKX ключи не настроены (OKX_API_KEY, OKX_API)" });
    return;
  }
  try {
    const result = await getOkxP2POrders(apiKey, secret, passphrase);
    res.json({ orders: result.orders, total: result.total, rawResponse: result.rawResponse });
  } catch (err) {
    req.log.error(err, "okx/orders failed");
    res.status(500).json({ error: "Ошибка получения ордеров OKX" });
  }
});

router.post("/okx/release/:orderId", async (req, res) => {
  const { orderId } = req.params;
  const apiKey = process.env["OKX_API"];
  const secret = process.env["OKX_API_KEY"];
  const passphrase = process.env["OKX_PASSPHRASE"] ?? "";

  if (!apiKey || !secret) {
    res.status(400).json({ error: "OKX ключи не настроены" });
    return;
  }
  try {
    const result = await releaseOkxOrder(apiKey, secret, passphrase, orderId);
    res.json(result);
  } catch (err) {
    req.log.error(err, "okx/release failed");
    res.status(500).json({ error: "Ошибка выпуска ордера OKX" });
  }
});

export default router;
