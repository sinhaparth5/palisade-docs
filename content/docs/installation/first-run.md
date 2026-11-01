---
sidebar_position: 3
title: First Run & Initial Setup
description: Seed the first admin account, start the server, and open the dashboard.
keywords: [first run, initial setup, admin account, setup command]
---


If you used the **installer (Option A)**, your admin account already exists (you typed it during
install) and the service is running — skip to [Using the Dashboard](/docs/configuration/dashboard).

For a **manual / source install**:

1. **Create the first admin account:**
   ```bash
   printf 'your-strong-password\n' | ./palisade setup \
     --db ./waf.db --admin-email you@example.com
   ```
   :::warning[Setup is required]
   The server never creates fallback credentials. If `setup` has not been run, proxying still works
   but every dashboard login is rejected until an administrator exists.
   :::
2. **Start the server:**
   ```bash
   ./palisade --db ./waf.db --listen :8080
   ```
3. **Open the dashboard** at `http://<host>:8080/admin` and log in.
4. **Add your first backend** under **Services** (see [Using the Dashboard](/docs/configuration/dashboard)).

The `setup` account is an **owner**. Once you're in, consider:

- turning on two-factor authentication or a passkey under **Settings**;
- inviting teammates with their own accounts and roles, or setting up SSO
  ([Users, Roles & SSO](/docs/configuration/users-and-sso));
- adding your office or monitoring IPs to [trusted IPs](/docs/security/blocking#trusted-ips), and a
  few [honeypot paths](/docs/security/blocking#honeypot-paths).
