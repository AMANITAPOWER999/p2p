---
name: Bitget P2P Market API
description: How to fetch Bitget P2P market listings — geo-restriction workaround via client-side fetch
---

## Real endpoint
`POST https://www.bitget.com/v1/p2p/pub/adv/queryAdvList`
Response: `{ data: { dataList: [...], hasNextPage, pageSize } }`
Item fields: `nickName`, `price`, `minOrderAmount`, `maxOrderAmount`

## Working body
`{ coinName: "USDT", fiatCode: "VND", tradeType: "1", pageNo: 1, pageSize: 20 }`
- tradeType "1" and "2" are valid; other values → 40002
- Do NOT include: paymethodIds, sort, queryType, isOwner → cause 40002

## CORS: access-control-allow-origin: * (public, no auth needed)

## Geo-restriction
Server-side (Replit US datacenter): returns 00000 success but dataList always empty — Cloudflare geo-blocks datacenter IPs.
Browser-side call directly from app origin: blocked by CORS preflight in practice (403 on OPTIONS) despite `access-control-allow-origin: *` on the real response — direct client fetch doesn't reliably work either.
**Working fix**: a Cloudflare Worker (see cloudflare-workers-deploy.md) as a pass-through proxy, called from the browser. CF Workers execute at the PoP nearest the caller, so a Vietnam-based browser → Worker runs on an Asian PoP → Bitget sees a non-US IP → real data. The SAME worker invoked from a US Replit shell/server still gets geo-blocked (empty dataList) — this is expected and not a bug; only real end-user (non-US) browsers get valid data.

## What does NOT work
- api.bitget.com advList → 60004 (own ads only)
- www.bitget.com/v1/p2p/advertisement/list → 404
- POST api.bitget.com → 40009 sign error
- Any server-side or US-origin call (including a CF Worker invoked from a US IP) → geo-blocked empty dataList
