---
sidebar_position: 9
title: Daily Report & Ban Alert Emails
description: Daily traffic digest and instant autoban alert emails sent via Cloudflare Email Service — only the recipient list and API token are configurable.
keywords: [email alerts, daily report, ban alert, cloudflare email]
---


Palisade sends email via **Cloudflare Email Service** (SMTPS — no external SMTP provider needed):

- **Daily traffic report** — sent just after local midnight, covering the completed day.
- **Ban alert** — sent every time [autoban](/docs/security/blocking#automatic-ip-banning) bans an
  IP.
- **New script alert** — sent the first time a service's
  [script inventory](/docs/security/script-inventory) sees a new script source.
- **Login code** — the emailed second-factor code, when you choose it at sign-in.
- **User invite** — the set-password link for a [new admin user](/docs/configuration/users-and-sso#adding-users),
  sent to that user's own address rather than the alert recipients. Only the API token has to be
  configured for invites; email alerts don't need to be enabled.

All emails share the dashboard's v3 look: a dark header band, square cards and monospaced figures.

A ban is written to the blocklist regardless of whether email is configured or the send succeeds —
email is a notification, not a dependency.

## What's configurable

**Only the recipient list and the Cloudflare API token** are configurable, from the **Email Alerts**
card on the Settings page (`POST /admin/settings/email` with `email_enabled`, `email_to`,
`email_token`). Everything else is **fixed in code** and never appears in `config.yaml`, the binary,
or `install.sh`:

| | Value |
|---|---|
| SMTP endpoint | `smtp.mx.cloudflare.net:465` (implicit TLS — no STARTTLS) |
| SMTP username | the literal string `api_token` |
| SMTP password | your configured Cloudflare API token |
| Sender address | fixed in code (see `internal/notify/mailer/mailer.go`'s `Sender` constant) — allowlist it in your mail client if alerts land in spam |

Connecting on the implicit-TLS port means `net/smtp.PlainAuth` works even though the standard library
client doesn't natively speak implicit TLS — `smtp.NewClient` detects the already-TLS connection and
marks the session as secured before auth runs.

The token is stored in the database (meta keys `email_enabled`, `email_token`, `email_to`) and **never
echoed back to the UI** once saved, so on subsequent saves leave the token field blank to keep the
existing value.

Alerts arrive with a display name so they show up as *Palisade* in your inbox. Gmail strips
inline SVG from HTML email, so the logo and charts are built from plain HTML tables and CSS rather
than images. IP addresses, labels and ban reasons are HTML-escaped.

## Daily report contents

| Section | Meaning |
|---|---|
| Summary line | One sentence on how the day went. |
| Figure cards | Total requests, blocked, 403s and unique blocked IPs, each compared with the previous day. |
| Hourly chart | Allowed vs blocked requests per hour, with the busiest hour marked. |
| Block breakdown | What blocked requests: WAF, IP, geo, rate limit, bot challenge. |
| Top 5 lists | The most-blocked countries, IPs and WAF rules. |

## Verifying credentials

A **Send test report** button (`POST /admin/settings/email/test`) sends a report covering the last 24
hours immediately, using the currently *saved* configuration — so save your settings first, then test
to verify the credentials before turning the daily schedule on.

## Idempotent per day

Sends are **idempotent per day**: a restart around midnight neither duplicates nor skips the daily
report, and a failed send is retried on the next tick/restart rather than being marked as sent.
