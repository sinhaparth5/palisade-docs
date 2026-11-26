---
title: Containers
description: See the Docker containers on your Palisade server, follow their logs, open a shell in one and start, stop or restart them from the admin UI, without SSH. Palisade Pro.
keywords: [docker, containers, logs, console, shell, exec, restart, palisade-docker, portainer, pro]
---

The **Containers** card shows the Docker containers running on the Palisade server, next to the
traffic Palisade already shows you. You can follow a container's logs, open a shell in it, and
start, stop or restart it, without SSH-ing in to run `docker ps`, `docker logs` or `docker exec`.

The Pro and Advanced plans and the trial include it (license feature `containers`).

## What you get

- **Container list**: name, image, status and uptime, CPU and memory, published ports, and which
  Palisade service routes to the container. Palisade matches a service by its backend address:
  the container's name or network IP with one of its ports, or `127.0.0.1` with a published port.
- **Live logs**: the `docker logs -f` stream in the browser, starting with the last 500 lines. You
  can search, pause, and choose stdout, stderr or both.
- **Console**: a terminal in the browser running `bash` in the container, or `sh` if there's no
  bash. It resizes with the window. A container without a shell (distroless or `scratch` images)
  says so instead.
- **Start, Stop, Restart**: each asks you to confirm first.

## Who can do what

| | Viewer | Admin | Owner |
|---|---|---|---|
| See the list and logs | | ✅ | ✅ |
| Open a console | | | ✅ |
| Start, stop, restart | | | ✅ |

- **Every console asks again.** You enter your authenticator code each time you open one, or
  your password if you don't use two-factor. Five wrong answers lock the console for 15 minutes.
- **Audited.** Every console session, start, stop and restart is recorded in the audit log with
  the user, the container and the time.
- **Closed to the demo account.**
- **Access rules apply.** The pages live under the admin path, so `--admin-allow` and
  `--admin-listen` still decide who reaches them.

## How it works

Palisade never touches the Docker socket. Access to `/var/run/docker.sock` is the same as root on
the host, so a small separate program, **palisade-docker**, is the only thing that does.

- palisade-docker listens on a socket file, `/run/palisade/docker.sock`, that only the
  `palisade` group can use. It opens no network port.
- It passes only a fixed list of Docker calls through: list, stats, logs, start, stop, restart,
  and a shell. The shell command is built into palisade-docker. Palisade can't choose what runs,
  create containers, pull images, or read a container's settings (which can hold secrets).
- Palisade itself keeps its systemd sandbox, and never runs as root or in the `docker` group.

If someone takes over Palisade, they get those few calls, not root on the host.

## Set it up

palisade-docker is in the Pro release archive, next to the `palisade` binary. On the Palisade
server, with Docker running:

```bash
sudo install -m 755 palisade-docker /usr/local/bin/
sudo cp palisade-docker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now palisade-docker
```

The unit expects the `palisade` group, which the [installer](/docs/installation/install) creates.
Palisade doesn't need a restart: the **Containers** card appears under **Settings → Pro** as soon
as the socket is there, and hides again if palisade-docker stops.

To turn it off, run `sudo systemctl disable --now palisade-docker`.

`palisade-docker -docker <path> -listen <path>` changes the Docker socket or its own socket. If you
change the second, set `PALISADE_DOCKER_SOCK` to the same path for Palisade.

## Limits

- **This server's containers only.** It doesn't list containers on other hosts or cluster nodes.
- **Installed Palisade only.** The setup above is for Palisade installed with systemd. Running
  Palisade itself in a container isn't covered yet.
- **Console sessions aren't recorded.** The audit log shows who opened a console and when, not
  what they typed.
- **Licensed.** If the license expires or lacks `containers`, the card says so and the actions
  stop working. Your containers keep running.
