---
sidebar_position: 4
title: Rate Limiting
description: Per-client token-bucket limiting, global and per service, with IPv6 clients keyed by /64.
keywords: [rate limiting, token bucket, per-ip limiting, ipv6]
---


Palisade applies **per-client-IP token-bucket** limiting globally ahead of geo/WAF inspection,
plus optional **per-service** limits. Configure it from **Settings → Rate limiting**; changes are a hot
reload with no restart.

## How the token bucket works

Each tracked IP gets a bucket holding up to `burst` tokens, refilled continuously at `rps` tokens per
second. A request consumes one token; if the bucket is empty, the request is rejected
(`RateLimitedTotal` / `rate_limited` in the log). `burst` is effectively "how many requests can arrive
back-to-back before throttling kicks in," and `rps` is the sustained long-run rate after that burst is
spent.

*Example:* `rps=5, burst=20` allows a client to fire 20 requests instantly, then sustain roughly 5
requests/second indefinitely — a sudden 100-request burst gets the first 20 through and throttles the
rest until tokens refill.

The **global limiter is disabled by default** (no rate limiting at all until you opt in from
Settings).

## How state is kept

A token bucket per client lives in memory; its state is snapshotted to the database **every 10
seconds** and restored on startup, so limits survive restarts. Idle buckets (no traffic for 5 minutes)
are reclaimed by a background janitor so the bucket map stays bounded despite an unbounded number of
distinct client IPs over time.

Each node keeps its own buckets. The Redis backend that used to share one limit across a cluster was
removed in v2.10.3, and leftover Redis settings are deleted from the database on startup.

## IPv6 clients are keyed by /64

An IPv4 address is its own bucket. An IPv6 client is keyed by its **/64** prefix, because one host
usually owns a whole /64 and can rotate through it freely. The same key is used for
[autoban](/docs/security/blocking#automatic-ip-banning) scoring and the threat-score cache, so a
rotating client can't reset its score or slip out of a ban. Logs and manual IP rules keep the exact
address.

## Configuration reference

| Setting | Form field | Meta key | Notes |
|---|---|---|---|
| Enabled | `rl_enabled` | `ratelimit_enabled` | Off by default. |
| Requests/sec | `rl_rps` | `ratelimit_rps` | Sustained rate once burst is spent. |
| Burst | `rl_burst` | `ratelimit_burst` | Max tokens a bucket can hold; effectively the allowed instantaneous spike. |

Saved via `POST /admin/settings/ratelimit`.

## Per-service limits

Each service can carry its own limiter. Set it from the service's Manage panel (`rps` + `burst`), or in the add wizard. These run **after**
the global limit, so a request must clear both. Per-service limits are never affected by
[adaptive enforcement](/docs/security/threat-score#adaptive-enforcement) — that only scales the
global limiter.

## Login paths

Services with [login protection](/docs/security/login-protection) get a separate, fixed limiter on
their login paths: a burst of 5 submissions, then one every 12 seconds per client. It applies to
non-`GET`/`HEAD` requests only and logs as `rate_limited:login`.

## Trusted IPs

Addresses on the [trusted IPs](/docs/security/blocking#trusted-ips) list skip both rate limiters.

## Ordering

Rate limiting runs after the IP blocklist, geo blocklist and bot challenge, and before the
maintenance/waiting-room gate and the WAF, so throttled clients are rejected cheaply. See [Architecture](/docs/overview/architecture) for the full
pipeline order.
