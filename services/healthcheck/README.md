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
- A non-optional service in `/api/health` reports `status: "down"` or
  `status: "degraded"` (including mem0, Graph Memory, Agents, and APO)
- An explicitly optional local-tool degradation is ignored only for RTK, QMD, or
  Knowledge Index when its detail clearly says the tool is optional and absent or skipped
- `disk.critical: true` (high severity)
- `disk.warning: true` (medium severity; re-fires every 6h while persistent)

## Files

```
services/healthcheck/memroos-healthcheck.py     — the script
deploy/oracle-1/systemd/memroos-healthcheck.service
deploy/oracle-1/systemd/memroos-healthcheck.timer
```

The systemd service runs as `opc`, requests `network-online.target`, and has a
90-second `TimeoutStartSec`. The watchdog applies its own 85-second monotonic
deadline to endpoint and GitHub requests so systemd retains shutdown grace.

## GitHub token requirements

Create a **fine-grained GitHub personal access token** restricted to the single
repository `lac5q/memroos`. Grant only:

- **Repository access:** `lac5q/memroos` only
- **Repository permissions:** `Issues: Read and write`
- **Metadata:** read (GitHub's required repository metadata access)

Do not grant broad classic `repo` scopes or access to other repositories, and
never store a token in this repository, a unit file, or an environment file
checked into source control.

## Install on a fresh oracle-1

```bash
# 1. Copy the script and units
sudo install -m 0755 services/healthcheck/memroos-healthcheck.py /usr/local/bin/memroos-healthcheck.py
sudo install -m 0644 deploy/oracle-1/systemd/memroos-healthcheck.service /etc/systemd/system/
sudo install -m 0644 deploy/oracle-1/systemd/memroos-healthcheck.timer   /etc/systemd/system/

# 2. Store the fine-grained PAT outside the repository.
#    File owner/mode: root:opc, 0640 (or a more restrictive mode that still lets opc read it).
sudo install -m 0640 -o root -g opc /path/to/local/fine-grained-pat /etc/memroos/gh-token

# 3. Enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now memroos-healthcheck.timer
```

`root:opc` with mode `0640` is required by the current design because the
production unit explicitly runs as `User=opc`; root owns the secret while the
service account can read it. A more locked-down future design would replace the
long-lived PAT with a root-owned helper or GitHub App that supplies a
short-lived, repository-scoped installation token to a dedicated service
identity.

## Verify

```bash
# Dry run (no issues opened)
sudo -u opc /usr/local/bin/memroos-healthcheck.py --dry-run

# Scan once. This is already what the systemd service does; it creates an issue
# only if an active failure is found and normal deduplication/cooldown allows it.
sudo -u opc /usr/local/bin/memroos-healthcheck.py --once

# Verify that the configured token can read this repository's issue listing.
# This does not create, edit, or otherwise modify any issue.
sudo -u opc /usr/local/bin/memroos-healthcheck.py --check-github-auth

# Watch the journal
journalctl -u memroos-healthcheck.service -f
```

`--check-github-auth` exits nonzero if the token is missing, invalid, or cannot
read issues for the configured repository. It deliberately validates only
read/access; it does **not** create a test issue or verify write permission.

## Behavior

- **Cooldown**: same signature suppressed for `COOLDOWN_S` (default 6h) even after resolution.
- **Open-issue dedup**: if an open issue with the same signature already exists, the
  watchdog posts a `SKIP (open issue exists)` line to `/var/log/memroos/healthcheck.log`
  rather than opening a duplicate.
- **Lookup safety**: the watchdog paginates labeled open issues (up to 10 pages of
  100) before creating one. If GitHub lookup fails or exceeds that cap, it skips
  creation rather than risking a duplicate.
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