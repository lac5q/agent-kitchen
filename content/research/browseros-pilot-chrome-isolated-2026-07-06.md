---
title: BrowserOS Pilot — Pilot Chrome Isolated (CDP 9223), A/B Unblocked
date: 2026-07-06
sources:
  - file://~/github/browseros-pilot/
  - commit: e5e766f
  - commit: c4d4a01
  - commit: 9b8aa27
status: phase-1.3-ready-luis-action-blocked
---

# BrowserOS Pilot — A/B infrastructure complete

## TL;DR

Caught a Phase 0 design flaw: the original pilot design used Chrome DevTools MCP's
**production** Chrome (CDP 9222, production profile) as the A/B comparison browser.
That would have polluted production state and risked session collisions. Fixed by
spinning up a SECOND Chrome instance on port **9223** with an isolated profile
(`~/.browseros-pilot-chrome-profile`), mirroring the BrowserOS isolation.

Luis: Gmail is logged into BrowserOS (great), but **Linear and Slack are also
already accessible in BrowserOS** (cookie-sharing via "different tab"). All 3 apps
are available — the original 3-app pilot works.

## Current browser state

| Port | Browser | Profile | Status |
|---|---|---|---|
| 9222 | Chrome 149 (production automation) | `~/.chrome-automation-profile` | **DO NOT TOUCH** |
| 9223 | Chrome 149 (pilot, isolated) | `~/.browseros-pilot-chrome-profile` | **Fresh — needs Luis's login** |
| 9239 | BrowserOS 148 (pilot, isolated) | `~/.browseros-pilot-profile` | **Logged into Gmail + Linear + Slack** |

All three are alive and isolated. Pilot's A/B compares 9239 vs 9223. Production 9222 is not in the comparison.

## What Luis needs to do (now smaller than before)

1. **In BrowserOS** (already logged in): tag ≥5 Gmail messages as `Needs triage`.
   This persists server-side; both browsers will see them.
2. **In pilot Chrome** (9223, separate window): sign into Gmail once.
   Linear and Slack should ride SSO / cookie handoff.
3. **Say "go"** in this thread.

That's it. I invoke `delegate_task`, both MCPs run in parallel, ingest logs metrics,
dashboard refreshes, verdict prints.

## What changed in this cycle

- Added `scripts/launch-chrome-pilot.sh` — starts isolated Chrome on 9223
- Patched `workflows/01-gmail-linear-slack.sh` — preflight uses 9223, auto-launches
- Patched `workflows/01-launch-runner.py` — Chrome DevTools subagent told to use 9223
- Updated `workflows/01-gmail-linear-slack.md` — references current state, 5-condition gate, teardown modes
- Commits: `c4d4a01` (infrastructure), `e5e766f` (docs)

## Persistent state

- Pilot repo: `~/github/browseros-pilot/` (5 commits on main)
- All 3 browsers running, isolated
- Production Chrome 9222: untouched
- Decision gate: 5 conditions, success-rate-gated, verified by fixture tests
- MemroOS: 3 research docs durable

## What happens when Luis says "go"

1. `bash workflows/01-gmail-linear-slack.sh` preflights → all 3 browsers confirmed alive
2. Spec dir emitted to `workflows/.specs/<ts>/` with two delegate goals
3. `delegate_task(tasks=[bos_goal, chr_goal])` runs both in parallel (~8 min wall clock)
4. Both subagents return JSON metric on last line
5. `scripts/ingest-results.sh` parses, logs JSONL, refreshes dashboard, prints verdict
6. Decision gate (5 conditions) decides PASS/FAIL/REGRESSION_STOP
7. If PASS: I propose Phase 3 (Vendasta). If FAIL: I report and stop.

## Estimated time from "go" → decision

~10 minutes. Most of that is the two browsers actually doing the workflow.