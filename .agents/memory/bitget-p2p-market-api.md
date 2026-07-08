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

## Geo-restriction — CORRECTED understanding
Server-side (Replit US datacenter): returns 00000 success but dataList always empty.
Realistic browser headers (Chrome UA, Origin/Referer set) from a US/datacenter IP: still empty — so it's not just a missing-header/UA check.
Tested through ~8 public HTTP proxies geolocated in Vietnam/Indonesia/Philippines/etc: the ones that connected still returned empty dataList. This means the block is NOT purely country-based — it also (or instead) fingerprints/blocks known datacenter, hosting, and public-proxy IP ranges regardless of country. A Cloudflare Worker's outbound `fetch()` also egresses from Cloudflare's own IP pool (not the visiting browser's IP), so the "Worker executes near the caller" theory does NOT guarantee a residential-looking source IP to Bitget — this was an unverified assumption in the original fix and should not be treated as proven.
Only a genuine residential/mobile ISP IP in an allowed country (verified by a real end user opening the Telegram mini-app on their own device/network) can confirm whether the feature truly works — this has NOT yet been confirmed with real user data as of 2026-07-08.
Sanity check: non-P2P Bitget public endpoints (e.g. spot ticker) respond normally (proper param-validation errors) from the same blocked environment — confirming the restriction is specific to the P2P `queryAdvList` endpoint's anti-fraud/anti-scraping layer, not a blanket domain block.

## What does NOT work
- api.bitget.com advList → 60004 (own ads only)
- www.bitget.com/v1/p2p/advertisement/list → 404
- POST api.bitget.com → 40009 sign error
- Any server-side, US-origin, or datacenter/public-proxy-origin call (including a CF Worker, even when routed through Asia-geolocated public proxies) → empty dataList
- GET on queryAdvList → 405, must be POST
