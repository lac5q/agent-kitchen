---
title: BrowserOS Pilot — Phase 1.2 Runner Built, Awaits Luis Sign-in + delegate_task Trigger
date: 2026-07-06
sources:
  - file://~/github/browseros-pilot/
  - commit: b4bafc2
  - commit: ceae38b
status: phase-1.2-complete-phase-1.3-blocked-on-luis
---

# BrowserOS Pilot — Phase 1.2 Status

## TL;DR

Phase 1.2 (the runner) is built, syntax-clean, preflight-verified.
The pilot now collapses to a single 3-step human process:

1. Sign into Gmail/Linear/Slack in the BrowserOS window (already launched).
2. Tag ≥5 Gmail messages `Needs triage`.
3. Say "go" — agent invokes `delegate_task`, both MCPs run in parallel, metrics log, dashboard refreshes, verdict prints.

Production remains untouched. Teardown remains verified. BrowserOS v148.0.7948.97 is running on `127.0.0.1:9239` against the isolated `~/.browseros-pilot-profile`.

## What got built (Phase 1.2)

| Artifact | Path | Purpose |
|---|---|---|
| Runner | `workflows/01-gmail-linear-slack.sh` | Preflight (BrowserOS CDP, Chrome CDP, both workspaces) → goal templating → spec dir emission → exits with `delegate_task` payload |
| Python launcher | `workflows/01-launch-runner.py` | Cleaner spec dir emission with delegated payload embedded in JSON |
| Ingest+verdict | `scripts/ingest-results.sh` | Parses both transcripts → JSONL append → dashboard refresh → auto-verdict (≥3 of 4 = PASS) |
| Sibling workspace | `~/.openclaw/workspace-chrome-devtools-pilot/` | A/B's other half — only Chrome DevTools MCP, isolated from BrowserOS workspace |
| EXIT trap | in runner | On preflight abort: leaves BrowserOS running (so Luis can sign in), notes how to kill |
| `.gitignore` updates | excludes runtime logs and `.specs/` | Dry-runs no longer pollute the repo |

## Pilot state (live)

- BrowserOS app: running (CDP 9239 alive)
- BrowserOS isolated profile: empty (waiting for Luis's logins)
- Chrome DevTools CDP 9222: not running — Luis runs `~/.hermes/bin/chrome-automation-start 9222` when ready
- Both MCP workspaces registered, scoped exactly as designed
- Production (`~/.chrome-automation-profile`, `BROWSER_AUTOMATION_STANDARD.md`, 8 agent workspaces, all cron jobs): untouched

## What still requires Luis

| Step | Time | Risk |
|---|---|---|
| Sign into Gmail in the BrowserOS window | 30s | Zero — BrowserOS is sandboxed |
| Sign into Linear in same window | 30s | Zero |
| Sign into Slack in same window | 30s | Zero |
| Tag ≥5 Gmail messages `Needs triage` | 1m | Zero |
| Start Chrome DevTools CDP | 5s | Zero — same as launching existing automation Chrome |
| Say "go" | triggers Phase 1.3 |

Total human time: ~3 minutes. Then I execute Phase 1.3.

## What Phase 1.3 (Luis go) will do

1. Invoke `delegate_task` with two parallel subtasks — one per MCP workspace.
2. Both subtasks return JSON metrics on the last line.
3. I call `scripts/ingest-results.sh` to log + refresh dashboard + print verdict.
4. Update `docs/findings.md` with actual numbers.
5. If PASS (≥3/4): propose Phase 3 (Vendasta pilot).
6. If FAIL: stop, RCA, ask before tweaking.

## Phase 2 verdict is unchanged

BrowserOS must win ≥3 of 4 metrics over Chrome DevTools:
1. Success rate (higher)
2. Duration (lower)
3. Errors (lower)
4. reCAPTCHA hits (lower)

Any BrowserOS `session_collisions > 0` triggers instant STOP + RCA regardless of other wins.

## Next action

Luis does the 3-step sign-in/tag/start when convenient, says "go." I execute. Estimated Phase 1.3 wall clock: 8–10 minutes (both browsers in parallel).

OR: Luis says "abort" and I tear down.

Commits: `b4bafc2` (Phase 1.2), `ceae38b` (Phase 0 setup).
