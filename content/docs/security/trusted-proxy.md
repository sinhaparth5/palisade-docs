---
sidebar_position: 6
title: Trusted Proxy & Real Client IP
description: How the real client IP is resolved for blocking, geo, rate limiting, and logging — and why forwarded headers are not trusted by default.
keywords: [trusted proxy, real client ip, x-forwarded-for, cloudflare]
---


The client IP used for blocklist, geo, rate limiting, and logging is resolved by precedence:

1. `CF-Connecting-IP` — **only** when the socket peer is in Cloudflare's published ranges.
2. `X-Forwarded-For` / `X-Real-IP` — **only** when the socket peer is in a configured trusted-proxy
   IP or CIDR (`--trusted-proxies`). `X-Forwarded-For` is walked **from the right**, skipping
   trusted hops, so the first untrusted address wins. A client can't choose its own address by
   putting a fake entry at the left of the header.
3. Otherwise, the **raw socket peer address**.

Every forwarded value must parse as an IP address. Garbage falls back to the socket peer. The admin
login lockout uses the same resolver.

**Forwarded headers are never trusted by default.** Without `--trusted-proxies`, a direct client
cannot forge its source IP to evade IP/geo blocks or reset its rate-limit bucket.

## What the backend receives

Before proxying, Palisade rewrites `X-Forwarded-For`, `X-Real-IP` and `CF-Connecting-IP` from the
resolved client IP, so the backend never sees a value the client made up. The request log keeps the
headers the client actually sent.

When Palisade terminates TLS itself, it also sends `X-Forwarded-Proto: https`, so backends that build
absolute URLs (OIDC issuers, OAuth redirects) use the right scheme. A TLS-terminating proxy's own
header (Cloudflare, for example) is kept on plain-HTTP requests.

## Cloudflare TLS fingerprints

The `Cf-Ja4` and `Cf-Ja3-Fp` headers are read only when the socket peer is a Cloudflare address.
From anyone else Palisade uses the fingerprint it computed from the handshake. See
[JA4 / JA3 TLS fingerprinting](/docs/security/bot-and-fingerprinting#ja4--ja3-tls-fingerprinting).

:::warning[All clients showing the same IP?]
If all clients appear to share one IP (and rate limiting blocks everyone), you're likely behind a
proxy or load balancer but haven't set `--trusted-proxies`, so the real client IP isn't being read
from `X-Forwarded-For`. Add the proxy's IP or CIDR to `--trusted-proxies`. Conversely, if you set
`--trusted-proxies` too broadly while directly internet-facing, clients could spoof their IP — only
list CIDRs you actually trust.
:::
