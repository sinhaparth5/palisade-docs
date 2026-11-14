---
sidebar_position: 1
title: Requirements
description: Supported operating systems, architectures, privileges, and build prerequisites.
keywords: [requirements, linux, amd64, arm64, go 1.27, system requirements]
---


| | |
|---|---|
| **OS (running)** | Linux only. Release binaries, the installer, the systemd units and the Docker image all target Linux; there is no Windows build. |
| **Architecture** | `amd64` (x86_64) or `arm64` (aarch64). |
| **Privileges** | Root (via `sudo`) only to install the systemd service and bind ports 80/443. The service itself runs as a dedicated non-root user. |
| **Go (building only)** | Go **1.27+** (the version pinned in `go.mod`). Not needed if you use a release binary. |
| **External services** | None. Everything is stored in one SQLite file (MySQL and Postgres are no longer supported). Varnish is an optional add-on. |

The SQLite driver, GeoIP and ASN are pure Go. Release binaries use
`CGO_ENABLED=0` and need no shared libraries.
