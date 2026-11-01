---
sidebar_position: 4
title: Running as a systemd Service
description: The systemd unit the installer writes, and common service operations.
keywords: [systemd, service, linux, execstart, journalctl]
---


The installer writes `/etc/systemd/system/palisade.service` similar to:

```ini
[Unit]
Description=Palisade (WAF + reverse proxy)
Documentation=https://github.com/sinhaparth5/palisade-waf
After=network.target

[Service]
Type=simple
User=palisade
Group=palisade
WorkingDirectory=/var/lib/palisade
ExecStart=/usr/local/bin/palisade --listen :80 --listen-tls :443 \
  --db-driver sqlite --db '/var/lib/palisade/waf.db' \
  --certs /var/lib/palisade/certs --retention 30 \
  --db-key-file /etc/palisade/db.key \
  --access-log /var/log/palisade/access.log $PALISADE_FLAGS
EnvironmentFile=-/etc/palisade/palisade.env
LogsDirectory=palisade
Restart=on-failure
RestartSec=5s

# Bind :80/:443 without running as root
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
ProtectSystem=full
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Common operations:

```bash
sudo systemctl status palisade        # status
sudo systemctl restart palisade       # restart (e.g. after changing flags)
sudo journalctl -u palisade -f        # follow logs
sudo systemctl list-timers | grep palisade    # see the prune timer
```

## Adding your own flags

Don't edit the unit file: the installer rewrites it on every upgrade. Put extra flags (trusted
proxies, trusted crawlers, a GeoIP override, the ClickHouse warehouse, HTTP/3) on the
`PALISADE_FLAGS=` line of `/etc/palisade/palisade.env`. The installer creates that file once from a
commented template and never overwrites it.

```bash
# /etc/palisade/palisade.env
PALISADE_FLAGS=--trusted-proxies 10.0.0.0/8,192.168.0.0/16 --prune-interval 24h
```

Then `sudo systemctl restart palisade`. See [Command-Line Interface](/docs/configuration/cli) for
every flag.
