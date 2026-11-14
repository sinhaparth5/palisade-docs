---
sidebar_position: 2
title: API & MCP Protection
description: Per-service JWT verification at the edge, a request policy for methods, content types and body size, JSON Schema validation, an OpenAPI positive security model, and a structural guard for Model Context Protocol endpoints.
keywords: [api security, jwt, jwks, bearer token, edge authentication, request policy, allowed methods, content type, body size, openapi, positive security model, json schema, mcp, model context protocol, json-rpc]
---


CRS looks for known attack patterns. For an API you can go further and tell Palisade what valid
traffic looks like, then reject everything else. Three per-service checks do this, all set from the
service's **Schema** tab and all with the same three modes:

| Mode | Effect |
|---|---|
| `off` | Disabled (default). |
| `log` | A violation is recorded in the request log (action ends in `:log`) but **not blocked**. Use this to test against real traffic first. |
| `enforce` | A violation is rejected. |

Two more checks on the same tab, [JWT verification](#jwt-verification-at-the-edge) and the
[request policy](#request-policy), run in their own stage just **before** the WAF and are described at
the end of this page.

The three schema checks run inside the WAF stage, after the CRS rules, on the path with the service prefix already
stripped. A spec that fails to parse is rejected when you save it, so a bad document can't break a
WAF reload. Each is compiled once per engine build, never per request.

## JSON Schema

Attach a **JSON Schema** to validate JSON request bodies for the whole service. This suits a small
API where every write has the same shape.

Set it from the Schema tab, or `POST /admin/services/schema/:id` with `schema` (the JSON Schema
text) and `mode`. It only applies to fully buffered JSON bodies (up to 128 KiB). In `enforce` mode a
mismatch returns `400` with action `schema_violation`; in `log` mode the action is
`schema_violation:log`.

## OpenAPI positive security model

Upload an **OpenAPI 3.x** document (JSON or YAML) and Palisade only lets through requests that match
an operation in it. Load it from a file or paste it in the Schema tab
(`POST /admin/services/openapi/:id` with `openapi_spec` and `openapi_mode`).

What is checked:

- the **path**, matched against the spec's templates (a static segment beats a `{param}`);
- the **method** for that path;
- **path, query and header parameters**, against their schemas;
- the **request body** media type and, for JSON, its schema. Component `$ref`s and OpenAPI 3.0
  `nullable` / exclusive bounds are converted to JSON Schema 2020-12.

| Violation | Status in `enforce` mode |
|---|---|
| Unknown route | `404` |
| Method not declared for the route | `405` |
| Bad parameter or body | `400` |
| Undeclared content type | `415` |

Blocks are logged as `openapi_violation` (or `openapi_violation:log`).

Details worth knowing:

- A base path in `servers[].url` (for example `https://api.example.com/v1`) may be present in the
  request or not; both match.
- Undeclared `OPTIONS` requests pass so CORS preflights keep working, and `HEAD` falls back to the
  `GET` operation.
- Operations covered by the spec skip the plain [JSON Schema](#json-schema) check.
- Specs larger than 64 KiB are fine on every database backend.

## MCP endpoint guard

If a service exposes a [Model Context Protocol](https://modelcontextprotocol.io) server over
Streamable HTTP, the MCP guard adds structural checks to that one endpoint. Configure it on the
Schema tab (`POST /admin/services/mcp/:id`):

| Field | Meaning |
|---|---|
| `mcp_path` | The endpoint path after the service prefix, e.g. `/mcp`. Other paths are not affected. |
| `mcp_origins` | Allowed `Origin` values. Empty = only the request's own host. |
| `mcp_methods` | Allowed JSON-RPC methods. `prefix/*` allows a whole namespace (`tools/*`). Empty = any. |
| `mcp_tools` | Tool names allowed in `tools/call`. Empty = any. |
| `mcp_mode` | `off`, `log` or `enforce`. |

What it enforces:

- **Origin** — a request that sends `Origin` must match the list, which stops DNS-rebinding attacks
  from a browser. No `Origin` means a non-browser client, which passes.
- **HTTP method** — only `GET`, `POST`, `DELETE` and `OPTIONS`.
- **JSON-RPC 2.0 envelope** — a `POST` must be a JSON-RPC 2.0 object or batch, sent as JSON. An `id`,
  when present, must be a string or number (never `null`), and a response must carry an `id` and
  exactly one of `result` or `error`. The usual 128 KiB JSON body limit applies.
- **Method and tool allowlists**, when set.

| Violation | Status in `enforce` mode |
|---|---|
| Origin, JSON-RPC method or tool not allowed | `403` |
| HTTP method not allowed | `405` |
| Not JSON | `415` |
| Malformed envelope | `400` |

Blocks are logged as `mcp_violation` (or `mcp_violation:log`). The guard runs before the OpenAPI
check. It checks structure only and does **not** try to detect prompt injection in tool arguments.

## JWT verification at the edge

Palisade can check the `Authorization: Bearer` token on protected paths before a request reaches the
backend, so unauthenticated traffic never touches it. Configure it in **JWT verification** on the
**Schema** tab (`POST /admin/services/jwt/:id`):

| Field | Meaning |
|---|---|
| **JWKS URL** | Where to fetch the signing keys, e.g. `https://idp.example.com/.well-known/jwks.json`. |
| **Or a PEM public key** | A static key instead of a JWKS URL. |
| **Issuer** | Required `iss`. Empty = any. |
| **Audience** | Required `aud`. Empty = any. |
| **Allowed algorithms** | e.g. `RS256 ES256`. Empty = every asymmetric one. |
| **Protected paths** | Path prefixes, one per line, after the service prefix. Empty = the whole service. |
| **Mode** | `off`, `log` or `enforce`. |

What is checked:

- The signature, with **asymmetric algorithms only** (`RS*`, `PS*`, `ES*`, `EdDSA`). `HS*` and `none`
  are refused when you save, which also rules out key-confusion attacks.
- `exp` is **required**; `nbf`, issuer and audience are checked when present or configured. Clock skew
  of one minute is allowed.
- **Trusted IPs are checked too.** This is authentication, like mTLS, so it is not skipped for them.
  Open paths such as `/robots.txt` are skipped.

The JWKS is fetched in the background and cached per URL across reloads; it is never fetched on the
request path. A token with an unknown `kid` triggers a refetch at most every 30 seconds.

On success the verified `sub` claim is forwarded to the backend as `X-Auth-Subject`. Any
`X-Auth-Subject` the client sent is always removed on a service with a JWT policy, so the backend can
trust the header. In `enforce` mode a missing or invalid token gets `401` with action `jwt_invalid`;
`log` mode tags the row `jwt_invalid:log`. Both count one point toward
[automatic banning](/docs/security/blocking#automatic-ip-banning) ("N invalid tokens" in the ban
reason). Services with a JWT policy show a **JWT** tag on the Services page.

## Request policy

The request policy says what a service accepts at all, checked before the WAF so anything else is
rejected cheaply. Set it in **Request policy** on the **Schema** tab (`POST /admin/services/policy/:id`):

| Field | Meaning |
|---|---|
| **Allowed methods** | e.g. `GET POST`. `HEAD` is allowed along with `GET`. Empty = any. |
| **Allowed request content types** | e.g. `application/json`. `type/*` matches a family (`image/*`). Empty = any. |
| **Maximum body size** | In KiB. `0` = no limit. |
| **Mode** | `off`, `log` or `enforce`. |

Three presets fill the fields for you: **JSON API**, **HTML forms** and **Uploads**.

In `enforce` mode another method gets `405`, a body with another `Content-Type` gets `415`, and a body
over the limit gets `413`, all logged as `policy_violation` (`policy_violation:log` in `log` mode). A
body of unknown length (chunked) is cut off at the limit while it streams. Trusted IPs and open paths
skip the policy, and violations don't count toward automatic banning.

