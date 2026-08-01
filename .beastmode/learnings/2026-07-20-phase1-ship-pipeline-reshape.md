# BM-20260720-0155 phase-1-ship-pipeline-reshape
- Director/Lead: me (claude-opus/high)
- Watcher: n/a (Phase 1 mid-discovery)
- Executor: n/a yet (will spawn MiniMax-M3 worker for revised ship script)
- Harness: manual SSH + bash, will switch to workflow worker
- Acceptance checks: oracle-1 POST through SSH tunnel, last_ingest_ts moved, /api/recall GET works from CF
- Result: partial — auth-via-tunnel works, file-ship step needed
- Token/cost note: low — bash only
- Watcher fallback chain (v2.5.2): n/a

## What Phase 1 found vs the MEMX-1 audit doc

1. **MEMX-1 doc was wrong about transport.** The doc assumed `POST /api/recall/ingest` alone would ship transcripts. Reality: `ingestAllSessions` reads `~/.claude/projects` etc. FROM ORACLE-1'S OWN FILESYSTEM (defaults to `${HOME}/.claude/projects`). POSTing without shipping files = `filesProcessed: 0`. Confirmed live: tunnel+POST returned `{"filesProcessed":0,"rowsInserted":0}` while `last_ingest_ts` updated to 2026-07-20T01:49:13Z — the timestamp ran, but no files were ingested.

2. **MEMX-2 doc was wrong about operator-key auth from CF.** `MEMROOS_OPERATOR_API_KEY` IS in `/etc/memroos/web.env`, the running process has it (`/proc/PID/environ`), and byte-identical keys are exchanged in both `.env.local` and `web.env`. Yet `POST /api/recall/ingest` from CF returns 403 "Registry write authorization required" while the same POST over SSH tunnel to oracle-1:3000 returns 200. The `hasOperatorKey` function appears to be failing on CF-originated requests for an unknown reason (header pass-through? CF worker transform? Next.js URL parse behavior on proxied requests?). **Workaround: SSH tunnel** to oracle-1 loopback from the Mac. The audit doc's "loopback exemption" insight applies here too — same route, same auth, works on loopback.

3. **MEMX-1 needs an rsync step.** Revised ship pipeline: rsync Mac JSONLs → oracle-1 filesystem paths that oracle-1's ingest knows about, then POST to trigger ingest. Incremental: only files newer than `last_ingest_ts`. First sync ≈ 6.4 GB; subsequent ≤ a few MB.

4. **MEMX-7 confirmed independently.** `vault_artifact` table MISSING in conversations.db. Only `memory_vault_durability` exists.

## New ticket: MEMX-9 — operator-key auth fails from CF (workaround: SSH tunnel)

**Root cause:** Unknown. Possible candidates:
- cloudflared passes through Host header but something else gets stripped
- Next.js `new URL(request.url)` returns a hostname that doesn't match expected (Next 16.x behavior on proxied requests)
- A Cloudflare edge rule or Transform Rule on the oracle-1 zone stripping custom headers
**Workaround in place:** SSH tunnel from Mac → oracle-1:3000 over the existing `~/.ssh/config` oracle-1 host entry, with `AddKeysToAgent yes / UseKeychain yes` so the SSH key is reachable from non-tty context.
**Smoke:** `bash ~/.openclaw/scripts/memroos-recall-ship.sh` returns `filesProcessed > 0` after one full rsync pass.

## Revised ship pipeline contract (new)

1. Open SSH tunnel `localhost:3001 → oracle-1:3000` with `-o ExitOnForwardFailure=yes`
2. rsync Mac JSONLs (incremental, `--update --max-size=200M`) to `/home/opc/inbox/{claude,hermes,qwen,codex}` on oracle-1 (a NEW path oracle-1's ingest needs to be told to read — env var override)
3. Either:
   - **(a)** Tell oracle-1 to read from `/home/opc/inbox/{claude,hermes,qwen,codex}` via `CLAUDE_MEMORY_PATH` etc. env vars in `memroos-web.service` (requires systemd unit edit + restart) — PROPER FIX
   - **(b)** Mirror the Mac paths into oracle-1's `~/.claude/projects` etc. (symlink or rsync into HOME — fragile, conflicts with any future local oracle-1 use)
4. POST to `http://127.0.0.1:3001/api/recall/ingest` with operator key
5. Close tunnel
6. Write `last_ingest_ts` back to a Mac-side state file (so we know what to ship next time)

Decision: go with (a) — proper fix, env-var-only, no fragile filesystem surgery. This requires `MEMX-2.5`: add 4 env vars to `memroos-web.service` EnvironmentFile or systemd unit, restart `memroos-web`, then ship pipeline runs end-to-end.

## Updated Phase 1 acceptance criteria

- `last_ingest_ts` advances within 10 minutes of one ship run
- `filesProcessed > 0` (was 0)
- `last_ingest_ts` written back to Mac-side state file
- LaunchAgent installed and verified via `launchctl list | grep memroos.recall-ship`
- One successful end-to-end run captured in `/Users/<you>/github/memroos/services/memory/logs/recall-ship.log`

## What still works

- SSH tunnel auth-bypass: ✅ verified with live `filesProcessed:0` 200 response
- The script structure (auth probe, JSON body parse, error codes): ✅ unchanged
- Operator key storage in `~/github/memroos/services/memory/.memroos-ship.env` (chmod 600): ✅ in place
- LaunchAgent plist at `~/Library/LaunchAgents/com.memroos.recall-ship.plist`: ✅ in place