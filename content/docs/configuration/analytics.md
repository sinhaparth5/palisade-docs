---
sidebar_position: 8
title: ClickHouse Analytics
description: Mirror WAF telemetry into a self-hosted ClickHouse for long-term analysis in Metabase, Grafana or Superset.
keywords: [clickhouse, analytics, warehouse, metabase, grafana, long-term logs]
---

The dashboard answers a fixed set of questions, and `--retention` deletes request rows after 30
days by default. For anything older, or any question the dashboard doesn't compile in, the WAF can
**mirror its telemetry into a self-hosted ClickHouse** (added in v2.3.0). Put a BI tool such as
Metabase, Grafana or Superset on top.

It's opt-in:

```bash
./palisade --warehouse-url 'http://clickhouse:8123/?database=waf'
```

The operational database is untouched and remains the source of truth.

## What gets shipped

| Table | How | Contents |
|---|---|---|
| `waf_requests` | streamed live | Every request decision. Reproduces the dashboard's numbers, over a year instead of a day. |
| `waf_ip_rules`, `waf_geo_rules`, `waf_services`, `waf_threat_scores`, `waf_ja4_reputation` | snapshotted every 5 minutes | Dimension tables, so a join can answer questions like "was this IP already banned when it hit us, and what was its score made of?" |

The WAF creates its database and tables on first connect, so there's no init script to run.

Secret-bearing tables (`meta`, `api_keys`, `sessions`, `webauthn_credentials`, `webhook_config`,
`certificates`, `threat_intel_sources`) and the `headers_json` column are **never shipped**. That
is enforced by an allowlist.

## Performance

Like every other log hook, the sink runs off the request path, so it adds no request latency. It
batches 1000 rows or 5 seconds per insert, and **drops rows rather than blocking** if ClickHouse is
slow or down.

## Reference stack

The repository ships `deploy/docker-compose.analytics.yml` with the WAF, ClickHouse and Metabase:

```bash
docker compose -f deploy/docker-compose.analytics.yml up -d
```

Only the WAF publishes ports. ClickHouse and Metabase stay on an internal network.

:::warning[Keep the warehouse private]
ClickHouse holds a full copy of request telemetry, so it must not be reachable from the internet. To
reach Metabase from outside, don't publish its port. Add it as a [service](/docs/configuration/dashboard)
(for example Host `analytics.example.com`, backend `http://metabase:3000`) so it inherits the WAF's
TLS, bot challenge, geo rules and rate limiting. Its own page loads will then show up as request rows
in your analytics; filter them out by `app_name`.
:::
