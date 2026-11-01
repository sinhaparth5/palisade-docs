---
sidebar_position: 8
title: Varnish Cache Integration
description: Route selected services through a Varnish cache behind the WAF, using loopback listeners to keep all traffic in the inspection pipeline.
keywords: [varnish cache, caching, reverse proxy cache, cache tuning]
---


A per-service **Cache** toggle routes that service's traffic through a **Varnish** cache behind the
WAF. The request path uses two loopback listeners:

```
client → palisade (WAF-inspected) → varnishd (127.0.0.1:6081)
       → palisade cache-return listener (127.0.0.1:6082) → the real backend
```

Nothing reaches Varnish or the backend without first passing the full WAF pipeline.

## Turning it on

- **Per-service** — the **Cache** toggle in a service's Manage panel on `/admin/services` marks that
  service cacheable. See [Services](/docs/configuration/dashboard).
- **Global** — the **Varnish Cache** card on the Settings page turns the whole integration on or off
  with no restart (`POST /admin/settings/varnish` with `varnish_enabled`, `varnish_addr`). While off,
  every service proxies straight to its backend even if individually marked cacheable.

:::warning[The Varnish listen address must be a loopback address]
`varnish_addr` is validated: anything that is not a loopback address is rejected outright, because
that port would let clients reach Varnish (and the backend) without passing through the WAF pipeline.
:::

## The VCL is static

Varnish's config (`deploy/varnish/default.vcl`) has exactly **one hardcoded backend** — the
palisade cache-return listener. Backend selection for a cache miss happens back inside the WAF
process (it resolves the correct backend from the live service registry), **not** in Varnish. So
adding, editing, or removing a service never requires touching the VCL or reloading `varnishd`.

## Cache-poisoning defenses

- Spoofable headers (`X-Forwarded-Host`, `X-Original-URL`, etc.) are **stripped** before the request
  reaches Varnish, as is every client-sent `X-Cache-*` header, so only Palisade's own TTL, grace,
  keep, rule and session values reach the VCL.
- The cache hash is partitioned by a WAF-set `X-Cache-Service` header that clients cannot control.
- Both the VCL and the cache-return listener **reject any non-loopback peer**.
- Responses that set cookies are marked **uncacheable** by default, so private data is never served
  from cache to a different visitor (session-aware caching, below, is the opt-in exception).

## Session-aware caching (opt-in)

By default Varnish refuses to cache **any** response for a request that carries a cookie. This keeps
private responses out of the shared cache, but a service that always sets a session cookie will
never be cached. Per
service, you can instead partition the cache by a named session cookie's value:

- Toggle **Cache by session** and set the **session cookie name** in the service's Manage panel
  (`POST /admin/services/cache-session/:id` with `session_enabled=1`, `session_cookie_name`). Both
  are required together. Enabling the option without a name is rejected.
- The WAF hashes the named cookie's value (never forwards it raw) and sends it as `X-Cache-Session`,
  which Varnish includes in its cache hash. Different sessions cannot receive each other's cached
  responses, and the raw session token never appears in Varnish's logs.
- Session-partitioned entries get a hard **10-second TTL ceiling** regardless of the backend's
  `Cache-Control`. This limit is intended for personalized content rather than static assets.

## Cache tuning

Per service, you can override Varnish's default freshness behavior from the **Cache tuning** panel
(`POST /admin/services/cache-tuning/:id` with `ttl_floor`, `ttl_ceiling`, `grace`, `keep` — all
optional whole-second values; blank means "use the VCL default" below):

| Field | VCL default when unset | Effect |
|---|---|---|
| `ttl_floor` | `1h` (the VCL's built-in default TTL for static-looking responses) | Minimum time-to-live enforced even if the backend's `Cache-Control` asks for less. |
| `ttl_ceiling` | none | Maximum time-to-live enforced even if the backend asks for more. |
| `grace` | `30s` | How long a stale object may still be served — e.g. while a fresh copy is being fetched, or if the backend is briefly unreachable. |
| `keep` | `30s` | How much longer *after* grace expires a stale object is kept around for conditional revalidation before being evicted outright. |

A `ttl_floor` greater than a non-zero `ttl_ceiling` is rejected by the save handler.

## Per-path rules

On the service's **Cache** tab, a **Cache rules** box takes one rule per line
(`cache_rules`, saved with the cache tuning form, `POST /admin/services/cache-tuning/:id`):

```text
cache /static
cache /assets/img
bypass /api
bypass /cart
```

- `bypass /path` sends matching requests straight to the backend, skipping Varnish.
- `cache /path` tells the VCL to cache the path like a static asset: cookies and `Set-Cookie` are
  dropped, but requests with `Authorization` still pass through uncached.
- The longest matching prefix wins. Paths are matched on the service path, before any backend base
  path is added.

## When Varnish fails

Varnish problems fail open. If `varnishd` is down, or Varnish couldn't fetch from the backend (its
`vcl_backend_error` marks the response), Palisade serves the request straight from the backend and
logs the cache status as `ERROR`. The cache card has an **Errors** column, and the Logs page has a
**Cache errors** filter.

The installer raises Varnish's header limits (`http_resp_hdr_len=32k`, `http_req_hdr_len=32k` and
related workspaces). The 8 KiB default turned backends with large headers into `503`s on static
assets.

WebSocket upgrade requests always bypass Varnish.

## Purging

The **Purge** button on a service's row (`POST /admin/services/cache-purge/:id`) sends a `PURGE`
request to Varnish's client port over loopback, using the same trust model as the cache-return
listener. Varnish then bans every cached object tagged with that service's name. Use it after a
backend deploy that changes content you know is stale in cache.
