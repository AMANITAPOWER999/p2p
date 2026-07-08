---
name: Cloudflare Workers deployment via REST API
description: How to deploy a CF Worker programmatically using account ID + API token, without wrangler CLI
---

## When to use
No Replit-native Cloudflare integration exists that supports deploying Workers (only OAuth connector for zones/DNS/R2). For Workers deployment, get the user's CF Account ID + an API Token (Workers Edit template) as two secrets, then deploy via curl/REST API directly — no wrangler needed.

## Deploy a module-format worker
```
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts/<name>" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2024-01-01"};type=application/json' \
  -F "worker.js=@path/to/worker.js;filename=worker.js;type=application/javascript+module"
```
**Gotcha**: the multipart field for the script MUST include an explicit `filename=` attribute matching `main_module`, or the API fails with "No such module: worker.js" (code 10021), even though the field name already looks correct.

**Gotcha**: worker script must use ES module export syntax (`export default { async fetch(request) {...} }`), not the legacy `addEventListener("fetch", ...)` service-worker syntax — the latter fails with "no registered event handlers" (code 10068) when uploaded as `main_module`.

## Enable public URL
Worker scripts are not reachable until the workers.dev subdomain is enabled per-script:
```
curl -X POST ".../accounts/${CF_ACCOUNT_ID}/workers/scripts/<name>/subdomain" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" -d '{"enabled": true, "previews_enabled": false}'
```
Get the account's subdomain prefix via `GET .../accounts/${CF_ACCOUNT_ID}/workers/subdomain` → URL is `https://<script-name>.<subdomain>.workers.dev`.

## Propagation delay
After redeploying a script, the OLD version can still serve for ~10-15s (edge propagation across PoPs) even though the deployments API already reports the new version at 100%. Don't conclude a deploy failed from an immediate re-test — wait and retry before debugging further.

## Testing gotcha
If the worker's whole purpose is to bypass geo-blocking by running at the PoP nearest the caller, testing it via curl from the agent's own (US-based) shell will hit a US PoP and reproduce the same geo-block. This is expected — only real end-user browsers in the target region will get correct results.
