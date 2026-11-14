---
sidebar_position: 6
title: FAQ
description: Frequently asked questions about Docker, databases, geo data, config files, scaling, and credentials.
keywords: [faq, frequently asked questions, docker, database, config file]
---


**Do I need Docker?** No. Native binary + systemd installation remains supported. A published
multi-architecture image is also available from GHCR for container deployments.

**Do I need a database server?** No. Everything lives in one SQLite file. MySQL and Postgres support
was removed in v3.2.8 (see [Upgrading](/docs/installation/upgrading)), and Redis in v2.10.3.

**Do I need a MaxMind account for geo blocking?** No. A GeoLite2-Country database is bundled. You can
optionally override it with a freshly downloaded `.mmdb` via `--geo-db`.

**Is there a config file?** Not for the running server — it's configured by CLI flags plus the
dashboard/database. (Older docs referencing `config.yaml` predate the move to flags.)

**Can I run multiple instances?** Yes, behind a load balancer, with `--trusted-proxies` set to the
load balancer's address or CIDR. Each instance has its own SQLite database, so state is not shared:
rate limits, autoban bans and waiting-room queues are per node. To keep configuration in step, export
it from one node with `palisade config export` and import it on the others with
`palisade config import --replace`
([details](/docs/configuration/cli#config-export--config-import--move-configuration-as-a-file)).

**Can I manage services/IP rules without the dashboard UI?** Yes — a bearer-token-authenticated
[REST API](/docs/configuration/rest-api) at `/admin/api/v1` covers services, IP and geo rules, bans,
WAF rule exceptions, virtual patches and custom rules, plus request logs and stats, for scripting and
CI integrations. A read-only [MCP server](/docs/configuration/rest-api#mcp-server-for-ai-assistants)
lets AI assistants such as Claude search logs and inspect requests. Create a key from **Settings → API Keys**.

**Can several people use the dashboard?** Yes. Since v3.0.0 there are multiple admin users with
`owner`, `admin` and `viewer` roles, plus optional OIDC single sign-on. See
[Users, Roles & SSO](/docs/configuration/users-and-sso).

**Can I disable a WAF rule for just one backend?** Yes — the disable form on the **WAF Rules** page
has a **Scope** selector; pick a service instead of Global. See
[Per-service exceptions](/docs/security/waf#per-service-exceptions).

**Where does it store data?** In the SQLite file given by `--db`; the installer uses `/var/lib/palisade/waf.db`. TLS files live under `--certs`. Installer-managed
secrets use `/etc/palisade/db.key`, which must be backed up separately from the data directory.

**How do I reset an admin password?** Each user changes their own password from **Settings** while
signed in. If someone is locked out, an owner can delete the user and
[invite them again](/docs/configuration/users-and-sso#adding-users), or reset their 2FA. Re-running
`palisade setup` on its own is idempotent and won't overwrite an existing password.

With shell access to the server you can recover any account, including the only owner:

```bash
sudo -u palisade palisade setup --db /var/lib/palisade/waf.db \
  --admin-email you@example.com --reset-password   # type the new password
sudo -u palisade palisade setup --db /var/lib/palisade/waf.db \
  --admin-email you@example.com --reset-2fa        # lost authenticator or passkey
sudo -u palisade palisade setup --db /var/lib/palisade/waf.db --list-users
```

Both resets sign out that user's sessions and are recorded in the audit log. See
[Locked out: recovery from the shell](/docs/configuration/cli#locked-out-recovery-from-the-shell).

**Is there a Windows build?** No. Since v3.2.8 releases are Linux-only (`amd64` and `arm64`).
