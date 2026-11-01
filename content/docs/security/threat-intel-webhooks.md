---
sidebar_position: 5
title: Threat Intel & Webhooks
description: Auto-sync external IP blocklists or a CrowdSec LAPI into the blocklist, and forward signed request events to a webhook asynchronously.
keywords: [threat intel, webhooks, slack, discord, ip blocklist sync, crowdsec, lapi, hmac]
---


## Threat-intel auto-sync

- A background worker periodically downloads external **plain-text IP block lists**, parses out
  IP/CIDR tokens (ignoring `#`/`;` comments, capped at a 10 MiB read), and writes them into the
  database.
- The IP blocklist reads from the same store, so synced IPs take effect **immediately via hot
  reload** — no restart.
- A **"sync now"** button in the dashboard fetches a single source on demand.

Add a source on the **Threat Intel** page (`/admin/threat-intel`) with a **label**, a **URL** to a
plain-text IP/CIDR list, and a sync **interval (hours)**. Each row can be toggled, synced now, or
deleted, and shows how many IPs and ranges it holds. See the
[dashboard walkthrough](/docs/configuration/dashboard).

Lookups use a sorted, merged range set searched by binary search (IPv4 and IPv6), so even feeds with
hundreds of thousands of ranges cost next to nothing per request. Feed blocks are logged as
`ip_blocked_intel`.

## CrowdSec

Palisade can act as a [CrowdSec](https://www.crowdsec.net) bouncer. Register a bouncer on your
CrowdSec host (`cscli bouncers add palisade`), then fill in the **CrowdSec LAPI** form on the Threat
Intel page with a label, the LAPI URL (for example `http://127.0.0.1:8080`) and the bouncer key
(`POST /admin/threat-intel/crowdsec`).

- Palisade polls `GET /v1/decisions/stream` every 30 seconds: the full set on startup, then only
  changes.
- `ban` decisions on `Ip` and `Range` scopes are applied. `captcha` decisions are ignored.
- Each decision expires after its own duration.
- If the LAPI is unreachable, the last known decisions stay in force.
- Blocks are logged as `ip_blocked:crowdsec`.

The bouncer key is encrypted with the other secrets, never shown again, and deleted with the
source.

## Webhook event delivery

- Forwards request events to a configured webhook endpoint, **fully asynchronously** — delivery runs
  on a background goroutine reading off a 500-entry buffered queue, so a slow or unreachable endpoint
  never blocks the logging pipeline. If the queue is ever full, new events are **dropped silently**
  rather than backing up the log worker.
- Each delivery is an `HTTP POST` with `Content-Type: application/json` and a 5-second client
  timeout. The body is the **full logged request row** (JSON-marshaled `storage.RequestLog` — the
  same fields as a log detail view: timestamp, app, IP, method, path, status, country, ASN, JA4, the
  matched WAF rule/action, etc.).
- Delivery is filtered by a configurable, comma-separated **event list** managed from the dashboard.
  If no events are selected it defaults to `blocked`.

  | Category | Matches |
  |---|---|
  | `blocked` | Any request the pipeline blocked (`entry.Blocked == true`) — IP/geo/WAF/rate-limit denials. |
  | `challenged` | Redirected to the bot challenge — matched by prefix, so both the plain `bot_challenge` action and the adaptive-enforcement-forced `bot_challenge:adaptive` variant count. |
  | `proxied` | Requests that were neither blocked nor challenged. |
  | `scripts` | A new script source seen by a service's [script inventory](/docs/security/script-inventory) (action `csp_new_script`, the source in `Host`). |
  | `all` | Everything above. |

- **Deliveries are signed.** If `webhook_secret` is set, every delivery carries an
  `X-WAF-Signature-256: sha256=<hex>` header: an HMAC-SHA256 of the raw body with your secret, in the
  same format as GitHub's `X-Hub-Signature-256`. Recompute it over the body you received and compare
  in constant time. The secret itself is never sent. (Releases before v1.9.5 sent it verbatim as
  `X-WAF-Secret`.)

Configure it under **Settings → Webhooks** (`POST /admin/settings/webhook` with
`webhook_destination_type` = `generic`/`slack`/`discord`, `webhook_url`, `webhook_secret`,
`webhook_enabled=1`, and one or more `webhook_events` checkboxes). Slack and Discord get formatted
messages from their incoming-webhook URLs. **Send test alert** posts a synthetic block.

### Receiving a delivery

The generic payload marshals with the Go struct's exact (capitalized) field names — not
`snake_case`:

```text
POST /your-endpoint HTTP/1.1
Content-Type: application/json
User-Agent: palisade/internal/notify/webhook
X-WAF-Signature-256: sha256=5d41402abc4b2a76b9719d911017c592...

{
  "ID": 1042,
  "Timestamp": "2026-07-11T12:51:34Z",
  "AppName": "gemsofcongress",
  "RealIP": "203.0.113.10",
  "ProxyIP": "104.16.0.1",
  "Country": "US",
  "Method": "PATCH",
  "Host": "cdn.gemsofcongress.com",
  "Path": "/api/v1/posts/27",
  "Query": "",
  "Status": 403,
  "Blocked": true,
  "RuleID": 911100,
  "Action": "deny",
  "UserAgent": "node",
  "Duration": 4,
  "RequestID": "a1b2c3d4e5f6",
  "Proto": "HTTP/2.0",
  "TLSVersion": "TLS 1.3",
  "TLSCipher": "TLS_AES_128_GCM_SHA256",
  "TLSSNI": "cdn.gemsofcongress.com",
  "ASN": 13335,
  "Org": "Cloudflare, Inc.",
  "JA3Hash": "",
  "JA4": "t13d1516h2_8daaf6152771_02713d6af862",
  "VisitorID": "",
  "BotScore": 0,
  "CacheStatus": ""
}
```

Request headers are **not** included, so credentials and cookies never leave Palisade through a
webhook.

A minimal receiver check in Python:

```python
import hmac, hashlib

def valid(secret: bytes, body: bytes, header: str) -> bool:
    want = "sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, header)
```

A non-2xx response is logged server-side but **never retried** — treat the webhook as best-effort
notification, not a guaranteed-delivery queue.
