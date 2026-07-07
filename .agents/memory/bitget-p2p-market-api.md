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
Browser-side (user's real IP): returns actual listings.
**Fix**: fetchBitgetP2PDirect() in dashboard.tsx calls Bitget directly from browser.

## What does NOT work
- api.bitget.com advList → 60004 (own ads only)
- www.bitget.com/v1/p2p/advertisement/list → 404
- POST api.bitget.com → 40009 sign error
- Any server-side call → geo-blocked empty dataList
