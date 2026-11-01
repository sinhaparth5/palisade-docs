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
restarts the service. **Admin credentials, certificates, the encryption key, and the selected
database backend are preserved on upgrade.** Pin a version with:

```bash
curl -fsSL https://waf-install.astrareconslabs.com/palisade-waf/install.sh | sudo PALISADE_VERSION=v3.1.0 bash
```

Extra flags you put in `/etc/palisade/palisade.env` survive upgrades; the installer regenerates the
unit file but never touches that file. See
[Running as a systemd Service](/docs/installation/systemd#adding-your-own-flags).

For source installs, `git pull && make build`, then restart the service/process.

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
