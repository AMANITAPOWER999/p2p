# P2P Trading Bot

Telegram Mini App + Bot для P2P крипто-торговли на MEXC и Bybit. Управление сделками, отслеживание платежей, аналитика по аккаунтам.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — запустить API сервер (порт 8080)
- `pnpm --filter @workspace/mini-app run dev` — запустить Mini App (порт 18801)
- `pnpm run typecheck` — полная проверка типов
- `pnpm --filter @workspace/api-spec run codegen` — регенерация API хуков из OpenAPI спека
- `pnpm --filter @workspace/db run push` — применить изменения схемы БД (только dev)
- Required env: `DATABASE_URL` — строка подключения к Postgres

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Bot: Telegraf (Telegram bot framework)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Frontend: React + Vite + TailwindCSS v4 + shadcn/ui
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — источник истины для API контрактов
- `lib/db/src/schema/` — схемы БД (accounts, orders, trades, payments, notifications)
- `artifacts/api-server/src/routes/` — маршруты Express
- `artifacts/mini-app/src/` — React фронтенд

## Architecture decisions

- P2P торговля (не spot/futures) — отдельные сущности Order (объявление) и Trade (сделка)
- Telegram бот в polling режиме в dev, webhook в production
- Платежи приходят через endpoint `/api/telegram/payment-notify` (PUSH/SMS/email forwarding)
- 4 аккаунта: Sazykin Vladimir (SeaBank) и Manunin Aleksandr (Vietcombank) на каждой из бирж MEXC и Bybit

## Product

- Dashboard — метрики дня, активные сделки, уведомления
- Trades — список сделок с фильтрами, подтверждение платежа, релиз крипты
- Orders — P2P объявления по аккаунтам, включение/выключение
- Payments — история платежей, incoming/outgoing
- Accounts — 4 торговых аккаунта, добавление API ключей
- Stats — аналитика по объёму, прибыли, сделкам

## User preferences

- Пишем на русском

## Gotchas

- API ключи бирж добавляются через страницу Accounts или через env переменные
- Для получения уведомлений о платежах направить PUSH/SMS уведомления на `/api/telegram/payment-notify`
- В production Telegram бот переключается в webhook режим автоматически
- Установить `TELEGRAM_CHAT_ID` для получения уведомлений о платежах в Telegram
- `TELEGRAM_BOT_TOKEN` нужен для работы бота

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
