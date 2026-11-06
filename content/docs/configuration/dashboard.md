---
sidebar_position: 2
title: Using the Dashboard
description: Configure services, blocks, certificates, logs, and settings through the dashboard and its HTTP routes.
keywords: [admin dashboard, htmx, tailwind, services, ip rules, settings]
---


The dashboard lives at `/admin` behind session-cookie login. Changes take effect without a restart.
Each page uses HTMX to replace only the affected part of the page. The sections below cover the
dashboard controls and their HTTP routes. What you can change depends on your
[role](/docs/configuration/users-and-sso#roles); viewers see every page read-only.

**Search.** The search button in the top bar (or `Ctrl+K`, `Cmd+K` or `/`) searches every settings
card and page section you have access to, plus live records: services, IP and geo rules,
certificates, threat-intel feeds and custom WAF rules. Use the arrow keys and Enter to jump straight
to the match (`GET /admin/search?q=`).

**Theme.** The dashboard uses the v3 "ledger" theme. A sun/moon toggle in the sidebar switches to
dark mode; the choice is saved in the browser and does not follow the OS setting. The admin pages
are served under a strict Content-Security-Policy with every script, font and stylesheet bundled
into the binary.

:::info[Dashboard changes]
Each form writes its change to `waf.db` and then **hot-reloads** the relevant subsystem (registry,
blocklist, geo, WAF engine, or rate limiter). No file edit or restart is required.
:::

![Palisade dashboard home — overview of requests, blocked, challenged and block rate today, live metrics strip, 24h traffic chart, top countries, enforcement-today breakdown, and blocked-by-country chart](/img/docs/docs_dashboard.png)

## Services (backend apps) — *what gets proxied*

**Page:** `/admin/services` · **Purpose:** define which backend each incoming request is routed to.

**Add a service:**

1. Go to **Services → Add**. The add form is a short wizard.
2. Fill in:
   - **Name** — a label for the service (e.g. `api`).
   - **Match type** — `host` (virtual hosting by `Host` header) or `prefix` (route by URL path
     prefix).
   - **Match value** — the host (`api.example.com`) or the prefix (`/api`).
   - **Backend** — the upstream URL, e.g. `http://127.0.0.1:8080`.
   - **(Optional) Rate limit** — requests/second (`rps`) and `burst` for this service alone. Leave
     `0` to inherit the global limiter only.
3. Click **Add**. Before saving, the server **validates** the backend URL and runs a **one-shot
   reachability probe** — if the backend is unreachable, the save is rejected with an inline error
   ("fix the backend or try again before adding"). This prevents adding dead upstreams.
4. On success the routing registry is rebuilt instantly and the new row appears.

![Services page showing the guided Add Service wizard above the configured services list, with host match, backend, TLS status and rate limit per row](/img/docs/docs_service.png)

**Behavior to know:**

- **Prefix routing strips the prefix** before proxying (so `/api/users` → backend `/users`), like
  nginx `proxy_pass http://backend/`. The original path is restored for logging.
- **Longest prefix wins**, and all prefix matches are checked before host matches.
- **Per-service TLS requires a host-matched service.** Prefix services can't have their own
  certificate (there's no SNI host to key it on) — the TLS panel will say so.

**Edit / manage a service:** the **Manage** button on a row opens the service modal. Its tabs:

| Tab | What's on it |
|---|---|
| **Rate Limit** | Per-service `rps` and `burst` (`POST /admin/services/ratelimit`). See [Rate Limiting](/docs/configuration/rate-limiting#per-service-limits). |
| **Backends** | Extra backends, load-balancing policy and health checks. See [Services & Load Balancing](/docs/configuration/services#multiple-backends-and-health-checks). |
| **Hosts** | Extra hostnames and a canonical redirect. See [Extra hostnames](/docs/configuration/services#extra-hostnames). |
| **Availability** | Maintenance mode and the waiting room. See [Maintenance mode](/docs/configuration/services#maintenance-mode). |
| **Bot** | Bot mode (`inherit`/`always`/`off`, `POST /admin/services/bot/:id`), AI crawler policy, login protection and the leaked password check. See [Bot Protection](/docs/security/bot-and-fingerprinting) and [Login Protection](/docs/security/login-protection). |
| **Schema** | JSON Schema, OpenAPI, MCP guard, script inventory and response inspection. See [API & MCP Protection](/docs/security/api-protection). |
| **Cache** | Varnish caching, session-aware caching, tuning, per-path rules and compression. See [Varnish](/docs/configuration/varnish). |
| **TLS** | Certificates (below), HTTP/3 and client certificates. See [TLS / HTTPS](/docs/configuration/tls). |
| **Uploads** | Large JavaScript uploads. See [WAF Inspection](/docs/security/waf#request-body-size-limits). |

Each service row shows tags for the features turned on and a health dot per backend.

**Delete a service:** the trash control issues `DELETE /admin/services/:id` and rebuilds the
registry.

**Routes:** `GET /services`, `POST /services` (add), `DELETE /services/:id`,
`POST /services/ratelimit`, `POST /services/bot/:id`, plus the TLS routes below.

## Blocks — IP rules & geo/country rules

There are two independent block lists, both enforced **early** in the pipeline and both hot-reloaded
on change. See [IP & Geo Blocking](/docs/security/blocking) for how they fit the pipeline.

### IP rules

**Page:** `/admin/ip-rules` · **Purpose:** manually allow or block a single IP or CIDR range.

1. Go to **IP Rules**.
2. Enter:
   - **IP / CIDR** — accepts a single IPv4/IPv6 address (`1.2.3.4`, `::1`) **or** a CIDR
     (`10.0.0.0/8`). Anything else is rejected with a format hint.
   - **Rule type** — `block` or `allow`.
   - **(Optional) App/scope** — leave empty for a global rule, or scope it to a named app.
3. Submit. The rule is written and the in-memory IP blocklist reloads immediately, so the next
   request from that IP is affected.
4. **Remove** a rule with the row's delete control (`DELETE /admin/ip-rules/:id`).

![IP Rules page — Add IP Rule form with IP/CIDR input, scope selector and block/allow toggle; automatic banning, adaptive enforcement and honeypot path panels; rules overview; and the Active IP Rules list](/img/docs/docs_ip_rules.png)

These manual rules are evaluated alongside the IPs pulled in automatically by
[threat-intel sync](/docs/security/threat-intel-webhooks) and the autoban engine (see below).

**Pagination.** The list is paginated (`GET /admin/ip-rules/rows` serves the Prev/Next buttons via
HTMX without a full page reload) rather than loading the whole table. An autoban setup can grow to
thousands of rows. The "Rules overview" block/allow percentages are computed from a
separate query against the whole table, not just the current page.

**Threat score badges.** Each row shows a **"Score N"** badge with the same composite 0–100
[threat score](/docs/security/threat-score) shown in the log detail view, bulk-fetched for the
current page in one query.

**Routes:** `GET /ip-rules`, `POST /ip-rules` (`app_name`, `ip`, `rule_type`), `DELETE /ip-rules/:id`.

#### Automatic banning

The **Automatic banning** card on the IP Rules page configures the autoban engine. The engine watches
events and bans clients that cross a score threshold, for a configurable number of hours.

1. Toggle **Enable automatic banning** to activate it.
2. Set **Score threshold** (default 10), **Window (minutes)** (default 10) and **Ban (hours)**
   (default 24, `0` = never expires).
3. Optionally turn on **Score bad responses** and set the status codes and points per hit.
4. Click **Save**. Changes apply immediately via hot reload.

Auto-banned IPs appear in the Active IP Rules list with an amber **Auto** badge and a machine-stamped
ban reason note. The autoban engine never overwrites admin-added **allow** rules.

See [Automatic IP Banning](/docs/security/blocking#automatic-ip-banning) for scoring details and
threshold guidance.

**Routes:** `POST /admin/ip-rules/autoban`.

#### Honeypots

The **Honeypots** card takes a list of paths that only scanners request. A client that gets a 404
on one is banned on the spot. See [Honeypot paths](/docs/security/blocking#honeypot-paths).

**Routes:** `POST /admin/ip-rules/honeypots`.

#### Adaptive enforcement

Next to Automatic banning, the **Adaptive enforcement** card configures threat-score-driven scaling of
the global rate limit and forced bot challenges. See
[Threat Score & Adaptive Enforcement](/docs/security/threat-score) for the full mechanism.

:::warning[Disabled by default]
Unlike autoban, this is **off out of the box**. It rides on a heuristic composite score (the ASN/hosting
classification can misfire) and includes a security-*loosening* action that relaxes limits for
low-risk IPs. Review observed scores on this page before enabling it.
:::

1. Toggle **Enable adaptive enforcement**.
2. Set **High-risk threshold** (default 70) and **rate scale** (default `0.3`, which cuts the limit to
   30%). These values apply when a client's score is at or above the threshold.
3. Set **Low-risk threshold** (default 10) and **rate scale** (default `1.5`). These values apply when a
   client's score is at or below the threshold.
4. Set a separate, stricter **Force-challenge threshold** (default 70). Above this value, a
   high-risk client also gets force-challenged; tightening the rate limit and forcing a challenge don't
   have to happen at the same score.
5. Click **Save**. Hot reload applies the change without a restart.

**Routes:** `POST /admin/ip-rules/adaptive` (`adaptive_enabled`, `adaptive_high_threshold`,
`adaptive_low_threshold`, `adaptive_high_rate_scale`, `adaptive_low_rate_scale`,
`adaptive_force_challenge_threshold`).

### Geo / country rules

**Page:** `/admin/geo-rules` · **Purpose:** block or allow whole countries.

1. Go to **Geo Rules**.
2. Enter a **2-letter ISO country code** (e.g. `RU`, `CN`, `US` — case-insensitive) and a rule type
   (`block`/`allow`), optionally scoped to an app.
3. Submit. The geo blocker reloads instantly. Country is determined from the
   [resolved real client IP](/docs/security/trusted-proxy) using the bundled GeoLite2 database, so it
   works correctly behind Cloudflare / a trusted proxy.
4. **Remove** with the row's delete control (`DELETE /admin/geo-rules/:id`).

![Geo Rules page — Add Geo Rule form with country code, scope and block/allow selector; rules overview; and the Active Geo Rules list showing global CN, RU and KP block rules](/img/docs/docs_geo_block.png)

**Routes:** `GET /geo-rules`, `POST /geo-rules` (`app_name`, `country_code`, `rule_type`),
`DELETE /geo-rules/:id`.

:::note[WAF rule blocks (related)]
The **WAF Rules** page (`/admin/waf-rules`) lists CRS rules and lets you **disable** a noisy rule by
ID with a reason and a **Scope** — `Global (all services)` or one specific service
(`POST /admin/waf-rules/disable` with `rule_id`, `reason`, `service`) — and re-enable a rule
(`DELETE /admin/waf-rules/:id` for a global exception, `DELETE /admin/waf-rules/service/:id` for a
per-service one). The WAF engine rebuilds itself from the current disabled-rule list(s), so the
change is live. See [WAF Inspection](/docs/security/waf#per-service-exceptions).

**Suggested Exceptions.** The same page has a **Suggested Exceptions** card built from the
false/true-positive marks you leave on blocked requests in the [Logs page](#request-logs) (see
"Was this rule correct?" below). A (rule, service) pair is suggested once it's been marked
false-positive at least **5 times** with **zero** true-positive marks in the last **7 days**
(both configurable at the bottom of the card, `POST /admin/waf-rules/feedback-config` with
`feedback_threshold`, `feedback_window`). This is signal collection only — nothing is disabled
automatically. Each suggestion's **Add exception** button pre-fills the same disable form above with
a reason like `Suggested: 6 false-positive marks in the last 7 days`, so you still make the call.
:::

## Certificates & per-service TLS

There are two related surfaces: a reusable **certificate pool**, and **per-service TLS** assignment.
For the full TLS picture see [TLS Setup](/docs/configuration/tls).

### Certificate pool

**Page:** `/admin/certificates` · **Purpose:** store named cert/key pairs you can reuse across
services.

1. Go to **Certificates → Add**.
2. Enter:
   - **Name** — a label (e.g. `wildcard-example-com`).
   - **Certificate (PEM)** — paste the full certificate chain.
   - **Private key (PEM)** — paste the matching key.
3. Submit. The certificate is parsed/validated; the **private key is written to disk at mode
   `0600`** (never stored in the database), and the cert appears in the pool with its expiry.
4. **Delete** a cert with its delete control (`DELETE /admin/certificates/:id`).

**Routes:** `GET /certificates`, `POST /certificates` (`name`, `cert_pem`, `key_pem`),
`DELETE /certificates/:id`.

### Assigning TLS to a service

Open a **host-matched** service's **Manage → TLS** panel. You have these options (all require a
host-matched service — prefix services are rejected):

- **Upload a custom cert** — paste `cert_pem` + `key_pem` for this service only
  (`POST /admin/services/tls/upload`). Stored on disk under `certs/services/<name>/`.
- **Assign a pool certificate** — pick one of your saved certificates
  (`POST /admin/services/tls/pool` with `cert_id`).
- **Enable auto-issue (ACME)** — Let's Encrypt provisions a cert for the service's host on first
  request (`POST /admin/services/tls/auto`). **Requires an ACME email to be set first** (see
  Settings, below); without it the action does nothing.
- **Clear TLS** — remove per-service TLS and fall back to the global cert
  (`POST /admin/services/tls/clear`).

At handshake time certificates resolve by SNI: **per-service custom → per-service/pool/legacy
autocert → global fallback.**

## Request logs

**Page:** `/admin/logs` · **Purpose:** see, filter, export, and live-tail every request decision.

**Live tail.** With **no filters set, on page 1**, new rows stream in over Server-Sent Events
(`/admin/logs/stream`) — you watch traffic in real time. Applying any filter switches to paged
history queried directly from the active database (so you can page deep without the stream
interfering). You can force history mode with `?mode=history`.

![Live Logs page showing the live stream indicator, date/app/status filters, table/stats toggle, the request log table with time, app, IP, method, path and status columns, and the Request Inspector panel](/img/docs/docs_logs.png)

**Live behaviour.** New rows are inserted in batches, so a traffic burst costs one repaint, and the
table keeps the newest 500 rows. **Pause** holds new rows back instead of shifting the ones you're
reading, and a "N new · show" button adds them; scrolling down to read does the same. The status
reads **Live**, **Paused** or **Reconnecting**. Rows open with Tab and Enter, and the detail modal
traps focus and returns it to the row on close.

**Stats view.** The **Table / Stats** toggle switches to a GoAccess-style summary: requests, unique
visitors, blocked share, 404s, 5xx and average response time; a requests-per-minute chart for the
last hour (blocked in red); and top-10 panels for paths, IPs, block reasons (with rule ID), 404
paths, status codes, countries, services, browsers and operating systems. It seeds from the last hour
(`GET /admin/logs/stats`) and then updates on every request over the same stream as the table. The
choice is remembered for the browser session.

**Filtering.** Use the filter controls; they map to query parameters on `GET /admin/logs`:

| Filter | Param | Example |
|---|---|---|
| App / service | `app` | `api` |
| Status class | `status` | `2xx`, `4xx`, `5xx` |
| Cache errors | (filter button) | requests Varnish failed to fetch, see [Varnish](/docs/configuration/varnish#when-varnish-fails) |
| From (datetime) | `from` | `2026-06-01T09:00` |
| To (datetime) | `to` | `2026-06-29T17:30` |
| Page | `page` | `2` |

(`from`/`to` use the HTML `datetime-local` format `YYYY-MM-DDTHH:MM`.)

**Request inspector.** Click a row to open `GET /admin/logs/:id` in the request inspector, docked to
the right of the table on wide screens and as a sheet on smaller ones. It groups the record, path,
security decision, client (country, ASN, JA4), threat score, bot signals and request headers.
`Authorization`, `Cookie`, `X-Api-Key` and `X-Auth-Token` values are stored as `[redacted]`. When a WAF rule matched,
a **"Was this rule correct?"** row lets you mark it **False positive** or **Correct block**
(`POST /admin/logs/feedback/:id` with `false_positive`) — this feeds the WAF Rules page's
**Suggested Exceptions** card described above under **Blocks**; marking doesn't change the request's
own outcome, it only records signal for future suggestions.

**Create exception.** A blocked request's detail view also has a **Create exception** button
(`POST /admin/logs/exception/:id`). It disables the rule that blocked the request **for that
request's service only**, and the WAF reloads live. The rule and service are read from the stored log
row, never from the browser. The exception appears under
[Per-Service Exceptions](/docs/security/waf#per-service-exceptions) on the WAF Rules page.

![Request Inspector panel for a blocked request — request ID, method, status, service, URL, security decision, time, duration, country, query, user agent, real client IP vs proxy IP, ASN, organisation, protocol and TLS details](/img/docs/docs_logs_detail.png)

**Export.** The **Export** button hits `GET /admin/logs/export` with the *same* filter query params
and streams the matching rows as newline-delimited JSON (`.ndjson`).

**Retention.** Logs are pruned by the separate `prune` command / systemd timer, not from this page
(see [Log Retention & Pruning](/docs/configuration/log-retention)).

**Routes:** `GET /logs`, `GET /logs/stream` (SSE), `GET /logs/stats`, `GET /logs/:id`, `GET /logs/export`, `POST /logs/feedback/:id`, `POST /logs/exception/:id`.

## Settings

**Page:** `/admin/settings` · **Purpose:** your account, users, security subsystems, and
integrations. Cards are grouped into sections with jump links; owner and admin cards are hidden from
roles that can't use them.

![Settings page showing the section tabs (Account & Access, Protection, Infrastructure, Alerts & Integrations, Activity), the Account form with current email, new email and new password fields, and the two-factor authentication and passkey panels](/img/docs/docs_settings.png)

**Change your credentials.** Enter your **current password**, then a **new email** and/or **new
password** (typed twice). Submitting (`POST /admin/settings/credentials` with `current_password`,
`new_email`, `new_password`, `confirm_password`) re-hashes the password with bcrypt and invalidates
old sessions.

**Users and single sign-on.** Owners add users, change roles, send invites and configure OIDC here.
See [Users, Roles & SSO](/docs/configuration/users-and-sso).

**Audit log.** A paged list of every change made through the dashboard and the API. See
[Audit log](/docs/configuration/users-and-sso#audit-log).

**Two-factor authentication.** The TOTP card enrolls any RFC 6238 authenticator by QR code or manual
key and requires a valid code before enabling 2FA. Ten one-time backup codes are shown once and
stored only as hashes. Disabling 2FA requires a current authenticator or backup code. If Cloudflare
email is configured, the second login step can send a single-use recovery code (10-minute expiry,
limited to one send per minute).

**Passkeys.** The **Passkeys** card registers a WebAuthn credential — a fingerprint, face, PIN, or
security key tied to this exact origin — as a second factor accepted **alongside**, not instead of,
TOTP: enrolling a passkey with no TOTP enrolled still routes login through the second-factor step,
where either a TOTP/backup code or a passkey satisfies it. Name the passkey, click **Add a passkey**,
and complete your browser/OS prompt (`POST /admin/settings/passkeys/begin` then `/finish`, standard
WebAuthn attestation). Register one per device — a laptop and a phone, say. Registration needs a
secure context (HTTPS with a real hostname, or `localhost`); the card shows a warning instead of the
form when the admin panel is reached over plain HTTP or a bare IP. **Remove** a passkey with its row's
delete control (`DELETE /admin/settings/passkeys/:id`).

**Registered devices.** Palisade keeps **one live session per user**: signing in on a new device
immediately signs your previous one out. Signing in again from the same IP and browser (even after a
browser update or a lost device cookie) replaces the old row instead of adding a duplicate. The **Registered devices** card lists every session,
live or historical, with its browser/OS, resolved country, IP, and last-active time. A live session's
row control **signs it out**; an already signed-out row's control **deletes it from history** instead,
since there's nothing left to revoke. History is kept for **30 days**, so you can review where the
account has been used even after a device signs itself out normally. **Log out all other devices**
(`POST /admin/settings/devices/revoke-others`) revokes everything but the current session in one
action, for a shared or lost device. Signing out — yours or another device's — deletes that row
outright rather than marking it revoked, so a session you intentionally end doesn't linger in the
history list.

**Bot protection.** Toggle the global challenger and tune it (`POST /admin/settings/bot` with
`bot_enabled=1`, `bot_threshold`, `bot_ttl`):

- **Enabled** — turn the JS proof-of-work challenge on/off globally.
- **Threshold** — the anomaly score above which a client is challenged.
- **TTL** — how long a solved bypass cookie stays valid (seconds).

- **CAPTCHA fallback** — Turnstile or hCaptcha for browsers that fail the proof of work
  (`captcha_provider`, `captcha_site_key`, `captcha_secret`).
- **AI crawlers** — the global `allow`/`challenge`/`block` default for the training, search and user
  categories (`ai_training`, `ai_search`, `ai_user`).

Per-service overrides (`inherit`/`always`/`off`, and AI crawler policy) are set from each service's
Bot tab. See [Bot Protection](/docs/security/bot-and-fingerprinting).

**Trusted IPs.** IPs and CIDRs that skip every blocking stage, including the WAF
(`POST /admin/settings/trusted-ips`). See [Trusted IPs](/docs/security/blocking#trusted-ips).

**Rate limiting.** Turn the global limiter on and set `rps` and `burst`
(`POST /admin/settings/ratelimit` with `rl_enabled`, `rl_rps`, `rl_burst`). Changes are a hot
reload. See [Rate Limiting](/docs/configuration/rate-limiting).

**ACME email.** Set the Let's Encrypt contact email (`POST /admin/settings/acme-email` with
`email`). This must be set before per-service auto-issue or global ACME will work.

**Webhooks.** Configure generic JSON, Slack Block Kit, or Discord embed delivery
(`POST /admin/settings/webhook` with `webhook_destination_type`, `webhook_url`, `webhook_secret`,
`webhook_enabled=1`, and one or more `webhook_events` checkboxes). If no events are selected it
defaults to `blocked`. The generic payload is signed; see
[Webhooks](/docs/security/threat-intel-webhooks#webhook-event-delivery).
Slack and Discord use incoming webhook URLs and ignore that header. **Send test alert** posts a
synthetic block using the saved settings, even when delivery is disabled. See
[Threat Intel & Webhooks](/docs/security/threat-intel-webhooks).

**Threat-intel sources.** On **Threat Intel** (`/admin/threat-intel`): add a source with a **label**,
a **URL** to a plain-text IP/CIDR list, and a sync **interval (hours)** (`POST /admin/threat-intel`).
Each row can be **toggled** on/off (`POST /admin/threat-intel/:id/toggle`), **synced now**
(`POST /admin/threat-intel/:id/sync`), or **deleted** (`DELETE /admin/threat-intel/:id`). Synced IPs
flow into the IP blocklist automatically. A separate form adds a **CrowdSec LAPI** source
(`POST /admin/threat-intel/crowdsec`). See [Threat Intel](/docs/security/threat-intel-webhooks).

**Varnish Cache.** Global on/off switch for the [Varnish integration](/docs/configuration/varnish)
(`POST /admin/settings/varnish` with `varnish_enabled`, `varnish_addr`). While off, every service
proxies straight to its backend even if individually marked cacheable. `varnish_addr` **must be a
loopback address**. Other addresses are rejected because that port would bypass the WAF pipeline.

**Email alerts.** Configure the [daily report / ban alert](/docs/configuration/email-alerts) emails
(`POST /admin/settings/email` with `email_enabled`, `email_to`, `email_token`). Delivery is via
**Cloudflare Email Service**. **Only the recipient list and the Cloudflare API token are
configurable**; the SMTP host, port, username, and sender are fixed in code. The token field is never
pre-filled once saved, so leave it blank on subsequent saves to keep the existing value. **Send test
report** (`POST /admin/settings/email/test`) sends an on-demand report from the currently saved config,
so you can verify credentials before enabling the schedule.

**Database backup.** For SQLite deployments, `POST /admin/settings/backup` downloads a consistent,
vacuumed copy of `waf.db` while the server remains live. External backends need their native backup
tools. Treat a download as sensitive. With `--db-key-file`, live credentials inside it remain
encrypted, and the key is deliberately not included.

**Database connection.** The card can build a MySQL/MariaDB or Postgres-compatible connection from
separate fields, or accept a raw DSN. **Test connection** performs a five-second dial and ping without
changing the live server. **Migrate configuration here** copies services, rules and settings,
secrets, certificates, API keys, threat-intel data, webhooks, threat scores, and JA4 reputation into
an empty target; request logs, sessions, and transient rate-limit state are excluded. The source is
never modified, but a partially written target may need to be emptied before retrying a failed
migration. Test results show the `--db-driver` and `--db` flags to use on restart; saving or migrating
does not switch the current process. The migration connection has no key-file input, so secret values
land in the target as plaintext; keep `--db-key-file` on the restarted service so its first startup
seals them in place immediately. Certificate records migrate, while their referenced cert/key files
remain under `--certs` on disk.

**API Keys.** The **API Keys** card creates and revokes bearer tokens for the [REST
API](/docs/configuration/rest-api). Enter a **name** (e.g. `ci-deploy`), optionally check
**Read-only** to scope the key to `GET` requests only (every write returns `403`), and click
**Create key** (`POST /admin/settings/api-keys` with `name`, `read_only`) — the **full key is shown
exactly once**; copy it immediately, since only its hash and a short display prefix are stored
afterward. A key's row shows a **Read-only** badge when scoped that way. **Revoke** a key with its
row's delete control (`DELETE /admin/settings/api-keys/:id`) — any request already using that token
is rejected on its very next call.

**AI Classification.** The per-IP [threat score](/docs/security/threat-score)'s ASN/hosting component
is a hardcoded keyword heuristic by default. The **AI Classification** card lets you refine it with
[TypeSafe](https://typesafe.ai): once enabled with an API key, an ASN organization name the heuristic
doesn't recognize is judged once, off the request path and off the logging worker, and the result is
cached — so this never adds latency to a request. Toggle **Enable AI-assisted ASN classification** and
paste a **TypeSafe API key** (`POST /admin/settings/typesafe` with `typesafe_enabled`,
`typesafe_api_key`); the key field is never shown again once saved, so leave it blank on later saves
to keep the stored value. Off by default — the keyword heuristic keeps working without this.

**Reload custom WAF rules.** If you use `--waf-rules` to layer custom `.conf` files on top of the
OWASP CRS, editing those files on disk is **not** picked up automatically. Send `SIGHUP` to the
running process (`kill -HUP $(pidof palisade)`) to rebuild the WAF engine in place. This is the
*only* thing that needs SIGHUP; services, bot settings, rate limits, and everything else in this
section already hot-reload on save.

## Dashboard home, notifications & metrics

- **Home** (`/admin`) shows overview counters (requests, blocked, challenged, visitors, block rate),
  a live strip (requests per second, latency, blocks per minute, rule hits), 24 hours of hourly
  allowed/blocked traffic, blocks by country, a card per service (route, backend health, cache, TLS),
  the latest blocked requests, and a daily log from the audit trail (`/admin/api/traffic`,
  `/admin/api/threats`).
- **Notifications** stream in over SSE (`/admin/api/notifications/stream`); mark them seen with the
  bell control.
- **Metrics** at `/admin/metrics` serve Prometheus exposition format behind the dashboard session.
  For Prometheus, scrape `/admin/api/v1/metrics` with an API key instead. See
  [Metrics](/docs/configuration/metrics).
- **AI Usage** (`/admin/ai-usage`) lists every TypeSafe classification call.
