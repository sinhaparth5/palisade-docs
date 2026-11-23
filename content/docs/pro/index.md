---
title: Palisade Pro
description: The paid edition of Palisade for running it across many servers, for a team, or under an audit. Install the Pro binary, add a license key, and set up a cluster.
keywords: [palisade pro, paid, pricing, license, trial, cluster, replica, fleet, enterprise]
---

Palisade Pro is a paid edition built on top of the open-source server. Open-source Palisade stays
complete on a single server, and **nothing that is free will move behind a license**. Pro only adds
features for running Palisade across many servers, for a team, or under an audit.

Without a license key, the Pro binary behaves exactly like the free WAF. If a license expires, the
paid features turn off and the WAF keeps protecting your traffic. Licenses are verified offline, so
Pro works on air-gapped servers with no call home.

## Plans

Every plan starts with a 7-day free trial. See [pricing](https://palisade.astrareconslabs.com/pricing)
for prices.

| Plan | Servers | Adds |
| --- | --- | --- |
| **Starter** | 2 | Cluster sync and fleet dashboard, fleet-wide bans, rate limits and waiting room, config history and rollback, scheduled backups to S3/R2, [mesh tunnel](/docs/pro/mesh) |
| **Pro** | 5 | Starter, plus a managed rule feed for new CVEs, a false-positive finder with replay, log export to your SIEM, fleet-wide logs on the primary, PDF security reports, PCI DSS script evidence (6.4.3, 11.6.1), credential stuffing detection, shared attacker IPs, OpenAPI drafts from traffic, card numbers and secrets masked in replies |
| **Advanced** | Unlimited | Pro, plus a tamper-evident audit log, four-eyes change approval, per-service access for admins, SAML sign-on, SCIM provisioning, white-label UI and emails, config as code from Git, a long-term log archive to S3/R2, tenants for agencies and MSPs, air-gapped rule and threat bundles |

The trial has the Pro plan's features on up to 2 servers. Get a trial key by email at
[/trial](https://palisade.astrareconslabs.com/trial), one per inbox. Manage a subscription or change
plans at [/account](https://palisade.astrareconslabs.com/account).

## Install

The Pro release is one archive per CPU, `palisade-pro-<version>-linux-amd64.tar.gz` or
`-linux-arm64.tar.gz`, with `checksums.txt` beside it. Each archive holds the `palisade` server,
`palisade-agent` (for the [mesh tunnel](/docs/pro/mesh)), the agent's systemd unit and the
third-party notices.

The Pro `palisade` replaces the free binary in place: same flags, same database, same
[systemd unit](/docs/installation/systemd).

```bash
sha256sum -c --ignore-missing checksums.txt
tar -xzf palisade-pro-*-linux-amd64.tar.gz
sudo install -m 755 palisade-pro-*/palisade /usr/local/bin/palisade
sudo systemctl restart palisade
```

To go back to the free WAF, install the free binary the same way. Your configuration stays.

## Add your license key

1. Sign in to the admin UI as the owner and open **Settings → License**.
2. Paste the key (`PALISADE-1.…`) from your email and save.

The card shows the plan, the server limit, the features and the expiry date. The key is stored in
the database and checked again at every start. A new key arrives by email with each renewal or plan
change; paste it the same way. Paid plans keep working for 14 days after a key expires, so a late
renewal doesn't switch anything off. A trial key stops on its last day.

## Cluster

A cluster is one **primary** and its **replicas**. You configure services, rules, users and
settings on the primary, and replicas copy them within about 15 seconds. Each node serves traffic
on its own, so a replica that can't reach the primary keeps its last configuration.

1. Start every node with the same `--db-key-file`. Secrets in the synced configuration stay sealed
   under it, and the primary refuses to sync without one.
2. On the primary, open **Settings → Cluster**, add a replica and copy its token. It's shown once.
3. On the replica, save the token in a file only Palisade can read (`chmod 600`) and set:

   ```bash
   PALISADE_CLUSTER_PRIMARY=https://primary.example.com/admin
   PALISADE_CLUSTER_TOKEN_FILE=/etc/palisade/cluster.token
   # optional: pin the primary's key (base64 SHA-256 of its SPKI)
   PALISADE_CLUSTER_PIN=…
   ```

   Add them as `Environment=` lines with `sudo systemctl edit palisade`, then restart.

The Cluster card lists each replica with when it last synced and the version it runs. The server
limit counts every node, the primary included.

- Bans and rate limits are shared across the fleet, so an attacker spread across a load balancer
  doesn't get a separate budget per node.
- Uploaded certificates travel with the configuration. Automatic Let's Encrypt certificates don't:
  behind a load balancer the challenge can reach the wrong node, so upload the certificate on the
  primary instead.
- If the primary's admin UI isn't reachable from a replica, sync over the
  [mesh tunnel](/docs/pro/mesh#cluster-replicas-over-the-mesh).

## Questions

Open an issue on the [GitHub repository](https://github.com/sinhaparth5/palisade-waf).
