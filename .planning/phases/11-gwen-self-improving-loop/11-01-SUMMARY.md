---
phase: 11-gwen-self-improving-loop
plan: "01"
subsystem: knowledge-sync
tags: [gwen, self-improving, skill-sync, mem0, cron, tdd]
dependency_graph:
  requires: []
  provides: [gwen-staging-pickup, gwen-reflection-cron, staging-dir]
  affects: [skill-sync.py, skill-contributions.jsonl]
tech_stack:
  added: []
  patterns: [TDD-red-green, staging-pickup, jsonl-events, cron-registration]
key_files:
  created:
    - ~/github/knowledge/scripts/tests/test_skill_sync.py
    - ~/.hermes/cron/gwen-reflection.json
  modified:
    - ~/github/knowledge/scripts/skill-sync.py
decisions:
  - STAGING_DIR constant derived from CONFIG["master_dir"] so tests can monkeypatch both together
  - Grace period fix: replaced hardcoded 90-day value with CONFIG["hermes_contrib_grace_days"] (365 days); staging-promoted skills auto-qualify via "hermes" substring in path
  - gwen-reflection cron at 0 3 * * * America/Los_Angeles — 1 hour before Hermes skill-sync (0 4 * * *) to ensure no collision
  - mem0 is sole memory backend for Gwen; Cognee-OpenClaw absent and confirmed not installed
metrics:
  duration: ~25m
  completed: 2026-04-13
  tasks_completed: 2
  files_modified: 3
  files_created: 2
---

# Phase 11 Plan 01: Gwen Self-Improving Loop Summary

**One-liner:** Gwen's staging pickup wired into skill-sync.py (TDD, 6/6 green), 3am reflection cron registered, mem0-only memory confirmed.

## Tasks Completed

| Task | Name | Commit (knowledge repo) | Files |
|------|------|------------------------|-------|
| 1 | Add .hermes-staging pickup to skill-sync.py (TDD RED→GREEN) | RED: bf16eb7 / GREEN: 1a3b8ed | skill-sync.py, test_skill_sync.py |
| 2 | Verify AGENT-01 and register AGENT-03 (3am reflection cron) | (pre-existing + local) | gwen-reflection.json |

## Test Results (Task 1 TDD)

### RED Phase — 6/6 FAILED (confirmed gap)

All 6 tests errored with `AttributeError: module 'skill-sync' has no attribute 'STAGING_DIR'` — confirming tests correctly target the unimplemented feature.

### GREEN Phase — 6/6 PASSED

```
PASSED scripts/tests/test_skill_sync.py::test_staging_happy_path
PASSED scripts/tests/test_skill_sync.py::test_staging_dry_run
PASSED scripts/tests/test_skill_sync.py::test_staging_missing_skill_md
PASSED scripts/tests/test_skill_sync.py::test_staging_duplicate_skip
PASSED scripts/tests/test_skill_sync.py::test_staging_dir_absent
PASSED scripts/tests/test_skill_sync.py::test_staging_jsonl_event

6 passed in 0.02s
```

## Verification Results

### AGENT-01: self-improving-agent installed, Cognee absent
- `~/.openclaw/skills/self-improving-agent/SKILL.md` — EXISTS (19704 bytes)
- Cognee directories in `~/.openclaw/skills/` — ABSENT
- mem0 health at `http://localhost:3201/health` — HTTP 200 OK
- No Cognee references in self-improving-agent skill files — CONFIRMED

### AGENT-02: Staging pickup live in skill-sync.py
- `STAGING_DIR = CONFIG["master_dir"] / ".hermes-staging"` — line 40
- Staging pickup block in `run_sync()` — lines 287-305
- `staged contribution` elif branch in `main()` JSONL handler — wires `contributor='gwen'`
- Dry-run smoke test output: `+ test-gwen-skill-delete-me (staged contribution)` — CONFIRMED
- `~/github/knowledge/skills/.hermes-staging/.gitkeep` — EXISTS

### AGENT-03: Gwen reflection cron registered
```
Hermes cron: 0 4 * * *
Gwen cron:   0 3 * * *  tz: America/Los_Angeles
No collision — OK
```
- `~/.hermes/cron/gwen-reflection.json` — valid JSON, id=`gwen-reflection-3am`
- Schedule: `0 3 * * *` at `America/Los_Angeles`
- Hermes `skill-sync.json` has `0 4 * * *` — no collision CONFIRMED

### Grace Period Fix
- `timedelta(days=90)` hardcode — ABSENT from skill-sync.py
- `CONFIG["hermes_contrib_grace_days"]` (365 days) — PRESENT

## Implementation Details

### Changes to skill-sync.py

1. **STAGING_DIR constant** (line 40): `STAGING_DIR = CONFIG["master_dir"] / ".hermes-staging"`

2. **Grace period fix** (line ~104): Replaced 90-day hardcode with `CONFIG["hermes_contrib_grace_days"]`; staging-promoted skills auto-qualify for 365-day grace because their `synced_from` path contains "hermes"

3. **Staging pickup block in run_sync()**: After Hermes→Master block, checks `STAGING_DIR.exists()`, validates `SKILL.md` presence, guards against duplicates, copies to master, removes from staging, logs `"staged contribution"`

4. **JSONL event in main()**: New `elif "staged contribution"` branch calls `append_jsonl_event(skill, "contributed", "gwen")` for dashboard tracking

### Threat Mitigations Applied (from plan threat register)

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-11-01: Tampering via staging | SKILL.md existence check gates promotion | Implemented in staging block |
| T-11-03: Staging overwrites master | `skill not in master_skills` guard prevents overwrite | Implemented in staging block |

## Deviations from Plan

None — plan executed exactly as written. All 4 changes applied in the specified order. 6 pytest scenarios pass.

## Known Stubs

None. All data paths are wired (staging pickup reads from real disk, JSONL events write to real CONTRIBUTIONS_LOG).

## Threat Flags

None. No new network endpoints, auth paths, or schema changes introduced beyond what the plan's threat model covers.

## Self-Check: PASSED

- `~/github/knowledge/scripts/tests/test_skill_sync.py` — FOUND
- `~/github/knowledge/scripts/skill-sync.py` contains STAGING_DIR — FOUND (line 40)
- `~/.hermes/cron/gwen-reflection.json` — FOUND
- `~/github/knowledge/skills/.hermes-staging/.gitkeep` — FOUND
- RED commit bf16eb7 — FOUND in knowledge repo
- GREEN commit 1a3b8ed — FOUND in knowledge repo
