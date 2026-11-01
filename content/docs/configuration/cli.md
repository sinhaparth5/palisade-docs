---
sidebar_position: 1
title: Command-Line Interface
description: Runtime flags that bootstrap the server, plus the one-shot subcommands.
keywords: [cli, command line flags, db-driver, build-dsn, setup, prune, gencert]
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
| `--db` | `waf.db` | SQLite path, MySQL DSN, or Postgres connection URL/DSN. |
| `--db-driver` | `sqlite` | Database backend: `sqlite`, `mysql`/`mariadb`, or `postgres` plus the `postgresql`, `cockroachdb`, and `neon` aliases. |
| `--db-key-file` | *(empty)* | File containing at least 32 bytes of high-entropy key material (raw, hex, or base64) used to encrypt stored secrets with AES-256-GCM. Empty keeps secrets plaintext. |
| `--certs` | `./certs` | TLS certificate cache directory (Let's Encrypt files). |
| `--waf-rules` | *(empty)* | Directory of extra `.conf` WAF rules, loaded on top of OWASP CRS. |
| `--geo-db` | *(empty)* | Path to an external `GeoLite2-Country.mmdb`. Empty = use bundled DB. |
| `--retention` | `30` | Request-log retention in days. `0` = keep forever (used by `prune` and `--prune-interval`). |
| `--prune-interval` | `0` | Prune request logs older than `--retention` and expired sessions **in-process** at this interval, e.g. `24h`. `0` = off. For deployments with no cron or systemd timer, such as Docker. See [Log Retention & Pruning](/docs/configuration/log-retention). |
| `--warehouse-url` | *(empty)* | ClickHouse HTTP endpoint to mirror telemetry to, e.g. `http://clickhouse:8123/?database=waf`. Empty = disabled. See [ClickHouse Analytics](/docs/configuration/analytics). |
| `--tls-cert` | *(empty)* | PEM certificate file for the HTTPS fallback (self-signed). |
| `--tls-key` | *(empty)* | Matching PEM private key for `--tls-cert`. |
| `--access-log` | *(empty)* | nginx-combined-format access log file path. Empty = disabled. `install.sh` sets it to `/var/log/palisade/access.log`. See [Access Log](/docs/configuration/access-log). |
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
  --db-driver sqlite \
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
palisade setup --db-driver sqlite --db waf.db --admin-email you@example.com \
  [--domain example.com] [--acme-email contact@example.com]
# Password is read from stdin (one line).
```

- **Idempotent for credentials:** if an admin already exists, the credential step is skipped — safe
  to re-run on upgrade without overwriting a changed password. The seeded account is an **owner**;
  add more people from the dashboard ([Users, Roles & SSO](/docs/configuration/users-and-sso)).
- If `--domain` is given, the domain and ACME contact email are stored so Let's Encrypt can issue a
  certificate. `--acme-email` defaults to the admin email if omitted.
- Use the same `--db-driver` and `--db` values that the server will use. Supported driver aliases are
  the same as the runtime flags.

### `gencert` — generate a self-signed certificate

```bash
palisade gencert --cert cert.pem --key key.pem \
  --hosts 203.0.113.10,waf.internal [--days 3650]
```

- Produces a self-signed **ECDSA P-256** certificate with the given hostnames/IPs as SANs (so
  browsers don't complain about a hostname mismatch on IP-based access). Pure Go — no openssl.

### `prune` — delete old request logs

```bash
palisade prune --db-driver sqlite --db waf.db --retention 30 --vacuum
```

- Opens the DB, deletes expired sessions and request rows older than the retention window **in
  batches**, and exits.
- `--vacuum` reclaims space after deletion. SQLite runs a full rebuild plus WAL truncate and reports
  before/after size; Postgres runs its in-place `VACUUM`; MySQL treats the flag as a documented no-op.
- `--retention 0` or negative disables pruning. Intended to be run by cron or the bundled systemd
  timer. For setups with no scheduler, use `--prune-interval` on the server instead. See [Log Retention & Pruning](/docs/configuration/log-retention).

### `healthcheck` — probe a running server

```bash
palisade healthcheck --url http://127.0.0.1:8080/_cz/readyz
```

- Requests the readiness URL (default `http://127.0.0.1:8080/_cz/readyz`) and exits non-zero unless
  it returns `200`. The Docker image is built `FROM scratch` with no `curl` or `wget`, so its
  `HEALTHCHECK` uses this subcommand. See [Health probes](/docs/configuration/metrics#health-probes).

### `build-dsn` — safely construct an external database DSN

```bash
printf '%s\n' "$DB_PASSWORD" | palisade build-dsn \
  --driver postgres --host db.example.com --port 5432 \
  --username palisade --dbname palisade --sslmode require
```

The command prints a driver-correct DSN with credentials escaped safely. The password is read from
stdin (an empty line is allowed), never from a flag. Optional `--extra` accepts query parameters such
as `connect_timeout=10&application_name=palisade`. MySQL defaults to port `3306`; Postgres defaults to
`5432`.

### `version`

```bash
palisade version        # or: palisade --version
```
