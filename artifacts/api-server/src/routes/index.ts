import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accountsRouter from "./accounts";
import ordersRouter from "./orders";
import tradesRouter from "./trades";
import paymentsRouter from "./payments";
import statsRouter from "./stats";
import notificationsRouter from "./notifications";
import telegramRouter from "./telegram";
import importRouter from "./import";
import mexcSyncRouter from "./mexc-sync";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountsRouter);
router.use(ordersRouter);
router.use(tradesRouter);
router.use(paymentsRouter);
router.use(statsRouter);
router.use(notificationsRouter);
router.use(telegramRouter);
router.use(importRouter);
router.use(mexcSyncRouter);

export default router;
