---
title: Metrics, Logs and Varnish
description: Prometheus ServiceMonitor, Grafana dashboard and alerts, access logs on stdout, and the optional Varnish sidecar in the Helm chart.
keywords: [kubernetes, prometheus, servicemonitor, grafana, prometheusrule, kubectl logs, fluent bit, varnish sidecar]
---

## Metrics

With [kube-prometheus-stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack)
(Prometheus Operator and Grafana) in the cluster, the chart can add a ServiceMonitor, a Grafana
dashboard and alerts. Prometheus scrapes `/admin/api/v1/metrics` on the admin port with an API key
(see [Metrics](/docs/configuration/metrics)):

1. In the admin UI, go to **Settings → API keys** and create a read-only key.
2. Store it in the release namespace:

   ```bash
   kubectl -n palisade create secret generic palisade-metrics --from-literal=token=cwaf_...
   ```

3. Turn it on. `release` is the label kube-prometheus-stack selects ServiceMonitors and rules by
   (its own release name):

   ```yaml
   metrics:
     serviceMonitor:
       enabled: true
       existingSecret: palisade-metrics
       labels: {release: kube-prometheus-stack}
     dashboard:
       enabled: true
     prometheusRule:
       enabled: true
       labels: {release: kube-prometheus-stack}
   ```

A replaced key in the Secret reaches Prometheus within a few minutes, when the operator next syncs
it; no restart needed.

The **dashboard** shows traffic, blocks by stage, latency per pipeline stage, the WAF verdict cache,
body inspection, the request log queue, backend health and Varnish results. Its ConfigMap carries
`grafana_dashboard: "1"`, which Grafana's dashboard sidecar picks up; if the sidecar only watches its
own namespace, set `metrics.dashboard.namespace` to it. Without the sidecar, import
[`grafana-dashboard.json`](https://github.com/sinhaparth5/palisade-waf/blob/main/deploy/helm/palisade/files/grafana-dashboard.json)
in Grafana (Dashboards → New → Import).

The **alerts**:

| Alert | Fires when |
|---|---|
| `PalisadeDown` | No successful scrape for 5 minutes (also catches a wrong key). |
| `PalisadeBlockRateHigh` | More than `blockRatio` (default 0.5) of requests blocked or rate limited for 10 minutes, at over `minRate` (default 1) requests per second. |
| `PalisadeBackendDown` | A backend out of rotation for 5 minutes. |

With `networkPolicy.enabled`, add Prometheus's namespace to `adminFrom`; with `admin.allow`, add the
pod CIDR Prometheus runs in.

## Access log

```yaml
accessLog:
  stdout: true
```

Every request is written to stdout as one nginx combined line (`--access-log -`), so `kubectl logs`
and a node agent (Fluent Bit, Promtail, Vector) pick it up. Nothing is rotated or written under
`/data`. Server messages go to stderr and start with a date instead of a client IP, so a shipper can
tell them apart by stream or format:

```text
203.0.113.7 - - [17/Nov/2026:10:04:12 +0000] "GET /?q=x HTTP/1.1" 403 - "-" "curl/8.11.1"
2026/11/17 10:04:15 palisade listening on [::]:8080 (plain HTTP, waf=true, apps=1)
```

`kubectl logs` merges both. To read only the access lines:

```bash
kubectl -n palisade logs deploy/waf-palisade -c palisade | grep -v '^[0-9]\{4\}/'
```

## Varnish sidecar

`varnish.enabled: true` runs varnishd (the official `varnish` image) as a sidecar for the
per-service [Varnish cache](/docs/configuration/varnish). Containers in a pod share loopback, so
nothing changes in Palisade: varnishd listens on `127.0.0.1:6081` and fetches misses from Palisade on
`127.0.0.1:6082`, both unreachable from outside the pod. Then, in the admin UI, turn on
**Settings → Varnish Cache** and **Cache** on each service.

```yaml
varnish:
  enabled: true
  size: 256m          # cache memory (-s malloc)
  resources:
    limits:
      memory: 512Mi   # raise with size; leave ~100Mi for varnishd itself
```

Varnish failing never takes the site down: while varnishd is starting or stopped, Palisade serves
cached services straight from the backend and logs the cache status as `ERROR`. A crashed varnishd is
restarted inside the container, so the pod stays Ready. The cache is in memory and starts empty with
every pod.

The Services page's "Cache performance" card needs `varnishstat`, which the Palisade image doesn't
have, so it shows an error there; the per-service hit ratio from the request log still works. For
Varnish's own counters:

```bash
kubectl -n palisade exec deploy/waf-palisade -c varnish -- \
  varnishstat -1 -f MAIN.cache_hit -f MAIN.cache_miss
```
