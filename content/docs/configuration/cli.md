---
sidebar_position: 1
title: Command-Line Interface
description: Runtime flags that bootstrap the server, plus the one-shot subcommands.
keywords: [cli, command line flags, setup, reset password, reset 2fa, config export, config import, prune, gencert, admin-allow]
---


The binary is configured entirely through **CLI flags** (bootstrap settings) plus the **admin
dashboard / database** (everything runtime). There is no longer a `config.yaml` that the running
server reads — all knobs are flags or DB-managed.

## Runtime flags

Start the WAF/proxy/dashboard by running the binary with any of these flags:

| Flag | Default | Description |
|---|---|---|
| `--listen` | `:8080` | HTTP listen address. |
| `--listen-tls` | *(empty)* | HTTPS listen address. Empty = HTTP only. |
| `--listen-h3` | *(empty)* | HTTP/3 (QUIC) UDP listen address, e.g. `:443`. Needs `--listen-tls`. Services opt in individually. See [HTTP/3](/docs/configuration/tls#http3-quic). |
| `--trusted-proxies` | *(empty)* | Comma-separated IPs or CIDRs allowed to supply `X-Forwarded-For` / `X-Real-IP`. A bare IP counts as a /32 or /128. See [Trusted Proxy](/docs/security/trusted-proxy). |
| `--trusted-crawlers` | *(empty)* | Extra crawlers that skip the bot challenge, pinned by source: `ua=cidr[,cidr];ua2=ip`, or `ua=https://host` to accept that host's Web Bot Auth signatures. See [Verified crawlers](/docs/security/bot-and-fingerprinting#verified-crawlers). |
| `--db` | `waf.db` | Path to the SQLite database file. |
| `--db-key-file` | *(empty)* | File containing at least 32 bytes of high-entropy key material (raw, hex, or base64) used to encrypt stored secrets with AES-256-GCM. Empty keeps secrets plaintext. |
| `--certs` | `./certs` | TLS certificate cache directory (Let's Encrypt files). |
| `--waf-rules` | *(empty)* | Directory of extra `.conf` WAF rules, loaded on top of OWASP CRS. |
| `--geo-db` | *(empty)* | Path to an external `GeoLite2-Country.mmdb`. Empty = use bundled DB. |
| `--retention` | `30` | Request-log retention in days. `0` = keep forever (used by `prune` and `--prune-interval`). |
| `--prune-interval` | `0` | Prune request logs older than `--retention` and expired sessions **in-process** at this interval, e.g. `24h`. `0` = off. For deployments with no cron or systemd timer, such as Docker. See [Log Retention & Pruning](/docs/configuration/log-retention). |
| `--admin-allow` | *(empty)* | Comma-separated IPs or CIDRs allowed to reach `/admin` (dashboard, REST API, metrics). Requests from any other client get the normal proxy pipeline, so the admin UI looks absent. Invalid entries stop startup. See [Restricting the admin UI](#restricting-the-admin-ui). |
| `--admin-listen` | *(empty)* | Extra plain-HTTP listener, e.g. `127.0.0.1:9090`, that serves only the admin UI. When set, the admin UI is removed from the public listeners. |
| `--max-conns-per-ip` | `256` | Maximum concurrent TCP connections per client (IPv6 keyed by /64). Connections over the cap are closed at accept, before TLS. Trusted proxies, Cloudflare, loopback and trusted IPs are exempt. `0` = off. |
| `--clamd` | *(empty)* | clamd address for the per-service upload malware scan: `tcp://host:port` or `unix:///path`. Empty = off. See [Malware scan](/docs/security/waf#malware-scan). |
| `--docker-discovery` | *(empty)* | Docker API to create services from container labels: `unix:///var/run/docker.sock` or `tcp://socket-proxy:2375`. Empty = off. See [Services from Docker labels](/docs/configuration/services#services-from-docker-labels). |
| `--tls-cert` | *(empty)* | PEM certificate file for the HTTPS fallback (self-signed). |
| `--tls-key` | *(empty)* | Matching PEM private key for `--tls-cert`. |
| `--access-log` | *(empty)* | nginx-combined-format access log file path, or `-` for stdout without rotation. Empty = disabled. `install.sh` sets it to `/var/log/palisade/access.log`. See [Access Log](/docs/configuration/access-log). |
| `--access-log-max-size-mb` | `100` | Rotate the access log after it reaches this many MB. |
| `--access-log-max-backups` | `5` | Number of rotated access log files (`access.log.1`, `.2`, …) to keep. |

Example (HTTP + HTTPS, behind a known load balancer):

```bash
./palisade \
  --listen :80 \
  --listen-tls :443 \
  --tls-cert /var/lib/palisade/certs/self-signed.crt \
  --tls-key  /var/lib/palisade/certs/self-signed.key \
  --trusted-proxies 10.0.0.0/8,192.168.0.0/16 \
  --trusted-crawlers "dev-portal-uptime=198.51.100.7" \
  --db /var/lib/palisade/waf.db \
  --db-key-file /etc/palisade/db.key \
  --certs /var/lib/palisade/certs \
  --retention 30
```

On an installer-managed host, put extra flags in `/etc/palisade/palisade.env` instead of editing the
unit. See [Adding your own flags](/docs/installation/systemd#adding-your-own-flags).

## Subcommands

Each subcommand does one thing and exits (it does **not** start the server).

### `setup` — seed admin credentials and optional ACME config

```bash
palisade setup --db waf.db --admin-email you@example.com \
  [--domain example.com] [--acme-email contact@example.com]
# Password is read from stdin (one line).
```

- **Idempotent for credentials:** if the account already exists, setup prints
  `already exists, password unchanged` and leaves it alone, so it is safe to re-run on upgrade. It
  prints `admin account created` only when it really created one. The seeded account is an **owner**;
  add more people from the dashboard ([Users, Roles & SSO](/docs/configuration/users-and-sso)).
- The admin email is your login name and must be a real address (text on both sides of one `@`, no
  spaces), because the login form accepts nothing else.
- The password must be at least **12 characters**, must not equal the email, and must not appear in
  the Have I Been Pwned breach list (only a 5-character hash prefix is sent; the check fails open if
  HIBP is unreachable).
- If `--domain` is given, the domain and ACME contact email are stored so Let's Encrypt can issue a
  certificate. `--acme-email` defaults to the admin email if omitted.
- Point `--db` at the same SQLite file the server uses.

#### Locked out: recovery from the shell

These run against the database directly, so they work when nobody can log in. On an installer-managed
host run them as the service user:

```bash
sudo -u palisade palisade setup --db /var/lib/palisade/waf.db ...
```

| Command | What it does |
|---|---|
| `setup --admin-email <email> --reset-password` | Reads a new password from stdin and replaces that user's password. Signs out their sessions and writes an audit row. |
| `setup --admin-email <email> --reset-2fa` | Turns off TOTP and its backup codes and removes the user's passkeys. The password is kept, and no password prompt is shown. Signs out their sessions and writes an audit row. Combine with `--reset-password` to reset both. |
| `setup --list-users` | Prints every admin user: role, disabled, TOTP, passkey count, SSO link, pending invite, created time and last session (time and IP). Read-only; never prints hashes, secrets or tokens. |
| `setup --audit [--limit n]` | Prints the newest admin audit log rows (time, actor, IP, action, target, summary), newest first. `--limit` defaults to 50, max 1000. Read-only. |

Audit rows written from the shell show the actor `palisade setup (shell)`. `--list-users` and
`--audit` can't be combined with each other, with `--admin-email`, with the reset flags or with
`--domain`. Without a reset flag, setup never changes an existing account.

### `config export` / `config import` — move configuration as a file

```bash
palisade config export --db /var/lib/palisade/waf.db --db-key-file /etc/palisade/db.key --out config.json
palisade config import --db /var/lib/palisade/waf.db --db-key-file /etc/palisade/db.key config.json
```

- Export writes services, rules, users, API keys and settings as one JSON file, to stdout or to
  `--out` (created `0600`). The request log is not included.
- Import reads a file, or stdin. It refuses a database that already has configuration unless you pass
  `--replace`, which empties the configuration tables first. A failed import leaves the database
  unchanged.
- With `--db-key-file`, secrets stay sealed (`enc:v1:`) in the file and the same key is needed to
  import it. Without a key, unsealed secrets (meta secrets, webhook secret, TOTP) are blanked.
- Owners can also download the export from **Settings → Configuration export** in the dashboard.

### `gencert` — generate a self-signed certificate

```bash
palisade gencert --cert cert.pem --key key.pem \
  --hosts 203.0.113.10,waf.internal [--days 3650]
```

- Produces a self-signed **ECDSA P-256** certificate with the given hostnames/IPs as SANs (so
  browsers don't complain about a hostname mismatch on IP-based access). Pure Go — no openssl.

### `prune` — delete old request logs

```bash
palisade prune --db waf.db --retention 30 --vacuum
```

- Opens the DB, deletes expired sessions and request rows older than the retention window **in
  batches**, and exits.
- `--vacuum` reclaims space after deletion: a full SQLite rebuild plus WAL truncate, reporting the
  before/after size.
- `--retention 0` or negative disables pruning. Intended to be run by cron or the bundled systemd
  timer. For setups with no scheduler, use `--prune-interval` on the server instead. See [Log Retention & Pruning](/docs/configuration/log-retention).

### `healthcheck` — probe a running server

```bash
palisade healthcheck --url http://127.0.0.1:8080/_cz/readyz
```

- Requests the readiness URL (default `http://127.0.0.1:8080/_cz/readyz`) and exits non-zero unless
  it returns `200`. The Docker image is built `FROM scratch` with no `curl` or `wget`, so its
  `HEALTHCHECK` uses this subcommand. See [Health probes](/docs/configuration/metrics#health-probes).

### `version`

```bash
palisade version        # or: palisade --version
```

Unknown subcommands are refused instead of starting the server.

## Restricting the admin UI

By default the admin UI answers on every listener at `/admin`, except on hosts that belong to a
service. Two flags narrow that:

- `--admin-allow 203.0.113.7,10.0.0.0/8` lets only those client IPs reach `/admin`, the REST API and
  metrics. Anyone else is handed to the normal proxy pipeline, so the admin UI looks absent. The client
  IP is resolved the same way as everywhere else ([Trusted Proxy](/docs/security/trusted-proxy)), so a
  spoofed `X-Forwarded-For` doesn't get through.
- `--admin-listen 127.0.0.1:9090` starts a separate plain-HTTP listener that serves only the admin path
  and removes the admin UI from the public listeners. Reach it over an SSH tunnel or VPN. A refused
  client on this listener gets a plain `404`; nothing is proxied from it.

The two can be combined.
