---
sidebar_position: 7
title: Prometheus Metrics
description: The Prometheus exposition endpoint and the counters, gauges, and runtime metrics it exposes.
keywords: [prometheus, metrics, monitoring, exposition format]
---


Palisade exposes a Prometheus exposition endpoint at **`/admin/metrics`**.

:::tip[Scrape with an API key]
`/admin/metrics` uses the dashboard's session-cookie login, so a Prometheus job can't authenticate to
it. Scrape **`GET /admin/api/v1/metrics`** instead: it returns the same metrics and accepts a
[REST API](/docs/configuration/rest-api) bearer key. A read-only key is enough.

```yaml
scrape_configs:
  - job_name: palisade
    metrics_path: /admin/api/v1/metrics
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/palisade.key  # the cwaf_… key
    static_configs:
      - targets: ["waf.example.com:8080"]
```
:::

## Metric reference

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `palisade_http_requests_total` | Counter | `app`, `status` | Every request handled, by final HTTP status code. |
| `palisade_http_request_duration_seconds` | Histogram | `app` | Request handling latency, including WAF inspection and proxying. Default Prometheus buckets. |
| `palisade_ip_blocked_total` | Counter | `app` | Denied by the IP blocklist. |
| `palisade_geo_blocked_total` | Counter | `app`, `country` | Denied by a country/geo rule. |
| `palisade_waf_blocked_total` | Counter | `app`, `action` | Denied by Coraza, labeled by the matched rule's action. |
| `palisade_rate_limited_total` | Counter | `app` | Denied by the per-IP rate limiter. |
| `palisade_bot_challenged_total` | Counter | `app` | Redirected to the JS proof-of-work challenge. |
| `palisade_log_queue_depth` | Gauge | — | Current buffered request-log entries waiting to be written to SQLite (see [State & storage](/docs/overview/architecture#state--storage)). Read live on every scrape, not polled. |
| `palisade_services_total` | Gauge | — | Number of backend services currently configured. |
| `palisade_rate_limit_tracked_ips` | Gauge | — | Per-IP token buckets currently held in memory. |
| `palisade_stage_duration_seconds` | Histogram | `stage` | Time spent per pipeline stage: `enrich` (ASN/bot/TLS/threat-score lookups), `blocklist` (IP + geo), `challenge`, `ratelimit`, `waf`, `proxy` (backend round trip). A request only counts toward the stages it reached. |
| `palisade_backend_up` | Gauge | `app`, `backend` | `1` while a backend is in rotation, `0` while it is marked down. See [health checks](/docs/configuration/services#multiple-backends-and-health-checks). |
| `palisade_cache_results_total` | Counter | `app`, `result` | Requests to [Varnish-cached](/docs/configuration/varnish) services by result (`hit`, `miss`, `pass`). |

Plus the standard Go runtime/process metrics (`go_*`, `process_*`) that `promhttp.Handler()` exposes
automatically.

:::note[Per-cause counters vs. adaptive-enforcement-triggered events]
`palisade_rate_limited_total` and `palisade_bot_challenged_total` increment for **both** a plain
rate-limit/challenge decision and one forced by
[adaptive enforcement](/docs/security/threat-score#adaptive-enforcement) — the metric doesn't
distinguish the two (the request log's `action` column does, via the `:adaptive` suffix).
:::

## Example output

```text
# HELP palisade_http_requests_total Total requests handled, labeled by app and final HTTP status code.
# TYPE palisade_http_requests_total counter
palisade_http_requests_total{app="api",status="200"} 18234
palisade_http_requests_total{app="api",status="403"} 112
# HELP palisade_waf_blocked_total Requests denied by the Coraza WAF, labeled by app and the matched rule's action.
# TYPE palisade_waf_blocked_total counter
palisade_waf_blocked_total{app="api",action="deny"} 47
# HELP palisade_log_queue_depth Current number of request-log entries buffered waiting to be written to SQLite.
# TYPE palisade_log_queue_depth gauge
palisade_log_queue_depth 0
```

For the live in-dashboard view of the same data, see the [dashboard home](/docs/configuration/dashboard)
(traffic and threat charts).

## Health probes

Two unauthenticated endpoints answer on every host, and are left out of the stdout request log:

| Endpoint | Returns `200` when | Otherwise |
|---|---|---|
| `GET /_cz/healthz` | the process is up (liveness) | — |
| `GET /_cz/readyz` | the database answers a ping within 2 s (readiness) | `503 db unavailable` |

Both also accept `HEAD`. Point a Kubernetes `livenessProbe`/`readinessProbe` or a load balancer
health check at them. Without curl, use the
[`healthcheck` subcommand](/docs/configuration/cli), which is what the Docker image's `HEALTHCHECK`
runs.
