---
name: "coach-daily-cron-2026-08-06"
title: "Daily Coach Cron Installation and Verification"
description: "User-level 07:00 America/Los_Angeles cron for the bounded Luna-to-Sol Coach pipeline, with end-to-end provenance and timeout-failure verification."
publishedAt: "2026-08-06"
tags: [coach, executive-coaching, cron, codex, local-first, reliability]
keywords: [daily Coach, cron, gpt-5.6-luna, gpt-5.6-sol, provenance, timeout]
author: "Codex"
source_session: "019fd7b7-7882-76c1-81ae-b838892c1bcb"
model: "gpt-5.6-luna (max) -> gpt-5.6-sol (high)"
sources:
  - "workspace:/home/lac5q/github/coach/scripts/run_daily_coach.py"
  - "workspace:/home/lac5q/github/coach/scripts/run-daily-coach.sh"
  - "workspace:/home/lac5q/github/coach/scripts/install-daily-coach-cron.sh"
  - "workspace:/home/lac5q/github/coach/data/daily-coach/2026-08-06/run.json"
derived_from:
  - "content/coach-execute-skill-2026-08-06.md"
  - "content/coach-pilot-control-plane-implementation-status-2026-08-06.md"
regen_prompt: "Verify the user-level Coach cron schedule, run the bounded local Luna-to-Sol pipeline, inspect run.json provenance and artifacts, and record any runner defects and fixes."
---

# Daily Coach cron installation and verification — 2026-08-06

## Result

The user-level cron job is installed for 07:00 America/Los_Angeles:

`0 7 * * * /home/lac5q/github/coach/scripts/run-daily-coach.sh >> /home/lac5q/github/coach/data/daily-coach/cron.log 2>&1 # coach-pilot-daily`

The pipeline is deliberately local and advisory. It renders the bounded SQLite Coach context, invokes `gpt-5.6-luna` with max reasoning for data gathering, then invokes `gpt-5.6-sol` with high reasoning for strategy. It does not connect to email, calendars, messaging, browsing, or external action systems.

## End-to-end evidence

The manual verification run passed on 2026-08-06. The run metadata records:

- Luna requested and observed: `gpt-5.6-luna / max`
- Sol requested and observed: `gpt-5.6-sol / high`
- Both stages exited successfully and produced non-empty Markdown.
- Model provenance came from Codex session metadata; the temporary session records were removed after verification.
- Artifacts are under `/home/lac5q/github/coach/data/daily-coach/2026-08-06/`, including `context.md`, `luna-gather.md`, `sol-strategy.md`, per-stage metadata/events/stderr, and `run.json`.

## Reliability fix

The first end-to-end attempt exposed a runner defect: Python can return timeout streams as bytes even when `text=True`, which caused a secondary `TypeError` and left `run.json` at `status: running`. The runner now decodes timeout streams and records any expected or unexpected failure as `status: failed` with an error. A bounded timeout test confirmed the corrected behavior.

## Operating limits

Gate 0 is currently incomplete, so the strategy correctly reports missing intended outcome, target behavior, rationale, and baseline duration. The first useful user setup is:

`PYTHONPATH=src python3 -m coach --db data/coach.db gate-set --outcome "..." --behavior "..." --reason "..." --permission "bounded Coach data for advisory use only"`

Then start a bounded baseline before treating patterns as evidence. Disable the schedule with:

`/home/lac5q/github/coach/scripts/install-daily-coach-cron.sh --uninstall`
