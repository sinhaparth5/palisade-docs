---
sidebar_position: 3
title: Services & Load Balancing
description: Route traffic to backends, spread it across several with health checks, serve extra hostnames, compress responses, and put a service in maintenance or behind a waiting room.
keywords: [services, reverse proxy, load balancing, health checks, round robin, least connections, host aliases, canonical redirect, compression, zstd, gzip, maintenance mode, waiting room]
---


A **service** is one backend app behind Palisade. Services live in the database and are managed
from **Services** (`/admin/services`) or the [REST API](/docs/configuration/rest-api). Every change
rebuilds the routing registry with no restart. The add wizard and the basic per-service controls
are covered in [Using the Dashboard](/docs/configuration/dashboard#services-backend-apps--what-gets-proxied).
This page covers the tabs in a service's edit modal.

## Routing

- **Host match** routes by `Host` header (`api.example.com`). The path is passed through untouched.
- **Prefix match** routes by path prefix (`/api`) and strips the prefix before proxying, like nginx
  `proxy_pass http://backend/`.
- Prefix matches are checked first (longest wins), then host matches.
- If nothing matches, the request is not proxied anywhere and is logged under the app name `VPS`.
  There is no fallback to the first service. For a default backend, add a service with prefix `/`.

## Multiple backends and health checks

On the **Backends** tab (`POST /admin/services/backends/:id`) you can list extra backends, one URL per
line, next to the primary one:

| Field | Meaning |
|---|---|
| `backends` | Extra backend URLs, one per line. All backends must share one base path. |
| `lb_policy` | `round_robin` (default) or `least_conn`. |
| `health_path` | Optional path for active health checks, e.g. `/healthz`. |
| `health_interval` | Seconds between active checks. Default `10`. |

**Passive health** is always on. A backend that answers is up. A connection error takes it out of
rotation for 10 seconds, or, with a `health_path` set, until an active check passes. Active checks
treat any `2xx` or `3xx` as healthy.

A bodiless `GET` or `HEAD` that hits a connection error is retried once on another backend. Requests
with a body (`POST`, `PUT`…) are never retried.

The services list shows a health dot per backend, and the `palisade_backend_up{app,backend}`
[metric](/docs/configuration/metrics) exposes the same state. `/_cz/readyz` ignores backend health; it
only reports whether Palisade itself is ready.

Backends may be private addresses on purpose. Cloud metadata endpoints (such as
`169.254.169.254`) are rejected, by hostname and by resolved IP.

Each backend keeps up to 100 idle keep-alive connections, so a busy service doesn't open a new
connection per request.

## Extra hostnames

A host-matched service can answer on more hostnames. On the **Hosts** tab
(`POST /admin/services/hosts/:id`) list the aliases, one per line, and optionally pick a
**canonical** host. A request for any other of the service's hostnames is redirected there before any
other stage runs: `301` for `GET`/`HEAD`, `308` for other methods so the body is kept. A hostname can
belong to only one service.

## Compression

Turn on **Compress** on the **Cache** tab (`POST /admin/services/compress/:id`) to have Palisade
compress responses the backend sent uncompressed. It negotiates **zstd** or **gzip** from the
client's `Accept-Encoding` and only touches text-like bodies over 1 KB.

It skips upgrades, `HEAD`, `204`/`206`/`304`, server-sent events, images and video, responses already
encoded, and responses marked `Cache-Control: no-transform`. It adds `Vary: Accept-Encoding` and
weakens strong `ETag`s. Streamed responses are flushed chunk by chunk, so SSE-style streaming still
works.

## HTTP/3

With `--listen-h3` set, a host-matched service can opt in to HTTP/3 on its **TLS** tab. See
[TLS / HTTPS](/docs/configuration/tls#http3-quic).

## Maintenance mode

On the **Availability** tab (`POST /admin/services/gate/:id`) you can take a service offline
without touching the backend:

| Field | Meaning |
|---|---|
| `maintenance` | Turn maintenance on. |
| `maint_message` | Text shown on the maintenance page. |
| `maint_start`, `maint_end` | Optional schedule. Maintenance is only active inside the window and turns itself off at the end. |
| `new_bypass` | Generate a new bypass token. |

While active, visitors get a `503` maintenance page with `Retry-After` set to the seconds until the
scheduled end (or 300 when there is none), and the expected end time if one is set.

To let your team through, share the **bypass link**: any URL on the service with
`?palisade_bypass=<token>` appended. A valid token sets a 12-hour `cz_bypass` cookie and redirects to
the same page with the token removed. Generate a new token to cut off everyone who has the old one.
Viewers in the dashboard never see the token.

## Waiting room

The waiting room caps how many visitors use a service at once and queues the rest, first in first
out. Set it on the same **Availability** tab:

| Field | Meaning |
|---|---|
| `waiting_room` | Turn the waiting room on. |
| `wr_max` | Maximum active visitors (1 to 1,000,000). |
| `wr_idle` | Minutes of inactivity before a visitor's slot is freed (1 to 1440). |
| `wr_message` | Text on the queue page. |
| `wr_crawlers` | `bypass` lets verified crawlers skip the queue; `deny` gives them a `503`. |

Queued visitors see a page that refreshes itself, so it works without JavaScript. A promoted visitor
has one minute to come back and claim the slot.

Tickets are kept in a `cz_wait_<id>` cookie signed over the service, ticket and client
(IPv6 by /64), so a shared or forged cookie gets a fresh place at the back of the line. The queue is
bounded (50,000 entries, at most 8 per client), and abandoned entries expire. Saving other service
settings doesn't empty the queue.

Both gates run after rate limiting and before the WAF. [Open crawler paths](/docs/security/blocking#open-crawler-paths)
and [trusted IPs](/docs/security/blocking#trusted-ips) skip them. Gate responses are logged as
unblocked, so queue polling never feeds autoban or JA4 reputation.
