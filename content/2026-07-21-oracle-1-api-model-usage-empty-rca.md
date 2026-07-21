---
title: oracle-1 /api/model-usage empty — parser ignored CLAUDE_MEMORY_PATH env
date: 2026-07-21
agent: Alba
model: MiniMax-M3
regen_prompt: "Investigate why /api/model-usage returned 0 models on oracle-1 even though /home/opc/inbox/claude/projects contained 318 JSONL files with 5,628 assistant messages carrying model+usage, while /home/opc/.claude/projects did not exist. Identify the upstream caller that hardcodes the inbox path."
sources:
  - /home/opc/github/memroos/apps/memroos/src/lib/parsers.ts (line 433 — pre-fix)
  - /home/opc/github/memroos/apps/memroos/src/app/api/model-usage/route.ts (caller)
  - /home/opc/github/memroos/apps/memroos/src/lib/constants.ts (env mapping)
  - /home/opc/github/memroos/apps/memroos/src/lib/env.ts (loadMemroosEnv fallback)
  - /etc/memroos/web.env (oracle-1 systemd EnvironmentFile)
  - production UI screenshots: /Users/lcalderon/.hermes/cache/images/img_26f2d9a89945.webp, img_2be8f5078ba1.png
derived_from: standing goal "can you repull the repo for maeve-u1 and start implementing using beastmode-hermes the gsd plan", 2026-07-20 22:21 — Luis reports "still one day" and "still no data"
---

# Root Cause

`apps/memroos/src/lib/parsers.ts:433` hardcoded `${process.env.HOME}/.claude/projects` for the Claude projects inbox path used by `parseModelUsage()`. The env var `CLAUDE_MEMORY_PATH` (wired via `loadMemroosEnv()` → `constants.ts`) was set to `/home/opc/inbox/claude/projects` on 2026-07-20 to pull Claude Code JSONL into a non-default inbox — but `parseModelUsage` ignored that env var. Result: route returned empty models, the operator UI showed "no data" since 2026-07-14 and the KPI timeline showed only the one ephemeral eval run.

Sibling callers in `db-ingest.ts:559-600` already imported `CLAUDE_MEMORY_PATH` from `./constants` — proving the env var was wired correctly and the discrepancy was inside `parseModelUsage` only.

# Why the symptoms lasted a week

`db-ingest.ts` scans the inbox and seeds the SQLite `efficiency_events` table for new transcripts. `parseModelUsage` reads the inbox *directly* at request time to enrich model usage. Two questions were independently answered: ingestion worked (and so unrelated pages showed data) but request-time aggregation returned empty (because of the hardcoded path). The user's "1 day / no data" report stayed alive because the operator UI consumes `parseModelUsage`, not the SQLite ledger.

# Fix

Single-line change in `parsers.ts` plus a regression test. Adds `import { CLAUDE_MEMORY_PATH } from "./constants"` and replaces the hardcoded path with the imported env value. Test seeds a stub JSONL into a tmp dir with `CLAUDE_MEMORY_PATH` set, asserts `parseModelUsage` aggregates the tokens.

# Deployment

- PR-by-merge worktree: `/tmp/memroos-fix-parsers-inbox` on `fix/parsers-claude-inbox-path`
- Commit `bec2aae7` → merged to main as `91a07a0d` (no-ff merge commit)
- `npx next build` in `apps/memroos/` succeeded
- `systemctl restart memroos-web` while systemd EnvironmentFile was already loading `CLAUDE_MEMORY_PATH=/home/opc/inbox/claude/projects`

# Verification

Live `/api/model-usage?since=2026-04-01T00:00:00Z` now returns 9 model rows, 79,678,135 input / 4,135,565 output / 4,300 requests:

| Model                   | Input       | Output     | Reqs  |
|-------------------------|------------:|-----------:|------:|
| claude-opus-4-8         |  31,477,227 |  1,973,820 |  1440 |
| claude-fable-5          |  19,775,879 |  1,143,679 |  1119 |
| claude-sonnet-5         |  16,088,995 |    502,410 |   825 |
| claude-sonnet-4-6       |  11,115,044 |    391,688 |   732 |
| claude-opus-4-7         |     999,254 |    121,911 |   141 |
| claude-haiku-4-5-...    |     119,730 |        406 |     2 |
| grok-4.5                |      96,468 |      1,454 |    34 |
| MiniMax-M3              |       5,360 |        102 |     4 |
| xai-grok-4.5            |         178 |         95 |     3 |

`claudeJsonlModels: 9` confirms the env-path fix worked; `efficiencyLedgerModels: 0` and `rtkModels: 0` are expected (durable ledger table not yet populated; RTK not installed).

# Lesson

When an env var is added in one place, grep for *every* hardcoded fallback that ignores it. The fast grep that caught this: `grep -nE "/\.claude/projects|/\.qwen|/\.hermes/sessions|/\.codex/sessions" apps/memroos/src/lib/parsers.ts` — only one hit. Other modules (`db-ingest.ts`) already used `import { ... } from "./constants"`, so the parser was the last holdout.
