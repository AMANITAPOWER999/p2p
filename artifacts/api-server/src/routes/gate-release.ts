import { Router } from "express";
import { getGateP2POrders, releaseGateOrder } from "../lib/gate";

const router = Router();

router.get("/gate/orders", async (req, res) => {
  const apiKey = process.env["GATE_API"];
  const secret = process.env["GATE_API_KEY"];

  if (!apiKey || !secret) {
    res.json({ orders: [], total: 0, note: "Gate ключи не настроены (GATE_API_KEY, GATE_API)" });
    return;
  }
  try {
    const result = await getGateP2POrders(apiKey, secret);
    res.json({ orders: result.orders, total: result.total, rawResponse: result.rawResponse });
  } catch (err) {
    req.log.error(err, "gate/orders failed");
    res.status(500).json({ error: "Ошибка получения ордеров Gate" });
  }
});

router.post("/gate/release/:orderId", async (req, res) => {
  const { orderId } = req.params;
  const apiKey = process.env["GATE_API"];
  const secret = process.env["GATE_API_KEY"];

  if (!apiKey || !secret) {
    res.status(400).json({ error: "Gate ключи не настроены" });
    return;
  }
  try {
    const result = await releaseGateOrder(apiKey, secret, orderId);
    res.json(result);
  } catch (err) {
    req.log.error(err, "gate/release failed");
    res.status(500).json({ error: "Ошибка выпуска ордера Gate" });
  }
});

export default router;
