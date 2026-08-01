# Worker Contract — Revised MemroOS Recall Ship Pipeline (MEMX-1 + MEMX-2.5)

## Context

We are completing the migration of memroos to oracle-1. The audit on 2026-07-19 identified MEMX-1 ("Mac→oracle recall ship pipeline") as the missing piece. We started implementing it solo and discovered the original MEMX-1 doc had two incorrect assumptions:

1. **MEMX-2 was wrong about operator-key auth from CF.** Same POST to `/api/recall/ingest` returns 403 from cloudflare but 200 over SSH tunnel to oracle-1:3000. Workaround: ship pipeline routes through SSH tunnel.
2. **MEMX-1 was wrong about transport.** `ingestAllSessions` in `apps/memroos/src/lib/db-ingest.ts` reads `~/.claude/projects`, `~/.hermes/sessions`, `~/.qwen/projects`, `~/.codex/sessions` from oracle-1's OWN filesystem (defaults from `env.ts:146`). POSTing to `/api/recall/ingest` without first syncing files returns `filesProcessed:0`. We need a real rsync step.

The baseline + findings are in `~/github/memroos/.beastmode/learnings/2026-07-20-phase1-ship-pipeline-reshape.md`. Read it first.

## Goal

End-to-end: a single run of the ship script on the Mac moves ≥1 new JSONL from Mac to oracle-1's ingest, the operator on oracle-1 ingests it into SQLite + Qdrant + Neo4j, and `last_ingest_ts` advances.

## Scope (allowed files/directories)

