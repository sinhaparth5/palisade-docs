---
title: Networking
description: Real client IPs behind Ingress controllers and cloud load balancers, reaching backends, exposing the admin UI and restricting traffic with a NetworkPolicy.
keywords: [kubernetes, client ip, externaltrafficpolicy, ingress-nginx, traefik, networkpolicy, admin ui]
---

## Client IP

IP rules, autoban, rate limits and the [threat score](/docs/security/threat-score) all key on the
client's address, so Palisade has to see the real one, not the proxy's or the node's.

**LoadBalancer Service straight to Palisade.** Keep the source address with
`externalTrafficPolicy: Local`; without it the node rewrites it to its own:

```bash
helm upgrade waf oci://ghcr.io/sinhaparth5/charts/palisade -n palisade --reuse-values \
  --set service.type=LoadBalancer --set service.externalTrafficPolicy=Local
```

**Behind an Ingress controller.** The controller's own Service needs `externalTrafficPolicy: Local`,
and Palisade has to trust the controller's `X-Forwarded-For` ([Trusted proxies](/docs/security/trusted-proxy)).
Pod IPs change, so trust the cluster's pod CIDR:

```bash
kubectl get nodes -o jsonpath='{.items[*].spec.podCIDR}'                         # one range per node
gcloud container clusters describe <cluster> --format='value(clusterIpv4Cidr)'   # GKE: the whole range

# ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace \
  --set controller.service.externalTrafficPolicy=Local
# or Traefik
helm install traefik traefik/traefik -n traefik --create-namespace \
  --set service.spec.externalTrafficPolicy=Local

helm upgrade waf oci://ghcr.io/sinhaparth5/charts/palisade -n palisade --reuse-values \
  --set flags.trusted-proxies=10.0.0.0/14
kubectl -n palisade create ingress palisade --class=nginx --rule="/*=waf-palisade:80"   # or --class=traefik
```

Both controllers ignore an `X-Forwarded-For` sent by the client and pass on the address they saw, so a
client can't spoof it. Turning on `use-forwarded-headers` (ingress-nginx) or
`forwardedHeaders.insecure` (Traefik) would let it, unless the controller only trusts the load
balancer. Any pod in the cluster can reach Palisade from a trusted address; use a
[NetworkPolicy](#networkpolicy) to limit that.

:::warning
**PROXY protocol isn't supported.** A load balancer that only passes the client address that way
(DigitalOcean, Hetzner, AWS NLB with instance targets) should send traffic to an Ingress controller,
which reads it (`use-proxy-protocol` in ingress-nginx, `proxyProtocol.trustedIPs` on a Traefik entry
point) and passes the address on in `X-Forwarded-For`. Where the load balancer supports it,
`externalTrafficPolicy: Local` without PROXY protocol works too.
:::

## Backends

Point a service's backend (admin UI → [Services](/docs/configuration/services)) at the backend's
Kubernetes Service by its DNS name, `http://<service>.<namespace>.svc.cluster.local:<port>`, for
example `http://shop.shop.svc.cluster.local:8080`. The name stays the same when pods are replaced, and
kube-proxy spreads requests over the ready pods. Shorter forms (`shop.shop`, `shop.shop.svc`) also
resolve through the pod's DNS search list. Don't use pod IPs: they change with every restart.

To have Palisade balance and health-check pods itself (extra backends, `least_conn`, health path),
make the Service headless (`clusterIP: None`) and list each pod of a StatefulSet by name,
`http://<pod>.<service>.<namespace>.svc.cluster.local:<port>`. Behind a Deployment, one ClusterIP
Service is simpler.

## Admin UI

By default the admin UI, its API and `/admin/metrics` listen only on `admin.port` (9090,
`--admin-listen`) behind the ClusterIP Service `<release>-palisade-admin`. On the public Service,
`/admin` goes through the proxy pipeline like any other path, so it reaches a backend or a 404, never
the login page. Reach it with a port-forward:

```bash
kubectl -n palisade port-forward svc/waf-palisade-admin 9090:9090
# then http://127.0.0.1:9090/admin
```

The admin port is plain HTTP. To use it from a browser without a port-forward, give it its own
Ingress (`admin.ingress`, routes only `/admin`), for example on an internal ingress class, a host
only reachable over the VPN, or behind an SSO proxy. The controller's `X-Forwarded-Proto` keeps
session cookies `Secure`, and `flags.trusted-proxies` lets the login throttle and `admin.allow`
(`--admin-allow`) see the real client IP. `admin.allow` then limits who may use it by IP.
`admin.port: 0` puts the admin UI back on the public port.

## NetworkPolicy

`networkPolicy.enabled` adds one NetworkPolicy for the pod. It needs a CNI that enforces it (GKE
Dataplane V2, Calico, Cilium):

```yaml
networkPolicy:
  enabled: true
  # Public ports only from the ingress controller (empty: anyone; a LoadBalancer Service needs that)
  publicFrom:
    - namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: ingress-nginx}}
  # Admin port only from the internal ingress controller (empty: nobody)
  adminFrom:
    - namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: ingress-internal}}
  # Outbound only to DNS, the backends' namespace and Let's Encrypt (empty: anywhere)
  egress:
    - to: [{namespaceSelector: {matchLabels: {kubernetes.io/metadata.name: shop}}}]
    - to: [{ipBlock: {cidr: 0.0.0.0/0, except: [10.0.0.0/8, 169.254.0.0/16]}}]
      ports: [{port: 443}]
```

`kubectl port-forward` isn't subject to it, so the admin UI stays reachable that way even with
`adminFrom` empty. When restricting egress, include everything Palisade calls out to: the backends,
Let's Encrypt, `api.pwnedpasswords.com` (password checks), webhooks, the email API, JWKS URLs and
threat feeds.
