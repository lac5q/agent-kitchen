# MemRoOS Oracle-1 Healthcheck Watchdog

A standalone Python watchdog that runs on oracle-1 every 30 minutes via systemd timer.
It hits the two local health endpoints and posts a GitHub issue on
`lac5q/memroos` whenever something is broken, with deduplication so the same
failure signature only opens a new issue every 6 hours.

## What it checks

| Endpoint | Service |
|---|---|
| `http://127.0.0.1:3000/api/health` | Next.js operator (RTK / mem0 / QMD / Knowledge Index / Graph Memory / Agents / APO) |
| `http://127.0.0.1:3201/health` | mem0 (vector store / queue / disk / SQLite) |

A failure is any of:

- Endpoint unreachable (curl error / timeout)
- A service in `/api/health` reports `status: "down"` (RTK/QMD's `degraded` is intentional, ignored)
- `disk.critical: true` (high severity)
- `disk.warning: true` (medium severity; re-fires every 6h while persistent)

## Files

```
services/healthcheck/memroos-healthcheck.py     — the script
deploy/oracle-1/systemd/memroos-healthcheck.service
deploy/oracle-1/systemd/memroos-healthcheck.timer
```

## Install on a fresh oracle-1

```bash
# 1. Copy the script and units
sudo install -m 0755 services/healthcheck/memroos-healthcheck.py /usr/local/bin/memroos-healthcheck.py
sudo install -m 0644 deploy/oracle-1/systemd/memroos-healthcheck.service /etc/systemd/system/
sudo install -m 0644 deploy/oracle-1/systemd/memroos-healthcheck.timer   /etc/systemd/system/

# 2. Drop a GitHub PAT (scopes: repo, write:issues) into /etc/memroos/gh-token
sudo install -m 0640 -o root -g opc <(echo "ghp_…") /etc/memroos/gh-token

# 3. Enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now memroos-healthcheck.timer
```

## Verify

```bash
# Dry run (no issues opened)
sudo -u opc /usr/local/bin/memroos-healthcheck.py --dry-run

# Force-open a test issue (then close manually)
sudo -u opc /usr/local/bin/memroos-healthcheck.py --once

# Watch the journal
journalctl -u memroos-healthcheck.service -f
```

## Behavior

- **Cooldown**: same signature suppressed for `COOLDOWN_S` (default 6h) even after resolution.
- **Open-issue dedup**: if an open issue with the same signature already exists, the
  watchdog posts a `SKIP (open issue exists)` line to `/var/log/memroos/healthcheck.log`
  rather than opening a duplicate.
- **State**: per-signature timestamp files in `/run/memroos-healthcheck/`.
- **Log**: `/var/log/memroos/healthcheck.log`.

## Configurable via env vars

| Variable | Default |
|---|---|
| `MEMROOS_WEB_HEALTH` | `http://127.0.0.1:3000/api/health` |
| `MEMROOS_MEM0_HEALTH` | `http://127.0.0.1:3201/health` |
| `MEMROOS_GH_REPO` | `lac5q/memroos` |
| `MEMROOS_GH_TOKEN_FILE` | `/etc/memroos/gh-token` |
| `MEMROOS_HEALTHCHECK_STATE` | `/run/memroos-healthcheck` |
| `MEMROOS_HEALTHCHECK_LOG` | `/var/log/memroos/healthcheck.log` |
| `MEMROOS_HEALTHCHECK_COOLDOWN_S` | `21600` (6h) |