---
sidebar_position: 6
title: Access Log
description: An nginx-combined-format access log file for GoAccess, fail2ban and log shippers, enabled by default by the installer.
keywords: [access log, nginx log format, goaccess, fail2ban]
---


Palisade can write an **nginx-combined-format** access log to a plain text file independently
of the SQLite-backed request log. This supports tools such as `fail2ban`, log shippers, `grep`/`awk`,
and `logrotate`-style pipelines.

## Enabling it

The binary leaves it off unless `--access-log` is set. **`install.sh` turns it on** (fresh installs and
upgrades alike) at `/var/log/palisade/access.log`, using systemd's `LogsDirectory=palisade` so the
directory is owned by the service user:

```bash
./palisade --access-log /var/log/palisade/access.log
```

| Flag | Default | Description |
|---|---|---|
| `--access-log` | *(empty)* | File path. Empty disables the writer entirely. |
| `--access-log-max-size-mb` | `100` | Rotate after the file reaches this size. |
| `--access-log-max-backups` | `5` | How many rotated files (`access.log.1`, `.2`, …) to keep before the oldest is pruned. |

The built-in writer handles rotation. The SQLite log follows the same approach through
`palisade prune` and a systemd timer, so neither log requires an external rotation tool.

## Format notes

Each line follows the standard nginx combined log format. Two fields don't apply to this project and
render as the conventional `-` placeholder rather than a fabricated value: response byte count and
the `Referer` header aren't tracked on the underlying request-log row (the same placeholder every
combined-format line already uses for the identd/userid fields).

Fields taken from the client (method, URL and `User-Agent`) are **escaped the way nginx does it**:
`"`, `\` and non-printable bytes are written as `\xHH`. Before v2.4.0 they were written raw, so a `"`
in a User-Agent broke parsing, and a newline let a client forge a whole log line (for example one
that gets an innocent IP banned by fail2ban).

## GoAccess

The log works with GoAccess out of the box:

```bash
goaccess /var/log/palisade/access.log --log-format=COMBINED
```

With the default rotation the log tops out at about 600 MB (100 MB × 5 backups plus the live file).

:::note[The dashboard Terminal tab was removed]
Before v2.4.0 the Logs page had a **Terminal** tab streaming raw access-log lines
(`/admin/access-log/stream`). It only connected while selected, so it missed requests. It has been
replaced by the [Stats view](/docs/configuration/dashboard#request-logs). The on-disk access log is
unchanged.
:::
