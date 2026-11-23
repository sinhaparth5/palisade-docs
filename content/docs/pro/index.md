---
title: Palisade Pro (coming soon)
description: A paid edition of Palisade for running it across many servers, for a team, or under an audit. It is being built now.
keywords: [palisade pro, paid, pricing, cluster, enterprise, roadmap]
---

:::note
Palisade Pro is in development and not on sale yet. Plans and pricing aren't final. This page will
be updated when it launches.
:::

Palisade Pro is a paid edition built on top of the open-source server. Open-source Palisade stays
complete on a single server, and **nothing that is free today will move behind a license**. Pro only
adds features for running Palisade across many servers, for a team, or under an audit.

Without a license key, the Pro binary behaves exactly like the free WAF. If a license expires, the
paid features turn off and the WAF keeps protecting your traffic.

## Being built now

- **Cluster config sync**: replicas follow a primary node, so you configure services, rules and
  settings once and every node picks them up. Today you'd do this by hand with
  `palisade config export` / `import` (see the [FAQ](/docs/faq)).
- **Fleet bans and rate limits**: an IP banned or blocked on one node is blocked on all of them within
  seconds, so an attacker spread across a load balancer doesn't get a separate budget per node.
- **SIEM / log export**: ship request logs and the audit log to syslog, Splunk, Elastic,
  OpenTelemetry or any HTTPS endpoint.
- **Central logs**: see the whole fleet's requests on the primary's Logs page and dashboards, with a
  column for the node that served each request.

## Planned

- **Config history and rollback**: see who changed what and restore any earlier version in one click.
- **Managed rule feed**: signed virtual patches for new CVEs, delivered daily without a new release.
- **Compliance reports**: PCI DSS 4.0 script inventory (6.4.3 / 11.6.1) and a monthly security
  report, as PDF or CSV.
- **Change approval**: selected settings need a second admin to approve before they apply.
- **Per-service admin scopes**: give an admin or viewer access to only some services.

Licenses are verified offline, so Pro works on air-gapped servers with no call home.

## Want it early?

Follow the [GitHub repository](https://github.com/sinhaparth5/palisade-waf) for the release, or open
an issue there to tell us which of these features you need most.
