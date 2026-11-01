---
sidebar_position: 6
title: FAQ
description: Frequently asked questions about Docker, databases, geo data, config files, scaling, and credentials.
keywords: [faq, frequently asked questions, docker, database, config file]
---


**Do I need Docker?** No. Native binary + systemd installation remains supported. A published
multi-architecture image is also available from GHCR for container deployments.

**Do I need a database server?** No. SQLite is the default. MySQL/MariaDB and Postgres-compatible
servers are optional alternatives. Redis is no longer used (it was removed in v2.10.3).

**Do I need a MaxMind account for geo blocking?** No. A GeoLite2-Country database is bundled. You can
optionally override it with a freshly downloaded `.mmdb` via `--geo-db`.

**Is there a config file?** Not for the running server — it's configured by CLI flags plus the
dashboard/database. (Older docs referencing `config.yaml` predate the move to flags.)

**Can I run multiple instances?** Yes, behind a load balancer. Use an external database for shared
state and set `--trusted-proxies` to the load balancer's address or CIDR. Rate limits, autoban
scores and waiting-room queues are kept in memory per node. Dashboard-triggered in-memory reloads
affect only the node handling that request, so reload or restart peer nodes after configuration
changes.

**Can I manage services/IP rules without the dashboard UI?** Yes — a bearer-token-authenticated
[REST API](/docs/configuration/rest-api) at `/admin/api/v1` covers services, IP rules, and bans, for
scripting and CI integrations. Create a key from **Settings → API Keys**.

**Can several people use the dashboard?** Yes. Since v3.0.0 there are multiple admin users with
`owner`, `admin` and `viewer` roles, plus optional OIDC single sign-on. See
[Users, Roles & SSO](/docs/configuration/users-and-sso).

**Can I disable a WAF rule for just one backend?** Yes — the disable form on the **WAF Rules** page
has a **Scope** selector; pick a service instead of Global. See
[Per-service exceptions](/docs/security/waf#per-service-exceptions).

**Where does it store data?** In the backend selected by `--db-driver` and `--db`; the installer
defaults to `/var/lib/palisade/waf.db`. TLS files live under `--certs`. Installer-managed
secrets use `/etc/palisade/db.key`, which must be backed up separately from the data directory.

**How do I reset an admin password?** Each user changes their own password from **Settings** while
signed in. If someone is locked out, an owner can delete the user and
[invite them again](/docs/configuration/users-and-sso#adding-users), or reset their 2FA. Re-running
`palisade setup` is idempotent and won't overwrite an existing password. There is no
password-reset subcommand, so losing the **only** owner account means restoring a known-good
database backup. Keep a second owner, or set up [SSO](/docs/configuration/users-and-sso#single-sign-on-oidc)
alongside the local login.
