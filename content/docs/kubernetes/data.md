---
title: Data, Backups and GitOps
description: Where the Helm chart keeps the database, automatic backups, restoring, moving clusters, migrating from Docker or systemd, and declarative config for Argo CD and Flux.
keywords: [kubernetes, pvc, backup, restore, gitops, argo cd, flux, config import, migration]
---

## Your data

Everything Palisade stores lives in `/data` on the PVC `<release>-palisade-data`:

- **Pod restart, `helm upgrade`, `helm rollback`**: the pod is replaced, the PVC is not.
  `strategy: Recreate` stops the old pod before the new one mounts the volume.
- **`helm uninstall`**: the PVC is kept (`helm.sh/resource-policy: keep`). `helm install` with the
  same release name and namespace picks it up again. Under a different name, point the new release
  at it with `persistence.existingClaim=<old release>-palisade-data`.
- **Deleting it on purpose**: `kubectl delete pvc <release>-palisade-data`.

## Backups

Before the server starts, an init container runs `palisade backup --dir /data/backups --keep 5`. It
copies `waf.db` to `/data/backups/waf-<UTC time>.db` and removes the oldest copies beyond
`backup.keep`. This runs on every pod start, so every upgrade leaves a copy of the database as the
previous version left it, taken before the new version migrates the schema. Turn it off with
`backup.enabled=false`.

For a copy outside the cluster:

```bash
kubectl -n palisade exec deploy/waf-palisade -- /palisade backup --db /data/waf.db --out /data/manual.db
kubectl -n palisade exec deploy/waf-palisade -- \
  /palisade config export --db /data/waf.db --db-key-file /etc/palisade/key/db.key > palisade-config.json
```

The image has no shell, so `kubectl cp` doesn't work against it. `config export` writes to stdout and
needs no shell. It holds the configuration (services, rules, users, keys) but not the request logs,
with secrets sealed under the DB key.

### Restoring a backup

```bash
kubectl -n palisade scale deploy/waf-palisade --replicas 0
kubectl -n palisade run restore --rm -i --restart Never --image busybox:1.37 \
  --overrides '{"spec":{"securityContext":{"runAsUser":65532,"runAsGroup":65532},
    "volumes":[{"name":"d","persistentVolumeClaim":{"claimName":"waf-palisade-data"}}],
    "containers":[{"name":"restore","image":"busybox:1.37","stdin":true,
    "command":["sh","-c","ls -l /data/backups && cp /data/backups/$0 /data/waf.db && rm -f /data/waf.db-wal /data/waf.db-shm","waf-20260101T000000Z.db"],
    "volumeMounts":[{"name":"d","mountPath":"/data"}]}]}}'
kubectl -n palisade scale deploy/waf-palisade --replicas 1
```

:::warning
Going back to the version the backup came from? Run `helm rollback` first, so the older binary
doesn't open a database migrated by the newer one.
:::

### Moving to another cluster

```bash
# old cluster (secrets stay sealed under the DB key)
kubectl -n palisade exec deploy/waf-palisade -- \
  /palisade config export --db /data/waf.db --db-key-file /etc/palisade/key/db.key > palisade-config.json
kubectl -n palisade get secret waf-palisade-db-key -o yaml > db-key.yaml

# new cluster: create the key first so the chart reuses it, then helm install
kubectl -n palisade apply -f db-key.yaml
kubectl -n palisade exec -i deploy/waf-palisade -- \
  /palisade config import --db /data/waf.db --db-key-file /etc/palisade/key/db.key --replace /dev/stdin < palisade-config.json
kubectl -n palisade rollout restart deploy/waf-palisade
```

## Migrating from Docker or systemd

Copy the database and, if there is one, the DB key onto the new release.

