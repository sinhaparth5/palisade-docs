---
sidebar_position: 2
title: IP & Geo Blocking
description: Manual IP allow/block rules, trusted IPs, honeypot paths, automatic IP banning, bundled GeoLite2 country blocking, and block pages.
keywords: [ip blocking, geo blocking, autoban, automatic ip banning, honeypot, trusted ips, block page, maxmind]
---


Three independent mechanisms feed the same IP block list, all enforced **early** in the pipeline
(before the WAF) and all hot-reloaded on change. Manage them from the dashboard — see
[Blocks](/docs/configuration/dashboard).

## IP blocklisting

- Manual **allow/block** rules for individual IPs (or CIDR ranges), managed from the dashboard.
- Exact-match enforcement evaluated very early in the pipeline (before geo and WAF) so blocked IPs
  are rejected cheaply.
- Augmented automatically by the [threat-intel sync](/docs/security/threat-intel-webhooks) feature —
  synced IPs flow into the same blocklist and take effect immediately via hot reload.
- Also populated automatically by the **autoban** system (see below).

- Threat-intel lookups use a sorted range set searched by binary search, so feeds with hundreds of
  thousands of ranges stay fast.

## Trusted IPs

The **Trusted IPs** card under **Settings** (`POST /admin/settings/trusted-ips`) takes a list of IPs
and CIDRs that skip **every blocking stage**: IP and geo rules, the bot challenge, rate limits, the
maintenance/waiting-room gate, the WAF, and honeypot bans. Use it for your office, a monitoring
host, or a CI runner. It applies without a restart.

