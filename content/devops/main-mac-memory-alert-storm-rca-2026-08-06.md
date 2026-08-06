---
name: main-mac-memory-alert-storm-rca-2026-08-06
title: "RCA: main-mac MemRoOS memory alert storm and false-green Gmail ingestion"
description: "Root causes, live remediation, durable monitor changes, verification, and remaining credential actions for the 2026-08-06 main-mac memory alerts."
publishedAt: "2026-08-06"
tags: [memroos, rca, main-mac, qmd, mem0, gmail, alerting]
keywords: [better-sqlite3, NODE_MODULE_VERSION, launchd, alert deduplication, Gmail ingestion, disk thresholds]
author: "Codex"
source_session: "codex-desktop-2026-08-06"
model: "gpt-5.6"
sources:
  - "Gmail query: in:inbox newer_than:14d (MemRoOS OR memroos) (alert OR memory OR stack OR degraded)"
  - "live SSH diagnostics: main-mac, 2026-08-06"
  - "services/memory/healthcheck.sh"
  - "scripts/install-memory-resilience.mjs"
  - "main-mac:/Users/lcalderon/github/knowledge/personal-ingestion-email.py"
derived_from:
  - "memroos-product/content/diagnostics/2026-07-31-qmd-down-better-sqlite3-abi-mismatch.md"
regen_prompt: "Re-read recent MemRoOS alert emails, inspect live main-mac QMD/Mem0/disk/Gmail ingestion state, verify the alert policy, and update this RCA with current evidence."
---

# RCA: main-mac MemRoOS memory alert storm and false-green Gmail ingestion

## Executive summary

The alert volume was not one memory failure. Four independent conditions were being repeated by a five-minute healthcheck whose per-issue reminder interval was only 30 minutes and whose state lived in `/tmp`.

1. QMD was genuinely down after two Node runtimes diverged: interactive and healthcheck commands used Homebrew Node 26 (ABI 147), while the launch agent resolved Node 24 (ABI 137). Rebuilding `better-sqlite3` for either runtime broke the other.
2. Disk warnings used percentage alone. The Mac was 92% used but still had 35–46 GB free, producing standing alerts without immediate write-risk.
3. Mem0 had transient historical `/health` failures, but live verification showed `/livez=ok`, `/health=ok`, Qdrant connected, and queue depth zero.
4. Gmail ingestion was worse than “stale”: `gws` could not decrypt its keyring-backed token in cron, returned an error, and the worker converted that error to an empty result and advanced `gmail.last_run`. The monitor could therefore report fresh ingestion when no mail was read.

## Live remediation completed

- Rebuilt QMD’s `better-sqlite3` binding for Homebrew Node 26 while retaining the ABI-137 build as a dated backup.
- Pinned the QMD launch agent to absolute `/opt/homebrew/bin/node` plus QMD’s JS entrypoint. QMD `/health` now returns `ok`.
- Refreshed QMD collections with pull hooks temporarily disabled and automatically restored the original config. The source-to-QMD contract now passes, including the previously missing 2026-08-05 analysis document.
- Patched Gmail ingestion on main-mac to use the fail-closed `gwsa gmail` wrapper, raise on CLI/auth/JSON/timeout errors, exit nonzero, and not advance freshness state. A live failure test returned nonzero and left `last_run` unchanged.
- Removed the duplicate plaintext Qdrant API key from the Mem0 launch plist after proving it matched the file-backed key. Mem0 remained healthy and connected.
- Installed the new alert-policy source on main-mac. The scheduled monitor subsequently reported disk OK, QMD OK, indexing OK, Mem0 OK, and emitted one accurate Gmail authentication alert.

## Durable code changes prepared

- Persistent alert state: `~/.memroos/healthcheck-state`.
- Default per-issue repeat interval: 24 hours instead of 30 minutes.
- Disk severity combines percentage with free space. At 92% used and 35 GB free, main-mac is correctly OK.
- Mem0 `/health` gets two 12-second attempts when `/livez` remains healthy before restart/paging.
- Gmail freshness threshold is 13 hours, so a six-hour job must miss a full run before the stale alert.
- The monitor inspects the latest Gmail log block for auth/CLI failures instead of trusting `last_run` alone.
- The resilience installer owns a canonical QMD launch agent backed by a launcher that pins QMD to the Node binary beside the QMD executable and migrates the legacy user-named job.

## Verification

- `bash services/memory/tests/test_healthcheck_policy.sh`: passed.
- Shell syntax checks for healthcheck, policy, and QMD launcher: passed.
- `node scripts/install-memory-resilience.mjs check`: passed locally and on main-mac; all rendered plists passed `plutil`.
- Memory queue tests: 16 passed.
- Live QMD health: OK.
- Live source-to-QMD indexing contract: OK.
- Live Mem0: status OK, vector store connected, queue zero.
- Scheduled monitor: disk OK at 92%/35 GB; no repeated disk page.

The local WSL degradation harness still reports `SQLITE_CANTOPEN` for its own QMD fixture database. That is a separate local sandbox/index-path issue and did not invalidate the live main-mac repair.

## Remaining actions

1. Interactive authentication is required: run `gwsa gmail login` on main-mac and complete OAuth. All three saved `gwsa` account sessions currently report stale, and the personal account fails closed because its identity cannot be verified.
2. Rotate the 1Password service-account token and Qdrant credential. A read-only launchd metadata inspection exposed inherited credential values in the diagnostic tool output. Values are intentionally omitted here.
3. Do not commit/push/deploy the broader worktree yet. Native `gpt-5.6-luna` Max was reachable and inspected the diffs, but the worker runtime repeatedly ended before emitting its final verdict. The operator instructed the agent to stop if that validator could not complete.
