---
title: Mesh tunnel
description: Reach backends behind NAT or a firewall without opening a port on them, and take the admin UI off the internet. Palisade Pro pairs, monitors and revokes the machines on an encrypted Yggdrasil mesh for you.
keywords: [mesh, tunnel, yggdrasil, nat, palisade-agent, backend connector, no open port, admin ui, cluster replica, pro]
---

The mesh tunnel connects Palisade to backends it can't reach directly: a home lab behind NAT, a
machine in another network, a server with no public IP. The backend machine runs
**palisade-agent**, which dials out to your Palisade server, so the backend needs **no open
port**. Traffic between them is end-to-end encrypted.

Every Pro plan and the trial include it (license feature `mesh`).

:::note
The mesh is built on [Yggdrasil](https://yggdrasil-network.github.io/), which is open source and
which you can set up by hand. What Pro adds is pairing, keys, connection status and revocation
working out of the box, from the admin UI.
:::

## How it works

- The Palisade server runs a mesh node inside the process. It doesn't use a TUN device or need
  extra privileges, so it works in the Docker image and under the systemd sandbox.
- Each machine on the mesh gets an IPv6 address in `200::/7` derived from its key. That address
  can't be spoofed: a packet only carries an address if it was sent with the matching key.
- Only machines you paired can connect. Everything else is refused at the handshake.
- A service's backend is the agent's mesh address, for example `http://[201:…:1a2b]:8080`.
  The WAF, health checks and load balancing treat it like any other backend.

## Open the peering port

Agents connect to the Palisade server on **TCP 9001** by default. Open it in the server's firewall
(and in any cloud security group). You can change the port on the **Mesh tunnel** card; agents
already paired keep the port from their token, so re-pair them after a change.

The node only listens while at least one agent is paired.

## Connect a backend

1. In the admin UI, open **Settings → Mesh tunnel** (owner only).
2. Under **Add an agent**, enter:
   - **Name**: anything that tells you which machine it is, like `homelab`.
   - **Backend port on that machine**: the port your app listens on there, like `8080`.
   - **This server's public host name or IP**: the address the agent dials. It's filled in from
     the address you opened the admin UI on.
3. Click **Add agent**. The card shows a **join token** once. It works for 24 hours, until the
   agent first connects.
4. On the backend machine, install `palisade-agent` from the Pro release archive:

   ```bash
   sudo install -m 755 palisade-agent /usr/local/bin/
   sudo cp palisade-agent.service /etc/systemd/system/
   ```

5. Join, using the token:

   ```bash
   sudo palisade-agent join pmesh1.…
   ```

   It saves the token to `/var/lib/palisade-agent/config.json` and connects. The agent forwards to
   `127.0.0.1:<backend port>` by default; pass `-to host:port` to forward somewhere else, such as
   another machine on that network.
6. When it connects, stop it (Ctrl+C) and keep it running with systemd:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now palisade-agent
   ```

7. Set the service's backend to the URL the card showed (`http://[…]:8080`). The Services page
   also suggests it when you add a service or edit its backends.

`palisade-agent status` shows whether the agent is connected, its latency and the bytes moved.
The card lists each agent as **waiting for the agent**, **connected** or **not connected**.

The agent only forwards connections that come from the Palisade server it paired with. Other
machines on the mesh can't reach your backend through it.

## Reach the admin UI over the mesh

You can take the admin UI off the internet and reach it from your computer over the mesh instead.

1. Under **Add an admin device or cluster replica**, enter a name (like `laptop`) and the server's
   host name, then click **Add admin device**.
2. On your computer, run the command the card shows:

   ```bash
   palisade-agent join pmesh1.… -dir ~/.palisade-agent
   ```

3. Open `http://127.0.0.1:9090/admin` (your admin path) and sign in as usual. Sign-in, two-factor
   and roles still apply. Next time, run `palisade-agent run -dir ~/.palisade-agent`.
4. Once that works, start Palisade with `--admin-listen` on a loopback address so the admin UI
   is no longer public. If you use `--admin-allow`, add `200::/7` to it.

Only admin devices reach the admin UI on the mesh. A backend agent can't.

## Cluster replicas over the mesh

A [cluster](/docs/pro#cluster) replica can sync from the primary over the mesh, so the primary's admin UI
needn't be reachable from the replica's network.

1. On the **primary**, add an admin device for the replica (as above) and copy its token.
2. On the **replica**, save the token in a file only Palisade can read (`chmod 600`), and set:

   ```bash
   PALISADE_CLUSTER_MESH_TOKEN_FILE=/etc/palisade/mesh.token
   PALISADE_CLUSTER_PRIMARY=http://[<primary's node address>]/admin
   ```

   The primary's node address is shown on its **Mesh tunnel** card. The replica's node token
   still applies; `http://` is only accepted for a mesh address, because the mesh encrypts it.

The Cluster card shows the replica's transport as **mesh**.

## Remove a machine

Click **Remove** next to it on the card. Its key is dropped and the node restarts without it, so
the machine is disconnected at once and its token stops working. Any service using that backend
becomes unreachable until you point it elsewhere.

## Limits

- **Backends and admins only, not public clients.** Mesh addresses are free to create, so per-IP
  rate limits and bans don't mean much there. Serve visitors over the normal listener.
- **One node per agent.** A mesh backend is reachable only from the Palisade node that paired it.
  In a cluster, pair an agent on each node that should reach the backend (or run one agent per
  node).
- **Licensed.** If the license expires or lacks `mesh`, the node stops and mesh backends fail.
  Every other backend keeps working.
