---
sidebar_position: 3
title: Users, Roles & SSO
description: Multiple admin users with owner, admin and viewer roles, email invites, invite-only OIDC single sign-on, and the audit log.
keywords: [admin users, roles, rbac, owner, viewer, invite, sso, oidc, authelia, keycloak, single sign-on, audit log]
---


Since v3.0.0 the dashboard has real user accounts. On first start after upgrading, the old single
admin account is moved in as an **owner**, keeping its password, 2FA, passkeys and sessions.

## Roles

| Role | Can do |
|---|---|
| `viewer` | See every page read-only. Manage only their own password, 2FA, passkeys and devices. |
| `admin` | Everything a viewer can, plus change services, rules, certificates, threat intel, bot, rate-limit, Varnish and trusted-IP settings, and export logs. |
| `owner` | Everything, plus users and SSO, backups and the configuration export, API keys, profiling, and the webhook and email secrets. |

The role is enforced on the server for every route. The dashboard also hides the controls a role
can't use: viewers get settings in a disabled form, a read-only **View** modal for services (the
maintenance bypass token is left out), and a **read-only** tag in the top bar.

The last enabled owner can't be demoted, disabled or deleted, so you can't lock yourself out by
accident.

## Adding users

Owners manage users from the **Users** card under **Settings**.

1. Enter the person's **email** and **role** and click **Add user**
   (`POST /admin/settings/users`).
2. Palisade creates the account without a password and emails a **set-password invite link** to that
   address (through the [Cloudflare email](/docs/configuration/email-alerts) settings; only the API
   token needs to be configured).
3. The person opens `/admin/invite/<token>`, picks a password, and is signed in.

Every password (invite, change password, `palisade setup`) must be at least **12 characters**, must not
equal the email, and must not appear in the Have I Been Pwned breach list. Only the first 5 characters
of the password's SHA-1 hash are sent, and the check fails open if HIBP can't be reached. Passwords are
hashed with bcrypt cost 12; older hashes are upgraded on the next successful login. Session tokens are
stored only as SHA-256 hashes, so a copy of the database can't be used to hijack a session.

The link is single-use and expires after **7 days**. Only its SHA-256 hash is stored. If the email
can't be sent, the Users card shows the link once so you can pass it on yourself. Pending users are
marked **invited** and have a **Resend** button, which replaces the token
(`POST /admin/settings/users/:id/invite`). Failed attempts on the invite page count against the
login limiter.

Per user, an owner can change the role, **disable** or **enable** the account (disabling revokes its
sessions immediately), **reset 2FA**, or delete it (`POST /admin/settings/users/:id` with
`action` = `role`/`disable`/`enable`/`reset-2fa`, `DELETE /admin/settings/users/:id`). **Reset 2FA**
is shown for SSO-linked users too, since they can still have 2FA for password sign-in.

Locked out with nobody left to help? The `palisade setup` subcommand can reset a password or 2FA, list
users and read the audit log straight from the database. See
[Locked out: recovery from the shell](/docs/configuration/cli#locked-out-recovery-from-the-shell).

## Signing in

- Each user has their own 2FA (TOTP, backup codes, emailed codes) and passkeys.
- Each user has **one live session**: signing in on a new device signs out that user's other
  sessions. Other users aren't affected.
- Logins are throttled per IP **and** per account. Failed 2FA codes count too, and a correct password
  doesn't reset the counter. Unknown and disabled emails take the same time to reject as real ones.

## Single sign-on (OIDC)

Palisade can sign users in through any OpenID Connect provider (Authelia, Authentik, Keycloak, Okta,
Google, …). It is **invite-only**: a provider account can't create a Palisade user by itself.

### Configure the provider

In the owner-only **Single sign-on** card:

| Field | Meaning |
|---|---|
| `issuer` | The provider's issuer URL. Must be `https` (except loopback). Palisade checks its discovery document when you save. |
| `client_id`, `client_secret` | The OIDC client you registered. The secret is encrypted at rest and never shown again. |
| `group` | Optional. Only members of this group may sign in; Palisade then also asks for the `groups` scope. |

Register this redirect URI with the provider (the card shows it):

```text
https://<your admin host>/admin/login/sso/callback
```

Palisade uses the authorization code flow with PKCE, and verifies the ID token's signature, issuer,
audience and expiry. If the ID token lacks `email`, `email_verified` or `groups` (Authelia leaves them
out by default), they are filled from the userinfo endpoint.

### Invite someone

In the Users card, create an **SSO invite** with an email and role
(`POST /admin/settings/users/invites`). The invite is pending for 7 days and can be renewed or
revoked. The login page now shows **Sign in with &lt;issuer host&gt;**.

On their first SSO login, the provider's verified email must match the invite. Palisade spends the
invite and binds a new password-less user to the provider's `iss` + `sub`.

**Existing users can be invited too.** Send an SSO invite to an existing user's email; on their first
SSO login with that verified email, Palisade links the provider account to the existing user instead of
creating a new one. Their role, password and 2FA stay as they were, so password sign-in still works as
a fallback. The invite step is still required: Palisade never links an account just because the email
matches at the provider, so a misconfigured or compromised provider can't take over a local account.
Re-inviting a user who is already linked is refused, and so is an invite for a disabled user. Later logins match on that
pair, **never on email**, so changing an email at the provider can't take over another account.

Sign-in is refused (and no user is created) for an uninvited, expired, revoked or already used
invite, an unverified email, a disabled user, or someone outside the required group. Leaving the
group also revokes that user's live sessions.

SSO logins skip Palisade's own 2FA (the provider handles that) and are recorded in the audit log
with the provider's `amr` claim. Password login stays available as a break-glass path.

## Audit log

Every successful change made in the dashboard or through the REST API is recorded: who did it (the
user's email, or the API key's name and prefix), from which IP, the route, and a short summary.
Rejected requests aren't recorded. The summary only copies an allowlist of identifying fields, so
secrets and credential-bearing URLs never reach the log.

The **Audit log** card under **Settings** pages through entries 10 at a time
(`GET /admin/settings/audit`). Entries are kept for the log retention period or 365 days, whichever
is longer. The dashboard home also shows a short daily log built from it.
