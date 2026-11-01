---
sidebar_position: 5
title: Troubleshooting
description: Common problems and how to fix them — certificates, ACME, rate limiting, blocking, and systemd.
keywords: [troubleshooting, common problems, certificate warning, rate limiting issues]
---


**Dashboard shows a certificate warning.** Expected with a self-signed cert — add a browser
exception, or configure a domain + ACME from **Settings → TLS** to get a trusted Let's Encrypt cert.
See [TLS Setup](/docs/configuration/tls).

**ACME certificate isn't issued.** Ensure DNS for your domain points at the server, that ports 80
and 443 are reachable from the internet, and that you started the binary with both `--listen :80`
(for the HTTP-01 challenge) and `--listen-tls :443`. If port 80 is already taken, Palisade now
refuses to start in TLS mode; free the port (or stop the other web server) and restart.

**All clients share one IP / rate limiting blocks everyone.** You're likely behind a proxy or load
balancer but haven't set `--trusted-proxies`, so the real client IP isn't being read from
`X-Forwarded-For`. Add the proxy's IP or CIDR to `--trusted-proxies` (in
`/etc/palisade/palisade.env` on installer-managed hosts). Conversely, if you set
`--trusted-proxies` too broadly while directly internet-facing, clients could spoof their IP — only
list CIDRs you actually trust. See [Trusted Proxy & Real Client IP](/docs/security/trusted-proxy).

**WAF detects but doesn't block.** Make sure you're on a normal build (blocking is enabled after the
CRS includes by design). Check whether the specific rule was disabled from the dashboard, globally or
for that service, and that the client isn't on the [trusted IPs](/docs/security/blocking#trusted-ips)
list. See [WAF Inspection](/docs/security/waf).

**A user reports a block page.** Ask for the request ID shown on the page and search for it on the
**Logs** page; the request inspector shows the stage and rule that blocked it. If it's a false
positive, **Create exception** disables that rule for that service only.

**Search engines or link previews are challenged.** Crawlers only skip the challenge once their
source verifies (reverse DNS, network, or a Web Bot Auth signature). A crawler that isn't on the
built-in list, or your own uptime monitor, needs a `--trusted-crawlers` pin. See
[Verified crawlers](/docs/security/bot-and-fingerprinting#verified-crawlers).

**A static asset returns 503 through Varnish.** Usually a backend header larger than Varnish's
limits. Re-run the installer (it raises them), or add a `bypass` [cache rule](/docs/configuration/varnish#per-path-rules)
for that path. Varnish fetch errors are logged with cache status `ERROR`.

**A backend can't be added.** The add wizard probes the backend first; if it's unreachable from the
WAF host, the save is rejected. Verify the backend URL and network path.

**My extra flags vanished after an upgrade.** The installer rewrites the unit file every time. Move
them to `PALISADE_FLAGS=` in `/etc/palisade/palisade.env`. See
[Adding your own flags](/docs/installation/systemd#adding-your-own-flags).

**Locked out of the dashboard.** Another owner can reset your 2FA or re-invite you. See
[Users, Roles & SSO](/docs/configuration/users-and-sso). If you were signed in elsewhere, remember each
user has one live session; signing in on one device signs the others out.

**Service won't start under systemd.** `sudo journalctl -u palisade -e` for the error. Common
causes: port already in use, missing `CAP_NET_BIND_SERVICE` (binding 80/443), or a bad `--db`/`--certs`
path the service user can't write. If stored secrets are encrypted, a missing or wrong
`--db-key-file` also stops startup rather than silently clearing configuration.

**Logs growing too large.** Confirm the prune timer is active (`systemctl list-timers | grep palisade`)
or add a cron job calling `palisade prune`. See [Log Retention & Pruning](/docs/configuration/log-retention).

**REST API returns 401 or 429.** `401` means the `Authorization: Bearer <key>` header is missing,
malformed, or the key was revoked/never existed — create a new one from **Settings → API Keys**.
`429` means the calling IP crossed the same 5-failures-in-15-minutes lockout the dashboard login uses;
wait for the lockout to expire (the response includes the remaining time) rather than retrying
immediately. See [REST API](/docs/configuration/rest-api).
