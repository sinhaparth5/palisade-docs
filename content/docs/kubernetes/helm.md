---
title: Installing with Helm
description: Install Palisade on Kubernetes from the official Helm chart, with one replica, a persistent volume and Secrets for the DB key and first admin.
keywords: [kubernetes, helm, helm chart, k8s, install, oci, ghcr]
---

Since v3.4.0 Palisade ships a Helm chart. It runs Palisade as one pod with its SQLite database on a
PersistentVolumeClaim mounted at `/data`.

## Install

```bash
helm install waf oci://ghcr.io/sinhaparth5/charts/palisade -n palisade --create-namespace
```

Or from the classic Helm repository:

```bash
helm repo add palisade https://sinhaparth5.github.io/palisade-waf
helm install waf palisade/palisade -n palisade --create-namespace
```

The chart version is the Palisade version, so `--version 3.4.0` installs Palisade 3.4.0, and
`helm upgrade waf <chart> --version <next>` upgrades both. The chart source lives in
[`deploy/helm/palisade`](https://github.com/sinhaparth5/palisade-waf/tree/main/deploy/helm/palisade);
`./deploy/helm/palisade` from a checkout works anywhere this page uses the OCI reference.

## Flags and values

Every `palisade` serve flag goes under `flags:` in `values.yaml`: `--trusted-proxies` becomes
`flags.trusted-proxies` (see [CLI flags](/docs/configuration/cli)). Anything else goes in
`extraArgs`. The chart sets `--db`, `--certs` and `--listen` itself so everything lands on the volume.

```yaml
flags:
  retention: 30
  prune-interval: 24h   # no cron in the pod, so prune request logs in-process
  max-conns-per-ip: 256
  trusted-proxies: ""   # see Networking → Client IP
```

## One replica

Palisade keeps its state in one SQLite file on a `ReadWriteOnce` volume, and rate limits, autoban,
the waiting room and the verdict cache in memory. Two pods can't share either, so the chart always
runs **exactly one** pod with the `Recreate` strategy: an upgrade stops the old pod before the new one
starts, and requests fail until the new pod passes its startup probe.

Scale with CPU instead of replicas. With the full CRS on every request, a pod with 8 threads handled
about 2,600 requests a second in the project's benchmarks.

:::note
Running several replicas with shared config is part of [Palisade Pro](/docs/pro), which is still being built.
:::

## Secrets

Nothing secret goes in `values.yaml`; the chart only takes Secret names.

```bash
kubectl -n palisade create secret generic palisade-admin \
  --from-literal=password='at-least-12-characters'
helm install waf oci://ghcr.io/sinhaparth5/charts/palisade -n palisade \
  --set admin.email=you@example.com --set admin.existingSecret=palisade-admin
```

- **DB key** (`--db-key-file`, seals TOTP secrets and webhook/email tokens): the chart creates
  `<release>-palisade-db-key` on first install, carries it forward on every upgrade and keeps it on
  uninstall. Back it up with the volume; without it those secrets can't be read. To bring your own,
  create a Secret with at least 32 bytes (`openssl rand -hex 32`) and set `dbKey.existingSecret`.
  **Do this with Argo CD or `helm template`**: they can't see the cluster and would render a new key
  every time.
- **First admin**: the `setup` init container creates `admin.email` as owner with the password from
  `admin.existingSecret`, only while the database has no admin. Changing the Secret later does
  nothing. Reset a password by hand:

  ```bash
  kubectl -n palisade exec -i deploy/waf-palisade -- \
    /palisade setup --db /data/waf.db --admin-email you@example.com --reset-password
  ```

- **TLS certificate** (`tls.existingSecret`, a `kubernetes.io/tls` Secret): see [TLS](/docs/kubernetes/tls).

## Reaching the admin UI

The admin UI listens on its own port (9090) behind a ClusterIP Service, so the quickest way in is a
port-forward:

```bash
kubectl -n palisade port-forward svc/waf-palisade-admin 9090:9090
# then open http://127.0.0.1:9090/admin
```

See [Networking → Admin UI](/docs/kubernetes/networking#admin-ui) for exposing it another way.

## Production values

A starting point for production: ingress-nginx with TLS at the Ingress, your own DB key, the admin UI
only through a port-forward, metrics and access logs on. Create the Secrets first:

```bash
kubectl -n palisade create secret generic palisade-admin --from-literal=password='...'
kubectl -n palisade create secret generic palisade-db-key --from-literal=db.key="$(openssl rand -hex 32)"
helm install waf oci://ghcr.io/sinhaparth5/charts/palisade -n palisade -f production.yaml
```

```yaml title="production.yaml"
admin:
  email: you@example.com
  existingSecret: palisade-admin
dbKey:
  existingSecret: palisade-db-key   # back this Secret up with the volume
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
  hosts: [shop.example.com, api.example.com]
  tls:
    - secretName: palisade-ingress-tls
      hosts: [shop.example.com, api.example.com]
flags:
  trusted-proxies: 10.0.0.0/14   # the pod CIDR, so the controller's X-Forwarded-For is believed
  retention: 30
persistence:
  size: 10Gi   # the database grows with the request log; size it for retention
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    memory: 2Gi
accessLog:
  stdout: true
networkPolicy:
  enabled: true
  publicFrom:
    - namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: ingress-nginx}}
metrics:
  serviceMonitor:
    enabled: true
    existingSecret: palisade-metrics
    labels: {release: kube-prometheus-stack}
  prometheusRule:
    enabled: true
    labels: {release: kube-prometheus-stack}
```

The pod runs as UID/GID 65532 with a read-only root filesystem, dropped capabilities and the
`RuntimeDefault` seccomp profile. Every write goes to `/data`.

## Sizing recommendations

These are the numbers we measured and the sizes we recommend from them. Treat them as a starting
point and adjust them to your own traffic.

**What uses RAM:**

- **Base:** about 65 MiB.
- **Each extra rule set:** a service with its own rule exceptions or custom rules gets its own full
  copy of the CRS. We haven't measured the size of one copy yet.
- **Uploads:** an upload being inspected is held fully in memory, up to 12.5 MiB by default (up to
  256 MiB if you raise a service's limit). Plan for concurrent uploads × that limit.
- **Varnish sidecar (optional):** its cache size (256 MiB by default) plus about 100 MiB.

**Suggested sizing:**

| Use | CPU | RAM |
|---|---|---|
| Small site or demo (the chart's defaults) | request `100m` | request `256Mi`, limit `1Gi` |
| Moderate traffic, a few services | `500m`–1 core | `512Mi`–`1Gi` |
| Busy site | about 1 core per 400 uncached req/s | `1Gi`–`2Gi`, more with big uploads or Varnish |

On a plain VM, 1 vCPU and 1 GB of RAM runs Palisade comfortably for a small site.
