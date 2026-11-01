---
sidebar_position: 5
title: Log Retention & Pruning
description: How request logs are pruned by a separate one-shot command or the bundled systemd timer.
keywords: [log retention, pruning, request logs, systemd timer]
---


Request logs accumulate in SQLite. By default pruning is **not** done inside the running server; it is a
separate one-shot command so a multi-second delete never shares the live process's DB connection
pool with request traffic. Deployments with no scheduler can opt into [in-process pruning](#in-process-pruning) instead.

Run it from cron or the bundled systemd timer:

```bash
palisade prune --db /var/lib/palisade/waf.db --retention 30
```

The installer sets up `palisade-prune.service` + `.timer` to run every 15 days automatically.
Deletes happen in batches (2000 rows) with short pauses, so SQLite's single write lock isn't held
for the entire operation.

The retention window is also expressible at runtime via the `--retention` flag (days; `0` = keep
forever). See the [CLI reference](/docs/configuration/cli) for the `prune` subcommand.

## In-process pruning

Containers and other setups without cron or a systemd timer can let the server prune itself:

```bash
./palisade --retention 30 --prune-interval 24h
```

At each interval the server deletes request logs older than `--retention` days and expired
sessions, using the same batched deletes as the `prune` command. `--prune-interval 0` (the default)
leaves it off. The Docker image runs with `--prune-interval 24h`, because before v2.2.0 containers
never pruned and the database grew without bound regardless of `--retention`.
