---
title: QMD crash-loop on main-mac — better-sqlite3 NODE_MODULE_VERSION mismatch
model: MiniMax-M3
sources:
  - /tmp/qmd-mcp.err
  - /Users/<you>/Library/LaunchAgents/com.lcalderon.qmd-mcp.plist
  - /Users/<you>/github/memroos/services/memory/healthcheck.sh
derived_from: 2026-07-30/2026-07-31 alert cluster "[main-mac] Memroos Memory Alert — QMD is DOWN ... Status: parse_error" + "Recent knowledge sources are NOT agent-searchable"
regen_prompt: "Reproduce the QMD launchd crash-loop and better-sqlite3 ABI fix on main-mac"
date: 2026-07-31
host: main-mac
---

# QMD crash-loop on main-mac — better-sqlite3 NODE_MODULE_VERSION mismatch

## Symptom (the alerts)

50 email alerts across 2026-07-30 to 2026-07-31 from alerts@memroos.com. The healthcheck (services/memory/healthcheck.sh, com.memroos.memory-healthcheck launchd job, every 5 min) emits four recurring classes:

| Alert class                       | Count | What it actually meant                                                                                                    |
| --------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------- |
| qmd_down (Status: parse_error)    |    15 | QMD child process crashes on startup; curl /health gets empty body, json_field falls back to parse_error                   |
| qmd_index_contract (FAIL)         |    10 | check-knowledge-indexing.mjs reports missing qmd://... entries for 2 .md files that DO exist on disk; root cause = same     |
| disk_warning (90 to 92 % full)    |    28 | Real standing problem: df shows /dev/disk3s5 460 Gi used 378 Gi 38 Gi 92 %                                                |
| mem0_hung / mem0_down             |     5 | Cycles; auto-restart cooldown restores, recovery emails prove it                                                          |
| email_ingestion_stale             |     5 | False positive; state file shows gmail.last_run 2026-07-31T07:00:11Z (1.5 h ago, less than 8 h threshold)                  |

"QMD is DOWN at http://localhost:9472; Status: parse_error" is the symptom; the watcher text is misleading because empty-body curl reads as parse_error through json_field, not because QMD's API literally returned that.

## Root cause

/opt/homebrew/lib/node_modules/@tobilu/qmd/node_modules/better-sqlite3/build/Release/better_sqlite3.node was compiled against Node v22 (NODE_MODULE_VERSION 147), but launchd runs the job via /opt/homebrew/bin/qmd which resolves node from PATH (plist PATH starts with ~/.local/bin, which is Node v24.18, NODE_MODULE_VERSION 137).

Result: ERR_DLOPEN_FAILED at Database() constructor in dist/db.js:58:12. Crash in under 100 ms. launchctl keeps the parent launcher alive (KeepAlive=true), so launchd reports com.lcalderon.qmd-mcp PID 85836 as healthy while the qmd child crashes every second.

## Why npm rebuild did NOT fix it

better-sqlite3 install script is `prebuild-install || node-gyp rebuild --release`. prebuild-install ships precompiled binaries for the most common Node ABIs. If a prebuilt exists for the running ABI it short-circuits and node-gyp rebuild never runs. So `npm rebuild better-sqlite3` is a no-op unless the user explicitly forces a from-source build.

## The fix (proved in user's env, 2026-07-31)

```bash
cd /opt/homebrew/lib/node_modules/@tobilu/qmd/node_modules/better-sqlite3
rm -rf build
bash /opt/homebrew/lib/node_modules/npm/bin/node-gyp-bin/node-gyp rebuild --release
# node-gyp uses headers cached at ~/Library/Caches/node-gyp/<node-version>/
# which corresponds to the node binary PATH resolves to.
launchctl kickstart -k gui/$(id -u)/com.lcalderon.qmd-mcp
curl -s --max-time 4 http://localhost:9472/health
# returns {"status":"ok","uptime":<n>}
```

Verify lsof -nP -iTCP:9472 -sTCP:LISTEN shows a real Node listener. On main-mac this returned `node 89593 lcalderon ... TCP [::1]:9472 (LISTEN)` and `{"status":"ok","uptime":2}` immediately after.

## Pitfalls / gotchas

1. Force node-gyp, not npm rebuild. prebuild-install masks the bug. Always delete build/ first, then invoke the bundled node-gyp shim directly via bash (the shim is a shell script that npm invokes as a node module; running it with node directly errors on line 2).
2. Match the node version launchd uses, not the one brew Cellar ships. On main-mac that is ~/.local/bin/node v24.18.0 (PATH-first in the qmd-mcp plist), not /opt/homebrew/Cellar/node/26.5.0/bin/node.
3. launchctl list is not enough; it shows the parent launcher (KeepAlive), not the qmd child. Verify with lsof -nP -iTCP:9472 and an actual /health request.
4. Cooldowns matter: services/memory/healthcheck.sh rate-limits emails to 5/hr and per-check cooldown is 1800 s. After QMD recovers, the next healthcheck tick (within 5 min) emails a "Memory Recovered" alert and clears qmd_down.last.
5. QMD index contract FAIL is data, not script. When QMD is up, check-knowledge-indexing.mjs --days=2 will resync any files that fell out of the index. No manual re-staging needed.

## Disk space (still pending)

Disk warning alert is real. As of 2026-07-31 08:35 UTC main-mac is at 92 % (37 GB free). Reclaim candidates I identified (NOT deleted; caller's call, these are user-data adjacent):

- ~/Library/Application Support — 27 G (largest; contains Mail, Slack, ChatGPT, Codex app caches)
- ~/Library/Caches — 5.2 G (1.5 G OpenAI Codex, 893 M Telegram, 891 M Google, 323 M Spark Desktop)
- ~/.npm — 2.8 G (npm cache; safe to prune via npm cache clean --force)
- ~/Library/Group Containers — 3.4 G
- ~/Library/Python — 2.2 G

The healthcheck alert literally points the operator at `du -sh ~/Library/* | sort -hr | head -20`. The MemroOS alert template already names the right diagnostic.

## Verification checklist (replay any time)

```bash
lsof -nP -iTCP:9472 -sTCP:LISTEN          # qmd listening?
curl -s http://localhost:9472/health      # {"status":"ok",...}?
lsof -nP -iTCP:3201 -sTCP:LISTEN          # mem0 listening?
curl -s http://localhost:3201/livez       # {"status":"ok",...}?
df -h ~ | tail -1                          # disk % below warning (90)?
cat ~/github/knowledge/ingestion-state.json | jq .gmail.last_run   # fresh?
```
