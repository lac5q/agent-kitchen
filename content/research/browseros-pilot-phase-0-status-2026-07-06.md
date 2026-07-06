---
title: BrowserOS Pilot — Phase 0 Setup Complete, Phase 1 Awaiting Sign-in
date: 2026-07-06
sources:
  - file://~/github/browseros-pilot/
  - https://github.com/browseros-ai/BrowserOS
  - https://docs.browseros.com/features/use-with-claude-code
status: phase-0-complete-phase-1-scaffolded
recommendation: awaiting Luis go-ahead for live sign-in + workflow run
---

# BrowserOS Pilot — Status Update

## TL;DR

Phase 0 (infrastructure) complete and verified non-destructive. Phase 1 (workflow +
measurement) scaffolded but blocked on Luis-driven account sign-in. Production
agents, cron jobs, and `BROWSER_AUTOMATION_STANDARD.md` all untouched.

## What exists now

| Artifact | Path | Purpose |
|---|---|---|
| BrowserOS app | `/Applications/BrowserOS.app` (v148.0.7948.97) | Installed, signed (team 8YMKWU47S5) |
| Isolated user-data-dir | `~/.browseros-pilot-profile/` | Separated from `~/.chrome-automation-profile/` |
| Pilot workspace | `~/.openclaw/workspace-browseros-pilot/` | Only this workspace sees BrowserOS MCP |
| MCP registration | `~/.openclaw/workspace-browseros-pilot/AGENTS.mcp.yaml` | `http://127.0.0.1:9239/mcp` (BrowserOS default) |
| Pilot repo | `~/github/browseros-pilot/` | Scripts, workflows, metrics, dashboard, docs |
| Workflow spec | `workflows/01-gmail-linear-slack.md` | Pre-flight + measurement schema |
| Logger | `scripts/measure.sh` | JSONL append, no jq dep |
| Dashboard | `dashboard.html` | Static A/B viewer with auto-verdict |
| Teardown | `scripts/teardown.sh` | Idempotent, dry-run verified |

## Lessons from Phase 0

1. **Wrong schema first.** Initial pilot design assumed Hermes agents are
   configured via `~/.openclaw/agents/<name>/config.yaml`. Reality: the actual
   isolation primitive is `~/.openclaw/workspace-<name>/AGENTS.mcp.yaml` —
   see `workspace-gizmo`, `workspace-gwen`, `workspace-attestations`. Fixed
   the pilot to use the workspace pattern; deleted the wrong-schemad
   `~/.openclaw/agents/pilot/` artifact.
2. **DMG install needs no sudo** — `/Applications` is admin-user-writable.
3. **BrowserOS MCP default port is 9239** — no manual Settings step needed
   when launched with `--remote-debugging-port=9239`.

## What's NOT done

The actual workflow runner (`01-gmail-linear-slack.sh`) and live pilot run.
Blocked on:

1. Luis opens BrowserOS, signs into Gmail + Linear + Slack (cookies persist
   in the isolated profile dir).
2. Luis tags ≥5 emails as `Needs triage` in Gmail.
3. Luis confirms Slack target channel (`#pilot-triage` new vs
   `#thrive-paid-media` fallback per Luis's profile).
4. Luis confirms Linear team.

I will not execute the live workflow without explicit go. Touching logged-in
sessions is exactly the behavior this pilot is meant to validate.

## Decision gate (unchanged from evaluation)

Pilot passes to Phase 3 only if BrowserOS wins ≥3 of 4 metrics over Chrome DevTools MCP:
1. Success rate (higher = better)
2. Duration (lower = better)
3. Errors (lower = better)
4. reCAPTCHA hits (lower = better)

`session_collisions` tracked separately as "don't regress."

## Next action

Either Luis:
- Signs in + tags emails + says "go" → I run the workflow, log metrics.
- Says "write the runner" → I produce `01-gmail-linear-slack.sh`, then he signs in.
- Says "skip Gmail, simpler test" → I propose an alternative first workflow.

OR if Luis wants to abort before doing any of this — `teardown.sh` (no flag) reverses Phase 0 in ~30s. Pilot repo + metrics are kept locally regardless.

See `~/github/browseros-pilot/docs/findings.md` for full breakdown including
all scripts, schema details, and the abandoned schema attempt (kept for
future-agent reference).