1. `~/.openclaw/scripts/memroos-recall-ship.sh` — rewrite the existing shell script
2. `~/Library/LaunchAgents/com.memroos.recall-ship.plist` — adjust if needed
3. `~/github/memroos/services/memory/.memroos-ship.env` — already created, do not touch
4. **On oracle-1 via SSH (lcalderon's `~/.ssh/config` already has the host entry):**
   - `/etc/memroos/web.env` — append 4 env var lines (CLAUDE_MEMORY_PATH, HERMES_MEMORY_PATH, QWEN_MEMORY_PATH, CODEX_MEMORY_PATH)
   - `/home/opc/inbox/{claude,hermes,qwen,codex}` — already created; only need to `chown`/`chmod` if access denied
5. `/etc/systemd/system/memroos-web.service` — **MUST NOT edit**; the new env vars go into `/etc/memroos/web.env` which is already loaded via `EnvironmentFile=`

## Forbidden actions

- Do NOT commit, push, or merge to any branch
- Do NOT modify `/etc/memroos/{mem0.env,gh-token}` or any other secrets file
- Do NOT touch `/etc/cloudflared/`, `/etc/systemd/system/`, or anything outside scope
- Do NOT print the operator key (it starts with `2PFbZKcrnJpgzrevfGIGx7cH8R811iD8tEy93iDbKU8=` — redact in all logs)
- Do NOT run `systemctl restart memroos-web` without explicit approval — that is the blast-radius step. **Instead, produce the exact command in your output and wait.** (We will run it manually after your diff is approved.)

## Required outputs

1. **Revised `memroos-recall-ship.sh`** (~80–120 lines) that:
   - Sources the operator key from `~/github/memroos/services/memory/.memroos-ship.env`
   - Reads Mac-side state from `~/github/memroos/services/memory/.memroos-recall-state.json` (NEW file, JSON with `{"last_ingest_ts": "<iso>"}`). Create with sensible default `2026-07-05T18:15:21Z` if missing.
   - Opens SSH tunnel `localhost:3001 → oracle-1:3000` with `ssh -o ExitOnForwardFailure=yes -o ServerAliveInterval=60 -L 3001:127.0.0.1:3000 oracle-1`, using `ControlMaster=auto` and a `ControlPath` under `~/.ssh/cm-%r@%h:%p` so re-uses are cheap. Cleanup on exit (trap).
   - rsync each of 4 source dirs to corresponding `/home/opc/inbox/*` on oracle-1 using `--update --max-size=200M --include='*.jsonl' --exclude='*'` (incremental, capped per file). Use `rsync -az -e ssh` so it's compressed.
   - POST to `http://127.0.0.1:3001/api/recall/ingest` with `Authorization: Bearer ${KEY}` header
   - Parse JSON response and log `files/rows/skipped/timestamp` to `/Users/<you>/github/memroos/services/memory/logs/recall-ship.log`
   - On success: write `last_ingest_ts` (newest mtime of shipped files, or response timestamp) to Mac-side state file
   - On failure: log error, leave state file unchanged, exit 1 (auth) or 2 (5xx/transport)
   - Closes tunnel on exit (trap)
   - Handles already-running-tunnel case (if `127.0.0.1:3001` is already bound, skip the ssh -L)

2. **Append 4 lines to `/etc/memroos/web.env` on oracle-1** (you can edit via `sudo tee -a`):
   ```
   CLAUDE_MEMORY_PATH=/home/opc/inbox/claude
   HERMES_MEMORY_PATH=/home/opc/inbox/hermes
   QWEN_MEMORY_PATH=/home/opc/inbox/qwen
   CODEX_MEMORY_PATH=/home/opc/inbox/codex
   ```
   Do NOT restart the service yourself. Print the exact restart command in your output:
   ```
   ssh oracle-1 'sudo systemctl restart memroos-web && sleep 5 && sudo systemctl is-active memroos-web'
   ```

3. **Updated `com.memroos.recall-ship.plist`** only if the script's invocation semantics change (e.g., needs more env, longer StartInterval, etc.)

4. **Mac-side state file** `~/github/memroos/services/memory/.memroos-recall-state.json` with `{"last_ingest_ts": "2026-07-05T18:15:21.691Z"}` as the seed so the first run ships all 6.4 GB.

5. **Test plan output**: a `cat`-able shell snippet that you (or the director) can run to verify the pipeline end-to-end. Must include the final smoke:
   ```bash
   bash ~/.openclaw/scripts/memroos-recall-ship.sh
   ssh oracle-1 'sudo -u opc python3.11 -c "
   import sqlite3
   c = sqlite3.connect(\"/home/opc/github/memroos/data/conversations.db\").cursor()
   print(\"last_ingest_ts:\", c.execute(\"select value from meta where key=\\\"last_ingest_ts\\\"\").fetchone())
   "'
   ```
   Expected after restart + one run: `last_ingest_ts` is within ~5 min of now AND `filesProcessed > 0`.

## Constraints

- macOS bash 3.2 compatible (no bash 4+ features like `declare -A`)
- `set -euo pipefail` at the top
- Robust under tunnel-rotation: the SSH tunnel might already be bound by another process; handle gracefully
- Must not print the operator key anywhere
- Use the existing `~/.ssh/config` `oracle-1` Host entry; do NOT hardcode the IP
- The script runs every 10 min via LaunchAgent. Network blips are normal; log and exit non-zero, don't loop.

## Worker identification

- Worker: MiniMax-M3 / medium
- Director: me (claude-opus / high) inline, supervising
- Watcher: Opus / xhigh on completion (you will be reviewed)
- Branch: none — this is `~/.openclaw/scripts/`, outside any git repo. The oracle-1 env edit is via `sudo tee -a` to a non-git file. No branch isolation needed for this slice.

## Output format (JSON Schema)

Return a JSON object with these keys (be strict, the director parses it):

```json
{
  "script_diff_summary": "1-2 sentences on what changed in the ship script",
  "plist_changes": "what changed in the plist, or 'no change'",
  "oracle_env_appended": "exact 4 lines added to /etc/memroos/web.env",
  "state_file_created": true|false,
  "restart_command": "the exact ssh command the director must run",
  "first_run_expected_log_tail": "what you expect /Users/<you>/.../recall-ship.log to show after one successful run",
  "risks_blockers": [],
  "verification_notes": "anything the director should know before running the restart command"
}
```

## Hard rule

**Do NOT restart memroos-web.** Print the command. Stop. Wait for the director.