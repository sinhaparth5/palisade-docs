---
sidebar_position: 3
title: TLS / HTTPS
description: Plain HTTP, automatic Let's Encrypt, your own certificates, per-service TLS resolved by SNI, HTTP/3, and client-certificate (mTLS) authentication.
keywords: [tls, https, lets encrypt, acme, certificates, per-service tls, http3, quic, mtls, client certificates]
---


There are three modes, mixable per service:

- **Plain HTTP** (default) — no TLS.
- **Automatic Let's Encrypt (ACME)** — provide a domain + contact email; certificates are issued on
  first HTTPS request and cached on disk.
- **Your own certificate** — supply a PEM cert/key as the global fallback, and/or upload a custom
  cert **per service** from the dashboard.

**Per-service TLS:** each backend can have its own uploaded cert or its own auto-issued cert.
Certificates are resolved by SNI: per-service custom cert → per-service/legacy autocert → global
fallback. Uploaded private keys are stored **on disk** under `certs/services/<name>/` with `0600`
permissions — never in the database.

## 1. Self-signed (IP-based deployments)

Generate a cert and point the binary at it:

```bash
palisade gencert --cert /var/lib/palisade/certs/self-signed.crt \
  --key /var/lib/palisade/certs/self-signed.key --hosts 203.0.113.10
# then run with:
--listen :80 --listen-tls :443 \
--tls-cert /var/lib/palisade/certs/self-signed.crt \
--tls-key  /var/lib/palisade/certs/self-signed.key
```

The `gencert` subcommand produces a self-signed **ECDSA P-256** certificate with hostname/IP SANs,
so IP-based deployments get HTTPS without openssl. Browsers will warn on a self-signed cert; add an
exception, or move to ACME once you have a domain.

## 2. Automatic Let's Encrypt (ACME)

Store a domain + contact email (the installer does this when you enter a domain; manually it's
`setup --domain … --acme-email …`), then run with `--listen :80` (for the ACME HTTP-01 challenge +
redirect) and `--listen-tls :443`. The certificate is provisioned on the first HTTPS request and
cached under `--certs`. **DNS for the domain must point at the server before the first request.**

In TLS mode the `:80` listener (ACME challenges and the HTTPS redirect) is bound before Palisade
starts serving. If the port is taken, startup fails instead of silently breaking certificate renewal.

## 3. Per-service certificates

From a service's **Manage** panel, upload a custom cert/key or enable per-service auto-issue.
Certificates are resolved by SNI at handshake time: **per-service custom → per-service/legacy
autocert → global fallback.** Uploaded private keys are stored on disk (`certs/services/<name>/`,
mode `0600`), never in the database.

See [Certificates & per-service TLS](/docs/configuration/dashboard) in the dashboard walkthrough for
the exact forms and routes.

Palisade offers HTTP/2 (`h2`) and HTTP/1.1 over TLS. When it terminates TLS it sends
`X-Forwarded-Proto: https` to the backend.

## HTTP/3 (QUIC)

Start Palisade with `--listen-h3 :443` (UDP, needs `--listen-tls`) and turn on **HTTP/3** on a
host-matched service's **TLS** tab (`POST /admin/services/http3/:id`).

- Opted-in hosts get an `Alt-Svc` header on their TCP responses, so browsers switch to QUIC.
- Any other host asked for over QUIC gets `421 Misdirected Request`, and the client falls back to
  TCP.
- 0-RTT is disabled, so replayed early data can't reach a backend.
- JA4 fingerprints of QUIC handshakes start with `q`.
- Remember to open UDP 443 in your firewall.

## Client certificates (mTLS)

A host-matched service can require clients to present a certificate from your own CA. Configure it on
the service's **TLS** tab (`POST /admin/services/mtls/:id`):

| Field | Meaning |
|---|---|
| `mtls_mode` | `off`, `optional` or `required`. |
| `mtls_ca` | PEM of the CA certificate(s) that issue your client certificates. Stored on disk at `certs/services/<name>/client-ca.pem`. |
| `mtls_allow` | Optional allowlist, one per line: certificate CNs, DNS SANs, or SHA-256 fingerprints. |

- Palisade only **asks** for a client certificate during the handshake for hostnames that have a
  policy, so other services are unaffected. This works over HTTP/2 and HTTP/3.
- The certificate is checked on every request against the policy of the request's **Host**, so
  sending one SNI name and another `Host` can't skip the check.
- `required` without a valid (and, if set, allowlisted) certificate is a `403` logged as
  `mtls_required`. It runs before the IP blocklist, and trusted IPs are not exempt.
- `optional` lets requests without a certificate through and tells the backend what it got.
- Client-sent `X-Client-Cert-*` headers are stripped. The backend receives
  `X-Client-Cert-Verified`, `X-Client-Cert-Subject` and `X-Client-Cert-Fingerprint`; the fingerprint
  also appears in the request log.
- Revocation (CRL/OCSP) is not checked. Remove a certificate from the allowlist, or rotate the CA, to
  revoke access.
