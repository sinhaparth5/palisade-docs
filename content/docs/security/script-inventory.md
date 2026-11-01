---
sidebar_position: 6
title: Script Inventory
description: A report-only Content-Security-Policy per service that records every script origin your pages load and alerts when a new one appears.
keywords: [content security policy, csp, report-only, script inventory, magecart, supply chain, pci dss]
---


A compromised analytics tag or CDN script can skim every form on your site without touching your
server. The script inventory shows which script origins your pages actually load and tells you
when a new one appears.

## Turning it on

On a service's **Schema** tab, set **Script inventory** to *report* and optionally enter a
policy (`POST /admin/services/csp/:id` with `csp_mode=report` and `csp_policy`). The default policy
is `script-src 'self'`. Leave out `report-uri` and `report-to`; Palisade adds them. The policy is
limited to 4096 printable ASCII characters.

Palisade then adds to every `text/html` response from that service:

- `Content-Security-Policy-Report-Only: <your policy>; report-uri …; report-to …`
- `Reporting-Endpoints`, pointing at `/_cz/csp-report?s=<service id>`

Because the policy is **report-only**, browsers never block anything. They only report what the
policy would have blocked. There is no enforce mode; if you want to enforce a CSP, send it from your
application.

## What gets recorded

The `/_cz/csp-report` collector accepts both the old `application/csp-report` format and the
Reporting API's `application/reports+json`. It keeps only `script-src` violations and records, per
service:

- the script **origin**, or `inline`, `eval` or `data:`;
- the page path it was first seen on (query string dropped);
- when it was first seen.

The inventory is shown in the service's view in the dashboard.

## Alerts

The first time a new script source shows up for a service, Palisade:

- sends a [webhook](/docs/security/threat-intel-webhooks#webhook-event-delivery) event in the new `scripts`
  category (opt in with its checkbox), with the source in the `Host` field;
- sends an [email alert](/docs/configuration/email-alerts) when email is configured.

## Limits

The collector is a plain route: it is never challenged, proxied or logged as a request, and it
always answers `204`. Report bodies are capped at 64 KiB, reports are rate-limited per client, and
each service stores at most 500 sources, so a flood of fake reports can't fill the database.
