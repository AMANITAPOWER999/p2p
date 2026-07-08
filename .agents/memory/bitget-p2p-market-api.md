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
- Direct navigation to bitget.com via Cloudflare Browser Rendering + script injection to force VND selection → blocked by bitget.com's CSP (Trusted Types)

## Working free workaround: p2p.army aggregator (found 2026-07-08)
`https://p2p.army/en/p2p/prices/bitget/{currency}/{coin}` (e.g. `.../bitget/VND/USDT`) is a free public
page that already aggregates live Bitget P2P buy/sell prices per payment method. It's client-rendered
(plain curl/fetch shows no data), so it must be rendered with Cloudflare Browser Rendering's `/content`
endpoint, then parsed via regex on the `<tr>` rows (payment method name, `data-tooltip-content` for
buy/sell price, ads counts). This gives per-payment-method prices but NOT per-order min/max amounts
(no individual merchant listings), so the same price list is reused across amount tiers.
**Why:** Bitget's own queryAdvList is unconditionally geo/IP-blocked (see above) with no known bypass;
p2p.army already solved the scraping problem and re-publishes the aggregated data.
**Gotcha — CF Browser Rendering free-tier limits:** Workers Free plan grants only ~10 min of browser
rendering time/day and throttles to ~1 request/10s. A polling UI that fires buy+sell requests together
will race past a naive TTL cache and double-call the CF API, tripping "rate limit exceeded" (code 2001).
Fix: dedupe with a shared in-flight promise (not just a TTL cache) so concurrent callers await one
fetch, and use a multi-minute cache TTL (we use 5 min) to stay within the daily browser-hours budget.
A paid CF Workers plan removes the browser-hours cap entirely if fresher data is needed later.

## Free proxy bypass attempt — CONCLUSIVE NEGATIVE (2026-07-08)
Tested 570 free public proxies (HTTP/HTTPS/SOCKS4/SOCKS5) from VN/TH/ID/PH/MY/SG, sourced from
proxyscrape.com and geonode.com (including some labeled as residential ISP, e.g. Viettel), against
`queryAdvList`. Only 18 even connected; all 18 returned an empty `dataList`, same as our own server IP.
**Conclusion:** the block is not purely country-based — it fingerprints/blocks datacenter and known
public-proxy IP ranges regardless of geolocation or ISP label. Free proxy lists will not bypass it;
only a genuine residential/mobile IP from a real end-user's own device/network could. Do not re-attempt
this with more free proxy lists — it has been tried exhaustively (8 proxies earlier + 570 here) with
a 0% success rate. A paid residential proxy service is the only remaining technical bypass, at a cost.

## Real merchant nicknames DO exist via our own authenticated Bitget API keys, but without prices
`GET /api/v2/p2p/merchantList` (HMAC-signed, same auth as our orderList calls) is NOT geo-blocked and
returns real merchant nicknames + reputation stats (completion rate, avg payment/release time). BUT it
is a global merchant directory with no coin/fiat/price/side filtering or fields — it cannot be joined
with p2p.army's per-payment-method prices to produce an honest "real name + real price" row. Also,
`GET /api/v2/p2p/advList` only ever returns the caller's OWN ads (by design, not geo-block) — useless
for third-party market listings.