:::warning
A trusted IP is not inspected by the WAF at all. Keep the list short. To let a monitor past only the
bot challenge, pin it with [`--trusted-crawlers`](/docs/security/bot-and-fingerprinting#verified-crawlers)
instead.
:::

## Honeypot paths

The **Honeypots** card on the IP Rules page (`POST /admin/ip-rules/honeypots`) holds a list of paths
nobody legitimate requests, such as `/wp-login.php`, `/.env` or `/phpmyadmin`. The list is empty by
default.

- A path matches exactly or as a prefix ending in `/`, case-insensitive, on the cleaned path.
- A hit only counts when the response is a **404** (or no service matched), so a path your backend
  really serves never fires.
- A hit scores the **whole autoban threshold**, so the client is banned on its first probe (when
  autoban is on).
- Trusted IPs never trip honeypots.

## Automatic IP banning

The autoban engine watches the log fan-out pipeline and scores events per client inside a
configurable **sliding time window**. When a client accumulates enough points, it is written as a
global block rule and the blocklist is hot-reloaded. Bans expire after the configured ban duration.

### Scoring

| Event | Points |
|---|---|
| WAF block — critical class (SQLi, RCE, XSS, LFI, RFI rules, and every [virtual patch](/docs/security/waf#virtual-patches)) | **5** |
| WAF block — other rule | **2** |
| [Leaked password](/docs/security/login-protection#leaked-password-check) on a login path (logged or blocked) | **2** |
| Rate-limited | **1** |
| Unsolved bot-challenge redirect ([see Bot Protection](/docs/security/bot-and-fingerprinting)) | **1** |
| [Honeypot](#honeypot-paths) hit | **the whole threshold** |
| Backend error status (opt-in, see below) | configurable, default **1** |
| Already-blocked traffic | **0** (banned IPs never score again) |

### Scoring repeated 4xx responses

Some scanners trip no WAF rule; they just walk a wordlist and collect 404s. Turn on **Score bad
responses** in the Automatic banning card to count backend responses with these status codes
(default `400, 401, 403, 404, 405, 444`, each worth 1 point by default). Only requests Palisade let
through count. Requests for static assets (images, CSS, JS, fonts, source maps, favicons), trusted IPs, open crawler paths
and verified crawlers never score. The ban reason lists how many bad responses (and which codes)
pushed the client over.

### What never scores

- Requests with `Sec-Fetch-Site: cross-site` that aren't a top-level navigation. A third-party page
  could otherwise make a visitor's browser load attack URLs from your site with `<img>` or `fetch`
  and get that visitor banned.
- Traffic already blocked by an IP or geo rule.
- Private, loopback, link-local and unspecified addresses.

### IPv6

IPv6 clients are scored and banned by **/64**. The ban rule is the /64 CIDR, so rotating through
addresses in that prefix neither resets the score nor escapes the ban.

### Defaults and tuning

| Setting | Default | Notes |
|---|---|---|
| Enabled | **on** | Toggle from **IP Rules → Automatic banning** card |
| Score threshold | **10 points** | Ban triggers when an IP crosses this within the window |
| Window | **10 minutes** | Sliding window; resets per IP on each new event |
| Ban (hours) | **24** | How long an automatic ban lasts. `0` = never expires. |

Threshold **10 / 10 min** is roughly two critical WAF hits, four generic WAF hits, or ten
rate-limited/challenged requests.

**Threshold guidance:**

- **Default (10 / 10 min)** is appropriate for most sites — an attacker running a SQLi scan hits
  threshold in two critical-class blocks (5 × 2 = 10).
- Raise to **20+** for sites that serve developer tools, SQL-heavy search forms, or shared-IP
  environments (universities, corporate NAT) to reduce false-positive bans.

### What happens on a ban

1. A global `block` rule is written to `ip_rules` with a machine-stamped `Auto-banned — …` note
   (reason, score, timestamp). A background janitor deletes it once it is older than the ban
   duration and reloads the blocklist.
2. The in-memory IP blocklist hot-reloads — subsequent requests from the IP are rejected immediately.
3. A **ban-alert email** is sent (if email alerts are configured) with the IP address, trigger reason,
   and timestamp.
4. The IP row in the **IP Rules** page shows an amber **Auto** badge and the ban reason.

### Exemptions & admin precedence

- **Private, loopback, link-local, and unspecified IPs are never auto-banned.**
- An existing admin rule (**allow** *or* **block**) for an IP always takes precedence: the autoban
  engine calls `GetIPRuleType` before scoring, and if a manual rule exists it leaves the IP untouched —
  your manual rules are never overwritten.

### Dashboard controls

The **Automatic banning** card on the **IP Rules** page (`/admin/ip-rules`) exposes:

- **Enable / disable** toggle (`POST /admin/ip-rules/autoban` with `autoban_enabled=1`).
- **Score threshold**, **window (minutes)** and **ban (hours)** fields.
- **Score bad responses** toggle, the status codes to count, and points per hit.

Changes take effect immediately via hot reload on the `Banner` subsystem.

## Geo / country blocking

- Country-level blocking using **MaxMind GeoLite2-Country**, with the database **bundled into the
  binary** — fresh installs block by country with **no MaxMind account or download step**.
- You can override the bundled database with a newer external `.mmdb` via the `--geo-db` flag.
- The client country is resolved from the [real client IP](/docs/security/trusted-proxy), so it works
  correctly behind Cloudflare or a trusted load balancer.

Enter a **2-letter ISO country code** (`RU`, `CN`, `US` — case-insensitive) and a rule type
(`block`/`allow`) on the **Geo Rules** page; the geo blocker reloads instantly.

## Block pages

A blocked browser gets a readable HTML page with the status, a short reason category (IP, country,
WAF, rate limit, maintenance…), the site, the time, and the **request ID**. It never shows rule
details. Clients that don't ask for HTML get JSON with the same fields, including `request_id`. The
`Retry-After` and `X-WAF-Block-Reason` headers are unchanged. Search the request ID on the
[Logs page](/docs/configuration/dashboard#request-logs) to find the exact decision.

## Open crawler paths

A plain `GET` or `HEAD` (no query string, no body) for `/robots.txt`, `/sitemap.xml`,
`/sitemap_index.xml` or `/llms.txt` skips the IP and geo blocklists, the bot challenge, rate limits
and the maintenance gate, so every crawler can read them, banned or not. The WAF still inspects
them. Any other request to those paths runs the full pipeline.
