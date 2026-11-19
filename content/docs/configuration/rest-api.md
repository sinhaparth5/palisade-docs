---
sidebar_position: 3
title: REST API
description: Bearer-token authenticated API for services, IP rules, bans, custom WAF rules and metrics, separate from the dashboard's session cookie.
keywords: [rest api, bearer token, api keys, services api, ip rules api, geo rules api, rule exceptions, virtual patches, logs api, mcp server, model context protocol, claude, custom waf rules api]
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
| `name`, `host`, `prefix`, `backend` | string | Core routing fields. Changing `name` renames the service and moves its rules with it. See [Renaming a service](/docs/configuration/services#renaming-a-service). |
| `host_aliases` | string array | Replaces the whole alias list. See [Extra hostnames](/docs/configuration/services#extra-hostnames). |
| `canonical_host` | string | `""` = no redirect; otherwise the host or one of its aliases. |
| `backends` | string array | Replaces the whole backend list; the first entry is the primary. |
| `lb_policy` | string | `round_robin` or `least_conn`. |
| `health_path`, `health_interval` | string, int | Active health checks. |
| `rate_limit_rps`, `rate_limit_burst` | number, int | Per-service rate limit. |
| `bot_mode` | string | `inherit`, `always` or `off`. |
| `allow_large_js_uploads`, `http3_enabled`, `compress_enabled` | bool | Per-service toggles. |
| `multipart_limit_mb` | int | Multipart upload limit in MiB. `0` = the 12.5 MiB default, at most `256`. See [Request body size limits](/docs/security/waf#request-body-size-limits). |
| `malware_scan` | string | `""` (off), `log` or `block`. Needs `--clamd`. See [Malware scan](/docs/security/waf#malware-scan). |
| `request_schema`, `schema_mode` | string | JSON Schema text and `off`/`log`/`enforce`. |

On a service [created from Docker labels](/docs/configuration/services#services-from-docker-labels),
a `PUT` that sets any routing field (`name`, `host`, `host_aliases`, `canonical_host`, `prefix`,
`backend`, `backends`, `lb_policy`, `health_path`, `health_interval`) returns `409`. The other fields
work as usual.

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

### Request logs and stats

| Method | Path | Notes |
|---|---|---|
| `GET` | `/logs` | Request logs, newest first. Query: `app`, `ip`, `status` (`2xx`\|`3xx`\|`4xx`\|`5xx`\|`blocked`\|`cache_error`), `from`/`to` (RFC 3339), `limit` (default 50, max 500), `offset`. |
| `GET` | `/logs/:id` | One request with its captured (redacted) headers and WAF matches. |
| `GET` | `/logs/stream` | Live tail as JSON Server-Sent Events, with a `: ping` comment every 30 seconds. |
| `GET` | `/stats` | Overview counters, including the top blocked IPs. |

### Geo rules

| Method | Path | Notes |
|---|---|---|
| `GET` | `/geo-rules` | List country rules. |
| `POST` | `/geo-rules` | Create. Body: `app_name` (empty = global, otherwise an existing service), `country_code` (two-letter ISO), `rule_type` (`block`\|`allow`). Reloads the geo blocker and the threat score's geo rules. |
| `DELETE` | `/geo-rules/:id` | Remove. |

### WAF rule exceptions and virtual patches

| Method | Path | Notes |
|---|---|---|
| `GET` | `/rule-exceptions` | List global and per-service rule exceptions. Each entry's id belongs to its own table. |
| `POST` | `/rule-exceptions` | Turn a rule off. Body: `rule_id`, optional `service` (empty = every service), `reason`. Saving an existing exception again updates its reason. |
| `DELETE` | `/rule-exceptions/global/:id` | Remove a global exception. |
| `DELETE` | `/rule-exceptions/services/:id` | Remove a per-service exception. |
| `GET` | `/vpatches` | List the shipped [virtual patches](/docs/security/waf#virtual-patches) and whether each is on. |
| `PUT` | `/vpatches/:id` | Body: `{"enabled": bool}`, optional `service`, `reason`. Turning a patch off adds an ordinary rule exception; turning it on removes it. Unknown ids are `404`. |

Each change rebuilds the WAF. Unknown services are a `400`.

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

### MCP server for AI assistants

`POST /mcp` is a read-only [Model Context Protocol](https://modelcontextprotocol.io) server over
Streamable HTTP. Claude, Cursor and other MCP clients can use it to search logs, read one request, see
stats, look up an IP, and list services and rules. Use a **read-only** API key:

```json
{
  "mcpServers": {
    "palisade": {
      "type": "http",
      "url": "https://waf.example.com/admin/api/v1/mcp",
      "headers": { "Authorization": "Bearer cwaf_…" }
    }
  }
}
```

With Claude Code:

```bash
claude mcp add --transport http palisade https://waf.example.com/admin/api/v1/mcp \
  --header "Authorization: Bearer cwaf_…"
```

| Tool | What it returns |
|---|---|
| `search_logs` | Request logs with the same filters as `GET /logs`, at most 100 rows. |
| `get_log` | One request in detail. |
| `stats` | The overview counters. |
| `ip_info` | What Palisade knows about one IP. |
| `list_services` | Configured services. |
| `list_rules` | IP, geo and WAF rules. |

The tools are **read-only by construction**: each replays the call as a `GET` through the REST views
above and has no other way into Palisade. Request logs carry attacker-controlled text (a
`User-Agent: ignore previous instructions…`), and with no write tool that text has nothing to act on.
The tools also describe those fields to the assistant as untrusted data. Every result is capped at
256 KiB.

The endpoint speaks JSON-RPC 2.0 (`initialize`, `ping`, `tools/list`, `tools/call`). Batches and
browser `Origin`s are refused, `GET` answers `405` (there is no SSE stream), and MCP calls are not
written to the audit log.

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