```bash
# 1. A consistent copy of the database; safe while the old server runs.
sudo palisade backup --db /var/lib/palisade/waf.db --out waf.db                      # systemd
docker exec palisade /palisade backup --db /data/waf.db --out /data/migrate.db \
  && docker cp palisade:/data/migrate.db waf.db                                     # Docker

# 2. The old key, so sealed secrets (TOTP, webhook and email tokens) still open.
#    systemd always has one at /etc/palisade/db.key; Docker only with --db-key-file.
kubectl create namespace palisade
kubectl -n palisade create secret generic palisade-db-key --from-file=db.key=/etc/palisade/db.key

# 3. Install with that key, stop the pod and copy the files onto the volume.
helm install waf oci://ghcr.io/sinhaparth5/charts/palisade -n palisade \
  --set dbKey.existingSecret=palisade-db-key --wait
kubectl -n palisade scale deploy/waf-palisade --replicas 0
kubectl -n palisade run copy --restart Never --image busybox:1.37 \
  --overrides '{"spec":{"securityContext":{"runAsUser":65532,"runAsGroup":65532},
    "volumes":[{"name":"d","persistentVolumeClaim":{"claimName":"waf-palisade-data"}}],
    "containers":[{"name":"copy","image":"busybox:1.37","command":["sleep","600"],
    "volumeMounts":[{"name":"d","mountPath":"/data"}]}]}}'
kubectl -n palisade wait --for condition=Ready pod/copy
kubectl -n palisade cp waf.db copy:/data/waf.db
kubectl -n palisade cp /var/lib/palisade/certs copy:/data/certs   # systemd, if you uploaded certificates
kubectl -n palisade exec copy -- rm -f /data/waf.db-wal /data/waf.db-shm
kubectl -n palisade delete pod copy
kubectl -n palisade scale deploy/waf-palisade --replicas 1
```

Without a key on the old install, skip step 2 and leave `dbKey` alone: the chart creates a key and
seals the secrets with it on first start. Users, services, rules and the request log all come across.
Certificates uploaded in the admin UI are found again under `/data/certs` when that directory is
copied; ACME certificates are issued again if it isn't. Point DNS (or the load balancer) at the new
Service once the admin UI shows your services, and set `flags.trusted-proxies` for the new setup
([Client IP](/docs/kubernetes/networking#client-ip)).

## GitOps

Keep services and rules in Git (Argo CD, Flux) as a `palisade config export` file. An init container
imports it before the server starts.

```bash
palisade config export --db waf.db --db-key-file db.key > config.json
kubectl -n palisade create secret generic palisade-config --from-file=config.json
```

```yaml
config:
  existingSecret: palisade-config   # or existingConfigMap
  mode: seed
```

- **`seed`** (default): imports only into a database with no configuration, so a new install starts
  from the file and later changes made in the admin UI survive upgrades. Once the database has config
  the import is skipped (`config import: skipped` in the init container's log).
- **`replace`**: empties the config tables and imports the file at every pod start, so Git is the
  only source and UI edits last until the next restart. A changed Secret or ConfigMap doesn't restart
  the pod by itself: bump a `podAnnotations` value with it, or use a tool that restarts on change.

The file covers settings, admin users and SSO identities, API keys, services with every per-service
tab (OpenAPI, mTLS, MCP, JWT, rate rules, backend CA, maintenance, CSP, cookies, request policy),
certificate records, IP and geo rules, WAF rule exceptions and custom rules, threat intel sources, the
webhook and threat scores. It never holds request logs, the audit log, sessions or passkeys. Users the
file gives a different id lose their sessions and passkeys on a `replace` import. Uploaded certificate
files live under `/data/certs`, not in the file; upload them again or use `tls.existingSecret`.

An export made with `--db-key-file` keeps its secrets sealed under that key, so the release must use
the same key: put it in the Secret named by `dbKey.existingSecret`. The import refuses a sealed file
with a different key and changes nothing. Without a key file the export leaves secrets out, and TOTP
users enroll again.

The setup init container runs after the import and creates `admin.email` only when the file brought
no admin.
