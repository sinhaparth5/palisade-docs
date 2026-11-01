---
sidebar_position: 3
title: REST API
description: Bearer-token authenticated API for services, IP rules, bans, custom WAF rules and metrics, separate from the dashboard's session cookie.
keywords: [rest api, bearer token, api keys, services api, ip rules api, custom waf rules api]
---


Alongside the session-cookie dashboard, Palisade exposes a `Bearer`-token authenticated REST
API at **`{admin path}/api/v1/*`** (default `/admin/api/v1`) — a separate Echo route group, sibling
to the dashboard group rather than nested inside it.

:::info[Why bearer tokens instead of the session cookie]
A bearer token carried in an `Authorization` header, unlike a cookie, isn't automatically attached by
the browser to cross-site requests — so this group intentionally skips the dashboard's
session-cookie auth *and* CSRF middleware, both of which exist specifically to stop cookie-based
cross-site request forgery, not to gate a header-based token.
:::

## Creating a key

1. Go to **Settings → API Keys**, enter a name, and click **Create key**
   (see [API Keys](/docs/configuration/dashboard#settings)). Only **owners** can create and revoke
   keys.
2. The **full key is shown exactly once** (`cwaf_` + 40 hex characters) — copy it immediately. Only a
   SHA-256 hash and a short display prefix are persisted, so it cannot be shown again — only revoked
   and replaced with a new one.
3. Send it on every request: `Authorization: Bearer cwaf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.

## Read-only keys

Check **Read-only** when creating a key to scope it to `GET` requests. A read-only key reaches every
endpoint below for reading, but any `POST`/`PUT`/`DELETE` on that key returns `403` with
`{"error": "this API key is read-only"}` — the request never touches the underlying service, so it's
safe to hand to a monitoring dashboard or a status page that has no business changing configuration.
The **Read-only** badge on a key's row in **Settings → API Keys** shows which keys are scoped this way.
A key created without the checkbox is full read-write, as before.

## Brute-force protection

Failed auth attempts (missing/malformed header, unknown key) are throttled **per client IP** with the
same policy as the dashboard login: 5 failures in 15 minutes triggers a 15-minute lockout, returned as
`429` with a `Retry-After`-style message. See
[Trusted-Proxy / Real Client IP](/docs/security/trusted-proxy) for how the client IP is resolved
behind a proxy.

## Endpoints

All request/response bodies are JSON. Every endpoint reuses the exact same `storage.DB` /
`services.Registry` / `blocklist.IPBlocklist` calls the dashboard's own HTMX handlers call, so
validation and hot-reload behavior are identical to using the UI.

### Services

| Method | Path | Notes |
|---|---|---|
| `GET` | `/services` | List all services. |
| `POST` | `/services` | Create. Body: `name`, `match_type` (`host`\|`prefix`), `match_value`, `backend`, optional `rate_limit_rps`, `rate_limit_burst`. Runs the same reachability probe as the dashboard's add wizard — an unreachable backend is rejected. |
| `GET` | `/services/:id` | Fetch one. |
| `PUT` | `/services/:id` | Partial update. Body fields are all optional — an omitted field is left unchanged, unlike an empty string, which clears it. See the field list below. |
| `DELETE` | `/services/:id` | Remove. |
| `POST` | `/services/:id/purge` | Purge the service's [Varnish](/docs/configuration/varnish#purging) cache: everything, or only objects under an optional JSON `path` prefix. Handy right after a deploy. |

`PUT /services/:id` accepts:

| Field | Type | Notes |
|---|---|---|
| `name`, `host`, `prefix`, `backend` | string | Core routing fields. |
| `host_aliases` | string array | Replaces the whole alias list. See [Extra hostnames](/docs/configuration/services#extra-hostnames). |
| `canonical_host` | string | `""` = no redirect; otherwise the host or one of its aliases. |
| `backends` | string array | Replaces the whole backend list; the first entry is the primary. |
| `lb_policy` | string | `round_robin` or `least_conn`. |
| `health_path`, `health_interval` | string, int | Active health checks. |
| `rate_limit_rps`, `rate_limit_burst` | number, int | Per-service rate limit. |
| `bot_mode` | string | `inherit`, `always` or `off`. |
| `allow_large_js_uploads`, `http3_enabled`, `compress_enabled` | bool | Per-service toggles. |
| `request_schema`, `schema_mode` | string | JSON Schema text and `off`/`log`/`enforce`. |

### IP rules

| Method | Path | Notes |
|---|---|---|
| `GET` | `/ip-rules` | List all IP/CIDR rules (manual, threat-intel-synced, and auto-banned). |
| `POST` | `/ip-rules` | Create. Body: `app_name` (empty = global), `ip` (address or CIDR), `rule_type` (`block`\|`allow`). |
| `DELETE` | `/ip-rules/:id` | Remove. |

### Custom WAF rules

| Method | Path | Notes |
|---|---|---|
| `GET` | `/waf-rules/custom` | List custom rules. |
| `POST` | `/waf-rules/custom` | Create. Body: `rule` (one or more `SecRule`/`SecAction` directives, ids `1000000`–`1999999`), optional `service_name` (empty = all services), `note`, `enabled` (default `true`). The rule is compiled before saving; an invalid one is a `400`. |
| `PUT` | `/waf-rules/custom/:id` | Replace a rule. Same body. |
| `DELETE` | `/waf-rules/custom/:id` | Remove. |

The WAF reloads after each change. See [Custom rules](/docs/security/waf#custom-rules).

### Metrics

`GET /metrics` returns the Prometheus exposition, the same as the dashboard's `/admin/metrics`.
A read-only key is enough. See [Prometheus Metrics](/docs/configuration/metrics).

### Bans

There is **no separate ban table** — a "ban" is just a global (`app_name == ""`) `block` row in
`ip_rules`, the same row shape the [autoban](/docs/security/blocking#automatic-ip-banning) engine
writes.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/bans` | `ip-rules` filtered to global block rows only. |
| `POST` | `/bans` | Body: `ip`, optional `reason`. Written with a `"Banned via API — "` note prefix — distinct from autoban's own `"Auto-banned — "` prefix, so the two sources stay distinguishable on the IP Rules page's amber "Auto" badge. |
| `DELETE` | `/bans/:id` | Unban — identical to `DELETE /ip-rules/:id` on the same row. |

## Response shapes

`GET`/`POST` responses for services and IP rules return the underlying storage struct as-is. Neither
struct carries JSON tags, so the field names are the **exact, capitalized** Go field names — not
`snake_case` (contrast with request bodies, e.g. `apiCreateServiceRequest`, which do use explicit
`snake_case` json tags, as documented per-endpoint above).

```json title="GET /api/v1/services/3"
{
  "ID": 3,
  "Name": "api",
  "Host": "",
  "Prefix": "/api",
  "Backend": "http://127.0.0.1:9000",
  "CreatedAt": "2026-06-01T09:00:00Z",
  "TLSMode": "",
  "RateLimitRPS": 0,
  "RateLimitBurst": 0,
  "BotMode": "inherit",
  "CacheEnabled": false,
  "CacheTTLFloor": 0,
  "CacheTTLCeiling": 0,
  "CacheGrace": 0,
  "CacheKeep": 0
}
```

(Trimmed for brevity — the full struct also carries `TLSCertPath`, `TLSKeyPath`, `TLSExpiresAt`,
`CertID`, `CacheBySession`, `SessionCookieName`, `AllowLargeJSUploads`, `RequestSchema`,
`SchemaMode`, `CompressEnabled`, `ExtraBackends`, `LBPolicy`, `HealthPath`, `HealthInterval`,
`HostAliases`, `CanonicalHost`, `LoginPaths`, `AICrawlerPolicy`, `BreachAction`, `BreachFields`,
`ResponseInspect`, `CacheRules` and `Gate`.)

```json title="GET /api/v1/ip-rules"
[
  {
    "ID": 118,
    "AppName": "",
    "IP": "203.0.113.10",
    "RuleType": "block",
    "Note": "Auto-banned — score 12 in 10m window",
    "CreatedAt": "2026-07-11T12:51:40Z"
  }
]
```

Errors are a flat JSON object: `{"error": "name, backend, match_type (host|prefix), and match_value are required"}`,
with the HTTP status carrying the category (`400` validation, `401`/`429` auth, `404` not found,
`500` server error).

## Audit trail

Every successful API write is recorded in the [audit log](/docs/configuration/users-and-sso#audit-log)
with the key's name and prefix as the actor.

## Example

```bash
# Create a service — the add wizard's reachability probe runs here too, so
# an unreachable backend is rejected with a 400 before anything is saved.
curl -X POST https://your-host/admin/api/v1/services \
  -H "Authorization: Bearer cwaf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"name":"api","match_type":"prefix","match_value":"/api","backend":"http://127.0.0.1:9000"}'

# Partial update — only bot_mode changes; name/host/prefix/backend/rate limit
# are left exactly as they were, since PUT fields are optional pointers.
curl -X PUT https://your-host/admin/api/v1/services/3 \
  -H "Authorization: Bearer cwaf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"bot_mode":"always"}'

# Ban an IP
curl -X POST https://your-host/admin/api/v1/bans \
  -H "Authorization: Bearer cwaf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"ip":"203.0.113.10","reason":"credential stuffing"}'
```
