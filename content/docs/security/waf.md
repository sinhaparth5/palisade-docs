---
sidebar_position: 1
title: WAF Inspection
description: Coraza v3 with the OWASP Core Rule Set compiled in, plus virtual patches, custom rules, rule exceptions, and opt-in response inspection.
keywords: [waf inspection, coraza, owasp crs, multipart upload limit, body size, malware scan, clamav, clamd, antivirus, sql injection, xss, rce, virtual patching, cve, custom rules, response inspection]
---


- Embeds **Coraza v3** with the **OWASP Core Rule Set (CRS) v4.25.2 LTS** compiled directly into the
  binary — there is nothing to download or mount. The rules are vendored in the source tree and kept
  on the CRS LTS line, so bypass fixes ship with Palisade releases.
- Out of the box it detects and blocks common attack classes: **SQL injection, XSS, remote code
  execution, path traversal, restricted-file access**, and **known scanner user agents**.
- [Virtual patches](#virtual-patches) block specific actively exploited CVEs before CRS scoring.
- [Custom rules](#custom-rules) can be written, tested and switched on from the dashboard or the
  REST API. Custom `.conf` rule files can also be layered on top of the CRS by pointing the
  `--waf-rules` flag at a directory.
- WAF rules can be **individually disabled** from the dashboard (the engine reads the disabled-rule
  list from the database and rebuilds itself live), so you can silence a noisy rule without editing
  files or restarting.

:::warning[Important engine behavior]
The recommended Coraza config ships in `DetectionOnly` mode by default, and the project deliberately
enables blocking (`SecRuleEngine On`) **after** the CRS includes so that rules actually block rather
than merely score. This is handled internally.
:::

## The compiled directive set

Every engine (the shared default one, and any [per-service](#per-service-exceptions) engine) is
built from the same base directive block, with `SecRuleRemoveById` appended only when there's a
disabled-rule list to apply:

```apache
<virtual patch rules>                          # ids 2000000–2099999, before CRS
Include @coraza.conf-recommended
Include @crs-setup.conf.example
Include @owasp_crs/*.conf
SecRuleEngine On
SecRequestBodyAccess On
SecRequestBodyLimit <configured limit, bytes>
SecRequestBodyLimitAction Reject
SecDebugLogLevel 0
SecResponseBodyAccess On
SecResponseBodyMimeType text/plain text/html text/xml application/json application/xml
SecResponseBodyLimit 65536
SecResponseBodyLimitAction ProcessPartial
SecRuleRemoveById <space-separated rule IDs>   # only present if the disabled-rule list is non-empty
```

**Ordering matters:** `@coraza.conf-recommended` sets `SecRuleEngine DetectionOnly`, and Coraza
applies directives in parse order. `SecRuleEngine On` must come **after** the three `Include` lines,
or every rule still matches and
scores but nothing is ever actually blocked (the request would be logged, but proxied through
anyway). If you point `--waf-rules` at a directory of custom `.conf` files, they're appended as one
more `Include "<dir>/*.conf"` directive **after** this block, followed by any enabled
[custom rules](#custom-rules) from the dashboard. Both can therefore use CRS's transformation and
collection setup, with blocking enabled before they are parsed.

Response bodies are only read for services that turn on [response inspection](#response-inspection).
Everywhere else the request path is unchanged and responses stream through untouched.

## Request body size limits

Bodies are inspected up to a size limit that depends on their declared `Content-Type`, since the
cost of running CRS's ~200 rules over a body scales with how much of it ends up in `ARGS`:

| Body shape | Limit | Why |
|---|---|---|
| `multipart/form-data` | **12.5 MiB** by default, configurable per service up to **256 MiB** | Coraza routes file parts to `FILES`, not `ARGS`, so CRS never scans the file bytes. A multipart upload at this size costs only tens of milliseconds. |
| Everything else that's inspected (JSON, plain text, etc.) | **128 KiB** | A body with no file parts is parsed into `ARGS` in full, and every byte of it is run through CRS's rule set. |
| Content types Coraza doesn't recognize as a form (images, binaries, video, arbitrary uploads) | **not inspected — streamed straight through** | Coraza only infers a body processor for `x-www-form-urlencoded` and `multipart/form-data`. Without this gate, CRS rule 901340 would force every other content type to be parsed as `URLENCODED` too, turning a binary payload into one junk `ARGS` entry per 256 bytes. |

Both limits are enforced in application code with a `413`, not by a Coraza directive — Coraza parses
`SecRequestBodyNoFilesLimit` but does not act on it
([corazawaf/coraza#896](https://github.com/corazawaf/coraza/issues/896)), and its
`SecRequestBodyLimit` is set to the 256 MiB cap so each service can raise its own limit. A request
over the limit is rejected, not silently truncated and inspected anyway.

### Multipart upload limit per service

Apps like Immich, Nextcloud or Vaultwarden upload files larger than 12.5 MiB as multipart forms. On a
service's **Uploads** tab, set **Multipart upload limit (MiB)** (or `multipart_limit_mb` in the
[REST API](/docs/configuration/rest-api)). `0` keeps the 12.5 MiB default and the most is 256 MiB;
other services keep the default. You can also lower it.

The WAF holds the whole body **in memory** while it checks it, so a high limit costs that much RAM per
upload in flight. Very large uploads (long videos) are still out of reach; for those, use a separate
service with the [request policy](/docs/security/api-protection#request-policy) and an uninspected
content type.

### Malware scan

Since v3.4.1, Palisade can send each file in a form upload to [ClamAV](https://www.clamav.net). Start
it with `--clamd` pointing at a clamd (`tcp://clamav:3310` or `unix:///run/clamd/clamd.sock`), then
set **Malware scan** on a service's **Uploads** tab (or `malware_scan` in the
[REST API](/docs/configuration/rest-api)):

| Mode | Effect |
|---|---|
| Off | No scan (the default). |
| Log only | The upload goes through and is logged as `malware_upload:log <signature>`. |
| Block | The upload is refused with `403` and logged as `malware_upload <signature>`. |

The scan runs after the WAF and the leaked-password check, on `multipart/form-data` bodies the WAF
buffered. Each file part is streamed to clamd straight from that buffer, with no extra copy in
memory. Requests from trusted IPs are not scanned. A detection, logged or blocked, counts as a
critical event in [autoban](/docs/security/blocking#scoring).

The scan **fails open**. If clamd is down, busy, too slow (2 seconds plus the file size at 16 MiB/s),
the file is over clamd's `StreamMaxLength` (100M by default) or the body can't be parsed, the upload
goes through, is logged as `malware_scan_error` and counts in `palisade_clamd_errors_total`. Alert on
that counter if a missed scan matters to you.

To run clamd next to Palisade with Docker Compose, uncomment the `clamav` service and the `--clamd`
command in the repository's `compose.yml`. On Kubernetes, use the chart's
[ClamAV sidecar](/docs/kubernetes/helm#clamav-sidecar). clamd keeps its signatures in memory, about
1.2 GiB, and takes about a minute to load them at startup; uploads pass unscanned until then.

### Slow bodies

While a body is buffered for inspection it has a read deadline of 10 seconds plus its size at
16 KiB/s. A client that sends slower than that gets `408` with `Connection: close`, so a slow upload
can't hold an inspection slot forever. Bodies that aren't inspected stream to the backend with no
deadline. Timeouts are counted in `palisade_waf_body_timeouts_total`.

### Argument limit

Coraza stops collecting arguments after 1000 per collection, and the values past that were never
inspected, so a payload placed after 1000 harmless JSON values, form fields or query parameters would
pass. Rule **2100000** now answers `400` to any request over the limit. If a service legitimately
sends more, add a [per-service exception](#per-service-exceptions) for rule 2100000.

:::note[Large binary uploads, e.g. to an S3-compatible backend]
Some backends, S3-compatible object storage in particular, accept large `application/javascript` /
`text/javascript` payloads that would otherwise hit the 128 KiB limit and CRS rule 911100 (method) /
920420 (content type). The **Uploads** toggle on a service's Manage panel (`AllowLargeJSUploads`)
exempts that one service: JavaScript-typed bodies stream to the backend unread, and `PUT`/content-type
enforcement is relaxed for it specifically. Every other header-phase rule, plus the IP/geo/bot/rate-limit
stages, still runs. Only the body-inspection gate widens, not the rest of the pipeline.
:::

## API schemas and MCP endpoints

Per-service JSON Schema validation, the OpenAPI positive security model and the MCP endpoint guard
are covered in [API & MCP Protection](/docs/security/api-protection).

## Virtual patches

Palisade ships a small pack of **virtual patches**: one precise rule per actively exploited CVE,
matched on the request detail from the vendor advisory or fix. They load **before** CRS, so a match
denies under its own rule id (in the range `2000000`–`2099999`) rather than as a CRS anomaly score.
Autoban counts every virtual patch hit as a critical block.

| CVE | Product |
|---|---|
| CVE-2016-3081 | Apache Struts `method:` prefix OGNL injection (S2-032) |
| CVE-2022-22965 | Spring4Shell |
| CVE-2022-26134 | Confluence OGNL injection |
| CVE-2023-22515 | Confluence setup takeover |
| CVE-2024-27198 | TeamCity authentication bypass |
| CVE-2024-3400 | PAN-OS GlobalProtect `SESSID` traversal |
| CVE-2024-4577 | PHP-CGI argument injection |
| CVE-2025-11953 | React Native Metro `/open-url` command injection |
| CVE-2025-29927 | Next.js middleware bypass |
| CVE-2025-32432 | Craft CMS `generate-transform` code injection |
| CVE-2025-49113 | Roundcube `_from` deserialization |
| CVE-2026-33017 | Langflow public flow code injection |

The **Virtual Patches** card on the WAF Rules page shows each patch, its hit count and per-service
status. Turning one off is an ordinary [rule exception](#disabling-a-noisy-rule), global or for one
service.

## Custom rules

The **Custom Rules** card on the WAF Rules page is an editor for your own ModSecurity rules:

1. Write one or more `SecRule` / `SecAction` directives. Rule ids must be in `1000000`–`1999999`
   and unique across your custom rules.
2. Pick a **scope**: all services, or one service.
3. Optionally add a note, then **Dry run** to replay recent traffic through it (see
   [below](#dry-run-candidate-rules)) or **Save** to compile it in.

Each rule is compiled on its own before it is saved, so a broken rule is rejected with an error
instead of breaking the WAF. Saved rules can be toggled, edited and removed from the list below the
editor (`POST /admin/waf-rules/custom`, `POST /admin/waf-rules/custom/:id/toggle`,
`DELETE /admin/waf-rules/custom/:id`). A service-scoped rule gives that service its own engine, the
same way a [per-service exception](#per-service-exceptions) does.

The same rules are available over the REST API at `/admin/api/v1/waf-rules/custom` (`GET`, `POST`,
`PUT /:id`, `DELETE /:id`) with a JSON body of `rule`, `service_name`, `note` and `enabled`. See
[REST API](/docs/configuration/rest-api).

## Response inspection

Per service, Palisade can run CRS's outbound rules (`950000`–`958999`) on backend responses to catch
leaked SQL errors, stack traces, directory listings and source code. Set it on the service's Schema
tab (`POST /admin/services/responses/:id`):

| Mode | Effect |
|---|---|
| *(off)* | Default. Responses are never read. |
| `log` | A match is logged as `response_leak:log` with the rule id; the response is delivered. |
| `block` | A match replaces the response with a `502`. |

Only identity-encoded HTML, text, JSON and XML bodies up to **64 KiB** are inspected (about
0.55 ms per KiB). Binary bodies, event streams, upgrades, `HEAD` requests and larger bodies stream
through untouched. To see plain bodies, Palisade asks the backend for an uncompressed response;
[compression](/docs/configuration/services#compression) toward the client still follows what the
client asked for. A blocked response doesn't count against the backend's health and isn't retried.

## Verdict cache

Each engine keeps a short cache of recent verdicts (5-second TTL, 4096 entries) so a burst of
identical requests is inspected once. The cache key covers the client IP, method, host, raw path and
query, every header and the body. `Cookie` and `Authorization` are part of that key like any other
header, so requests from logged-in users are cached too, but only per exact value: two users never
share a verdict. Hits and misses are counted in `palisade_waf_verdict_cache_hits_total` and
`palisade_waf_verdict_cache_misses_total`.

The engine also runs with Coraza's regex prefilter on, which skips a regex when the literals it needs
aren't in the input. Large JSON bodies are about a third cheaper to inspect and response inspection
about 80% cheaper, with the same CRS matches.

## Disabling a noisy rule

![WAF Rules page showing the Disable Rule form with CRS rule ID, scope and reason fields, the Top Firing Rules analytics table with hit counts, the Disabled Rules list, and per-service exceptions](/img/docs/docs_waf_rules.png)

The **WAF Rules** page (`/admin/waf-rules`) lists CRS rules. Disable a rule by ID with a reason
(`POST /admin/waf-rules/disable` with `rule_id`, `reason`) and re-enable it
(`DELETE /admin/waf-rules/:id`). The WAF engine rebuilds itself from the current disabled-rule list,
so the change takes effect without a restart. See the [dashboard walkthrough](/docs/configuration/dashboard).

## Per-service exceptions

By default, disabling a rule silences it for **every** service behind the WAF. This removes coverage
from unrelated backends. For example, CRS rule `911100` ("Method
is not allowed by policy") blocks any request whose HTTP method isn't in CRS's default
`tx.allowed_methods` (`GET HEAD POST OPTIONS`), so a legitimate `PATCH`/`PUT`/`DELETE` to a REST API
gets blocked as a false positive. Disabling `911100` globally fixes that one API but also removes
HTTP-method enforcement for every other service on the WAF.

The **Scope** selector on the disable form limits an exception to a specific service. Every other
service continues enforcing the rule.

Under the hood, scoped exceptions are stored in their own table
(`waf_service_rule_exceptions`, separate from the global `waf_disabled_rules` table, since the global
table's schema allows only one row per rule ID). Any service with at least one scoped exception gets
its **own compiled Coraza engine**, combining the global disabled-rule list with that service's
exceptions. The engine is built once per reload and swapped behind the same lock as the shared
default engine. Services
with no exceptions of their own keep using the shared default engine, so this costs nothing in memory
for a deployment that never uses the feature.

A **"Per-Service Exceptions"** card on the WAF Rules page lists every scoped exception (rule ID,
service, reason, when it was added) and lets you re-enable one
(`DELETE /admin/waf-rules/service/:id`). The existing "Disabled Rules" card and the "Top Firing
Rules" table's Active/Disabled badge reflect only the **global** list. A rule scoped to one service
is still shown as active globally, which keeps global and service-specific state distinct.

You can also create a scoped exception straight from a blocked request: open it on the **Logs** page
and click **Create exception**. See [Request logs](/docs/configuration/dashboard#request-logs).

## Dry-run candidate rules

The **Dry run** button in the Custom Rules card (`POST /admin/waf-rules/dry-run`) lets you test rules
before deploying them. Paste candidate rules and replay the last N logged requests (up to 2000)
through two throwaway engines: the current global rules, and the current rules plus your candidates.
The card lists every request whose verdict would change.

Nothing is saved and live traffic is never touched.

:::note
Request bodies aren't stored in the request log, so rules that inspect bodies can't match during a
replay.
:::

## WAF detects without blocking

Make sure you're on a normal build (blocking is enabled after the CRS includes by design), and check
whether the specific rule was disabled from the dashboard, globally or for that service. Also check
the client isn't on the [trusted IPs](/docs/security/blocking#trusted-ips) list, which skips the WAF.
