---
title: TLS on Kubernetes
description: Three ways to serve HTTPS with the Helm chart — at the Ingress, with Palisade's built-in ACME, or with a cert-manager certificate — plus HTTP/3.
keywords: [kubernetes, tls, cert-manager, acme, lets encrypt, ingress, http3, ja4]
---

Pick one of three setups. Each has a values file in the chart's
[`examples/`](https://github.com/sinhaparth5/palisade-waf/tree/main/deploy/helm/palisade/examples) directory.

| | 1. Ingress terminates | 2. Palisade, built-in ACME | 3. Palisade, cert-manager Secret |
|---|---|---|---|
| Values | `tls-ingress.yaml` | `tls-acme.yaml` | `tls-cert-manager.yaml` |
| Service | ClusterIP + Ingress | LoadBalancer | LoadBalancer |
| JA4 fingerprints | no | yes | yes |
| HTTP/3 | no | yes (`tls.http3`) | yes (`tls.http3`) |
| Per-service mTLS | no | yes | yes |
| ACME and uploaded certs from the admin UI | no | yes | yes |

## 1. The Ingress terminates TLS

cert-manager issues the certificate for the Ingress and the controller sends plain HTTP to Palisade.
Palisade never sees the TLS handshake, so it loses everything that comes from it:
[JA4 fingerprints](/docs/security/bot-and-fingerprinting) and the reputation built on them, HTTP/3,
per-service client certificates (mTLS), and certificates managed in the admin UI. It still learns
that the client used HTTPS from `X-Forwarded-Proto`, so cookies keep the `Secure` flag. Set
`flags.trusted-proxies` as in [Client IP](/docs/kubernetes/networking#client-ip).

```yaml title="tls-ingress.yaml"
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
  hosts: [waf.example.com]
  tls:
    - secretName: palisade-ingress-tls
      hosts: [waf.example.com]
flags:
  trusted-proxies: 10.0.0.0/14
```

The chart refuses `ingress.enabled` together with Palisade's own TLS: plain HTTP would only redirect,
in a loop.

## 2. Palisade terminates TLS with built-in ACME

The `setup` init container stores `tls.acme.domain` as the primary domain, with the contact address,
on every start. Other services get certificates by turning on ACME in the admin UI (see
[TLS](/docs/configuration/tls)). Let's Encrypt checks the HTTP-01 challenge on port 80 of the Service,
so keep that port reachable from the internet (`loadBalancerSourceRanges` included), or issuing and
renewing fail. Certificates are cached in `/data/certs` on the volume, so a restart doesn't issue new
ones.

```yaml title="tls-acme.yaml"
admin:
  email: you@example.com
  existingSecret: palisade-admin
tls:
  acme:
    domain: waf.example.com
  http3: true   # optional; needs a load balancer that carries UDP next to TCP
service:
  type: LoadBalancer
  externalTrafficPolicy: Local
  annotations:
    cloud.google.com/l4-rbs: enabled   # GKE only, for HTTP/3
```

Point the domain's DNS at the load balancer's IP before installing.

## 3. Palisade terminates TLS with a cert-manager certificate

Point `tls.existingSecret` at a Certificate's Secret. Palisade serves it for every name that has no
ACME or uploaded certificate. When cert-manager renews it, the kubelet updates the mounted files
(within about a minute) and Palisade rereads them (within another minute), with no restart.

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata: {name: palisade-tls, namespace: palisade}
spec:
  secretName: palisade-tls
  dnsNames: [waf.example.com, shop.example.com]
  issuerRef: {kind: ClusterIssuer, name: letsencrypt}
```

```yaml title="tls-cert-manager.yaml"
tls:
  existingSecret: palisade-tls
service:
  type: LoadBalancer
  externalTrafficPolicy: Local
```

Palisade is the edge here, so cert-manager's HTTP-01 solver, which routes the challenge through an
Ingress, can't answer; **use a DNS-01 issuer**. Don't remount the Secret with `subPath` in
`extraVolumeMounts`: those mounts never update.

## Notes for setups 2 and 3

Plain HTTP only redirects to HTTPS and answers ACME, and the probes switch to HTTPS. Without
`tls.existingSecret`, an init container makes a self-signed certificate at every start for clients
that send no server name, such as the kubelet's probes or someone browsing by IP.

**HTTP/3** (`tls.http3: true`) adds a UDP port to the Service with the same number as the HTTPS port
and advertises it to browsers in `Alt-Svc` (`--h3-advertise-port`). Services opt in in the admin UI.
The load balancer has to carry UDP and TCP on one IP. On GKE that needs the backend service-based load
balancer (`cloud.google.com/l4-rbs: enabled`, set when the Service is created); the default one
refuses the Service with "mixed protocol is not supported".
