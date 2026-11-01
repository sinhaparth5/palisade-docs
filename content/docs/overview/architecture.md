---
sidebar_position: 2
title: Architecture
description: The request pipeline, storage model, hot reload, multi-app routing, and bundled data.
keywords: [architecture, request pipeline, reverse proxy, hot reload, storage, sqlite, mysql, postgres, go]
---


## Request pipeline

Every request runs through a single `Handle` method, in strict order:

0. **Before the pipeline** — a request for a service's non-canonical hostname is redirected to the
   [canonical host](/docs/configuration/services#extra-hostnames); a service that requires
   [client certificates](/docs/configuration/tls#client-certificates-mtls) rejects requests without
   a valid one (`403 mtls_required`).
1. **IP blocklist check** — explicit admin rules, autoban decisions and threat-intel feeds reject
   immediately.
2. **Geo blocklist check** — country blocks reject before a client is asked to solve a challenge.
3. **Bot challenge gate** — non-trusted clients without a valid bypass cookie are redirected to the
   JS proof-of-work challenge (subject to global + per-service bot mode, the AI crawler policy,
   forced challenges on [login paths](/docs/security/login-protection), and a force-challenge
   decision from [adaptive enforcement](/docs/security/threat-score) if enabled).
4. **Global rate limit** — per-client token bucket (IPv6 by /64), scaled up or down for high/low-risk
   IPs by the same adaptive-enforcement decision when enabled.
5. **Per-service rate limit** — optional, after routing, plus the fixed login-path limiter.
6. **Maintenance / waiting room** — per-service [availability gates](/docs/configuration/services#maintenance-mode).
7. **Coraza WAF inspection** — virtual patches, full CRS and custom rules, then the service's
   [MCP guard, OpenAPI spec or JSON Schema](/docs/security/api-protection), via a per-service engine
   when that service has its own exceptions, rules or specs, else the shared default engine.
8. **Leaked password check** — on login paths of services that turn it on.
9. **Reverse-proxy** to the matched backend, with optional
   [response inspection](/docs/security/waf#response-inspection) and
   [compression](/docs/configuration/services#compression) on the way back.

Two exceptions skip most of this:

- [Trusted IPs](/docs/security/blocking#trusted-ips) skip stages 1–8, including the WAF.
- [Open crawler paths](/docs/security/blocking#open-crawler-paths) (`/robots.txt`, sitemaps,
  `/llms.txt`) skip everything except the WAF.

Every stage logs the outcome via a **non-blocking queue** (buffered channel drained by one worker
goroutine), so the hot path never waits on the database. Every response — blocked or proxied — gets
its `Server` header forced to `Palisade` and the standard
[security headers](/docs/security/response-headers) applied. Blocked browsers get a
[block page](/docs/security/blocking#block-pages) with the request ID.

## Reverse proxy & multi-app routing

Palisade routes to as many backend apps ("services") as you need from a single front door.
Two match modes per service:

- **Host match** — virtual hosting by `Host` header (e.g. `api.example.com` → one backend,
  `blog.example.com` → another). The request path is passed through untouched.
- **Prefix match** — route by URL path prefix (e.g. `/api` → a backend), with **automatic prefix
  stripping** before proxying, exactly like nginx `proxy_pass http://backend/`. The original client
  path is restored before logging so the dashboard shows what the client really requested.

**Routing precedence:** all prefix matches are evaluated first (**longest prefix wins**), then host
matches — mirroring nginx `location` blocks beating `server_name` defaults.

Unmatched requests are not proxied anywhere; they are logged under the app name `VPS`. Services can
also answer on extra hostnames, with an optional canonical redirect.

Each backend gets its **own pre-built reverse proxy** with a 5-second dial timeout and a 10-second
response-header timeout, so a slow or dead backend cannot hold browser connection slots indefinitely,
and up to 100 idle keep-alive connections. Services are **database-backed and hot-reloaded**: adding,
editing, or removing a service rebuilds the routing registry instantly with **no restart**.

**Load balancing and health:** a service can have several backends, balanced round robin or by least
connections. Health is passive by default: a connection error takes a backend out for 10 seconds, and
a bodiless `GET`/`HEAD` is retried once on another backend. With a health path set, active checks
decide when it comes back. A one-shot reachability probe also runs when a service is first added. See
[Services & Load Balancing](/docs/configuration/services).

All HTTP servers set a 10-second header read timeout, a 120-second idle timeout and a 1 MiB header
limit against slowloris-style attacks. Body reads have no timeout, so uploads, server-sent events and
WebSockets keep streaming. On `SIGINT`/`SIGTERM` Palisade drains in-flight requests (up to 10
seconds) and the log queue before exiting.

## State & storage

SQLite is the zero-dependency default, using the pure-Go `modernc.org/sqlite` driver with WAL mode
and a bounded connection pool. MySQL/MariaDB and Postgres-compatible servers (including CockroachDB
and Neon) are also supported through `--db-driver`; the schema is created and upgraded automatically
on every backend. Services, rules, TLS state, sessions, rate-limit snapshots, request logs, and
settings are DB-backed. Uploaded TLS private keys are the exception — those live on disk at mode
`0600`.

The optional `--db-key-file` protects stored live credentials with AES-256-GCM, including the bot
cookie HMAC key, per-user TOTP secrets, the email token, webhook secret, CAPTCHA secret, SSO client
secret, TypeSafe key, CrowdSec bouncer keys, and saved external-DB credentials. Enabling it seals existing plaintext secrets in place; a missing or incorrect key for
already-encrypted values fails loudly. The installer enables this by default and keeps the key at
`/etc/palisade/db.key`, outside the application data directory.

Request logging itself is **fire-and-forget**: every pipeline stage enqueues its outcome on a
buffered channel drained by a dedicated worker goroutine, so logging never blocks the request hot
path. Logs are retained for a configurable number of days and pruned by a
[separate one-shot command](/docs/configuration/log-retention).

## Hot reload

The WAF engine, bot challenger, rate limiter, IP blocklist, trusted IPs, honeypots and service registry
are all swapped behind read/write mutexes, so their dashboard changes apply with no restart. Waiting
room queues live outside the registry, so saving a service doesn't empty its queue. `SIGHUP`
rebuilds the WAF (for `--waf-rules` files edited on disk). The database connection is fixed at
startup and is the deliberate exception.

## Bundled data

The GeoLite2-Country and DB-IP ASN Lite databases, the OWASP CRS (v4.25.2 LTS) and virtual patches,
compiled Tailwind CSS, minified dashboard JS, and the dashboard's vendored fonts and libraries are
all `//go:embed`-ed into the binary — there is nothing external to fetch
at runtime. The database drivers, GeoIP, and ASN packages are pure Go, so binaries are built with
`CGO_ENABLED=0` and run with no shared-library dependencies.

## Background subsystems

Beyond the request pipeline, several long-running goroutines are started once at boot and run for the
process lifetime, each wired to a DB-backed config that can change live from the dashboard:

- the [threat-intel](/docs/security/threat-intel-webhooks) sync worker,
- the [autoban](/docs/security/blocking#automatic-ip-banning) scorer — fed every logged event, using
  the same fire-and-forget pattern as the log queue,
- the [threat score](/docs/security/threat-score) scorer — a third log fan-out hook that computes
  each IP's composite risk score asynchronously and caches it in memory for the adaptive-enforcement
  hot-path lookup,
- the CrowdSec LAPI poller, when a CrowdSec source is configured,
- the [webhook](/docs/security/threat-intel-webhooks) pusher,
- active backend [health checks](/docs/configuration/services#multiple-backends-and-health-checks),
  one loop per service that sets a health path,
- the autoban janitor, which expires automatic bans after their ban duration,
- the Web Bot Auth key-directory fetcher,
- the [daily-report mailer](/docs/configuration/email-alerts),
- and — when [Varnish caching](/docs/configuration/varnish) is used by any service — a permanent
  loopback-only HTTP listener that Varnish's static VCL sends cache misses to, which resolves the
  correct backend from the live service registry rather than from anything baked into Varnish's config.

## TLS fingerprinting

[JA4 and JA3](/docs/security/bot-and-fingerprinting) are computed in `GetConfigForClient` at handshake
time and cached per-connection until the connection closes, so per-request lookup never touches the
network or the database.
