---
sidebar_position: 5
title: Upgrading
description: Upgrade-aware installer re-run, and the source-build upgrade path.
keywords: [upgrade, update, version pinning, palisade_version]
---


Re-run the installer — it is upgrade-aware:

```bash
curl -fsSL https://waf-install.astrareconslabs.com/palisade-waf/install.sh | sudo bash
```

On an existing install it downloads + verifies the new binary, replaces it, rewrites the units, and
restarts the service. **Admin credentials, certificates and the encryption key are preserved on
upgrade.** Pin a version with:

```bash
curl -fsSL https://waf-install.astrareconslabs.com/palisade-waf/install.sh | sudo PALISADE_VERSION=v3.1.0 bash
```

Extra flags you put in `/etc/palisade/palisade.env` survive upgrades; the installer regenerates the
unit file but never touches that file. See
[Running as a systemd Service](/docs/installation/systemd#adding-your-own-flags).

For source installs, `git pull && make build`, then restart the service/process.

:::danger[Upgrading to 3.2.8 or later: MySQL and Postgres are removed]
Palisade now stores everything in SQLite. The installer moves an install that ran on MySQL or
Postgres for you: before replacing the binary it runs `palisade config export` with the old one, then
imports the file into `/var/lib/palisade/waf.db`. Services, rules, users, API keys and settings come
across. **The request log does not**, and the old database is left untouched.

Releases before v3.2.5 have no `config export`, so upgrade those to v3.2.7 first
(`PALISADE_VERSION=v3.2.7`). Without the installer, run the two steps yourself:

```bash
# with the previous release, against the old database
palisade config export --db-driver postgres --db 'postgres://...' \
  --db-key-file /etc/palisade/db.key --out config.json
# with the new release
palisade config import --db /var/lib/palisade/waf.db \
  --db-key-file /etc/palisade/db.key config.json
```

Then drop `--db-driver` and point `--db` at the SQLite file. A MySQL or Postgres `--db-driver` or
connection string now stops startup and prints these steps. `--db-driver sqlite` is still accepted so
older units keep working.
:::

:::warning[Upgrading to 3.2.8 or later: removed flags and features]
- The ClickHouse warehouse mirror is gone. A leftover `--warehouse-url` flag stops startup with the
  flag named, and the installer refuses to upgrade while `palisade.env` still sets a removed flag.
- TypeSafe ASN classification is gone; the threat score uses the built-in hosting/VPN heuristic only.
  The stored TypeSafe key and its call log are deleted on startup.
- JA3 fingerprints are no longer computed or logged (JA4 remains).
- There is no Windows release build any more.
:::

:::note[Docker volumes from before 3.2.4]
The image now runs as uid 65532. A volume created while it ran as root needs a one-time
`docker run --rm -v <volume>:/data alpine chown -R 65532:65532 /data`; Palisade prints this at startup
if the volume isn't writable.
:::

:::note[The installer supports v2.5.1 and later only]
Versions before v2.5.1 are deprecated. Pinning `PALISADE_VERSION` to anything older is refused.
:::

:::warning[Upgrading to 2.10.3 or later removes Redis]
Redis support (shared rate-limit state, blocklist sync between nodes, per-service Redis namespaces)
was removed in v2.10.3. Leftover Redis settings are deleted from the database on startup, and rate
limiting falls back to the in-process limiter. Varnish covers caching.
:::

:::note[Upgrading to 3.0.0 migrates the admin account]
v3.0.0 added [multiple admin users](/docs/configuration/users-and-sso). On first start the existing
single admin account is moved into the new users table as the **owner**, keeping its password, 2FA,
passkeys and sessions.
:::

:::warning[Coming from coraza-waf-mod 2.4.x?]
Migrate to 2.5.0 with the pinned v2.5.0 installer first. See
[Migrating from coraza-waf-mod](/docs/installation/migrating-to-palisade).
:::
