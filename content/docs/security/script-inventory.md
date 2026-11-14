---
sidebar_position: 6
title: Script Inventory
description: A Content-Security-Policy per service that records every script origin your pages load, alerts when a new one appears, and can enforce an approved list.
keywords: [content security policy, csp, report-only, csp enforce, script inventory, magecart, supply chain, pci dss]
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
policy would have blocked.

## Enforce mode

Once the inventory has settled, set the mode to **Enforce: block sources not approved**
(`csp_mode=enforce`). Tick the sources you trust under **Approved sources**; only sources already in
that service's inventory can be approved. Palisade then sends a real `Content-Security-Policy`
instead of the report-only header:

- `script-src` is your policy's `script-src` (`'self'` if it has none) plus every approved source.
  Approved `inline` and `eval` map to `'unsafe-inline'` and `'unsafe-eval'`.
- The report endpoints stay, so a source that isn't approved is **blocked and still reported**. It
  shows up in the inventory, ready for approval.

If a source was first seen in the last 7 days, the form warns that the inventory may not have
settled. **Return to report-only** switches back in one click. Approvals are kept when you switch to
report-only or off, so you can return to enforce later.

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
each service stores at most 500 sources.

Reports come from browsers, so anyone can send fake ones. To stop a flood of fake reports from filling
the inventory (which would hide a real new script, since nothing new could be recorded), one client
can add at most **10 new sources per service**, then one per hour. If a new source arrives while the
inventory is full, Palisade sends one **inventory full** alert per service instead of dropping it
silently, and the service's CSP tag on the Services page is marked full.
