---
sidebar_position: 7
title: Security Response Headers
description: Browser-hardening headers applied to every response, plus the forced Server header.
keywords: [security headers, hsts, x-frame-options, response headers]
---


A global middleware sets browser-hardening headers on **every** response (blocked, admin, and
proxied alike):

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, only on TLS connections
  (`c.Request().TLS != nil`) so a plain-HTTP dev setup is never told to force HTTPS

The `Server` header on every response is forced to `Palisade`, overwriting whatever the
backend sent. Every request also gets an `X-Request-ID`, which is shown on
[block pages](/docs/security/blocking#block-pages) and in the request log.

## Headers removed from backend responses

So the client sees one copy of each header above, Palisade drops the backend's own versions of them
(plus the legacy `X-XSS-Protection`). It also strips headers that only fingerprint your stack:

- `X-Powered-By`, `X-AspNet-Version`, `X-AspNetMvc-Version`
- `Via` and `X-Varnish` (also unset in the bundled VCL)
- the internal `X-Cache-Service` / `X-Cache-Url` Varnish tags

:::note[Removed in v3.0.5]
`X-WAF-Engine`, `X-XSS-Protection`, `X-WAF-Request-ID` (it duplicated `X-Request-ID`),
`X-WAF-Status: inspected`, and the obsolete `interest-cohort` token in `Permissions-Policy` are no
longer sent. An earlier version also sent `X-Protected-By`. Palisade no longer advertises its engine
in response headers beyond `Server`.
:::

## Content-Security-Policy

The admin dashboard is served with a strict `Content-Security-Policy`. All its scripts, fonts and
styles are vendored into the binary, with no inline code and no external origins. Proxied responses
keep whatever CSP the backend sends. For a report-only policy on your own sites, see
[Script Inventory](/docs/security/script-inventory).
