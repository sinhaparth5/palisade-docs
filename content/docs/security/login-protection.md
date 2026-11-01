---
sidebar_position: 5
title: Login Protection
description: Force the bot challenge and throttle submissions on a service's login paths, and check submitted passwords against known breaches.
keywords: [login protection, credential stuffing, brute force, leaked password, have i been pwned, hibp, k-anonymity]
---


Login forms attract credential stuffing and brute force. Each service can mark its login paths and
get two extra defences on them. Both are set on the service's **Bot** tab.

## Login paths

Enter one path per line in the **Login protection** form (`POST /admin/services/login/:id` with
`login_paths`), for example `/login` or `/wp-login.php`. The row gets a **Login protected** badge.

Paths match on segment boundaries, case-insensitively, ignoring a trailing slash and `;param`
suffixes:

| Request path | Matches `/login`? |
|---|---|
| `/login`, `/Login/`, `/login;jsessionid=…` | yes |
| `/login/submit` (a sub-path) | yes |
| `/api/login` (the path mounted deeper) | yes |
| `/login2`, `/mylogin` | no |

On those paths:

- **The bot challenge is always on**, even when the service's bot mode is `off`. It is logged as
  `bot_challenge:login`.
- **Submissions are throttled**: non-`GET`/`HEAD` requests get a fixed limiter of a burst of 5,
  then one every 12 seconds per client (IPv6 by /64). Over the limit is `429`, logged as
  `rate_limited:login`.

## Leaked password check

Palisade can check the password in a login request against the
[Have I Been Pwned](https://haveibeenpwned.com/Passwords) Pwned Passwords list without sending the
password anywhere. Configure it in the **Leaked password check** form
(`POST /admin/services/breach/:id`):

| Field | Meaning |
|---|---|
| `breach_action` | *(off)*, `log` or `block`. |
| `breach_fields` | Form or JSON field names that hold the password. Default `password`, `passwd`, `pass`, `pwd`. Nested JSON is searched. |

How it works:

1. After the WAF, on a login path only, Palisade reads the password from HTTP Basic auth or from the
   form or JSON body.
2. It hashes it with SHA-1 and sends only the **first 5 hex characters** to the range API
   (k-anonymity, with padding on). It compares the returned suffixes locally.
3. On a match:
   - `log` forwards the request with `X-Palisade-Leaked-Password: 1` so your app can force a reset.
     Any copy of that header sent by the client is stripped first.
   - `block` returns `403` with a block page telling the user to reset their password.
4. Either way the hit is logged as `leaked_password` and scores **2 points** toward
   [autoban](/docs/security/blocking#automatic-ip-banning), so a stuffing run gets banned.

The lookup has a 300 ms timeout and **fails open**: if the API is slow or down, the login goes
through and a rate-limited warning is logged. Results are cached by prefix for 24 hours. The
password itself is never written to the request log.
