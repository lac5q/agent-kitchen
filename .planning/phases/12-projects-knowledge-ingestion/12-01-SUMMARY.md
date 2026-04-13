---
phase: 12-projects-knowledge-ingestion
plan: 01
subsystem: knowledge-ingestion
tags: [python, mem0, tdd, dedup, projects-sync]
dependency_graph:
  requires: [obsidian-to-mem0.py (template pattern), knowledge-curator.sh (Step 6 pattern)]
  provides: [projects-to-mem0.py, projects-ingestion-state.json]
  affects: [knowledge-curator.sh (Step 7 added), mem0 shared agent memories]
tech_stack:
  added: [projects-to-mem0.py (Python 3, urllib, pathlib, hashlib)]
  patterns: [TDD red-green, atomic state write, content-hash dedup, mtime watermark, origin tag guard]
key_files:
  created:
    - ~/github/knowledge/scripts/projects-to-mem0.py
    - ~/github/knowledge/scripts/tests/test_projects_to_mem0.py
  modified:
    - ~/github/knowledge/knowledge-curator.sh
  runtime_created:
    - ~/github/knowledge/projects-ingestion-state.json
decisions:
  - agent_id=shared for all projects (not per-project namespaces — KNOW-09, quota safety)
  - rel_path computed from PROJECTS_DIR.parent (not VAULT) for test isolation
  - state key format project-{dirname} isolates per-project watermarks within one file
metrics:
  duration: ~23 minutes
  completed: "2026-04-13"
  tasks: 3
  files: 3
requirements_satisfied: [KNOW-08, KNOW-09]
---

# Phase 12 Plan 01: Projects Knowledge Ingestion Summary

**One-liner:** Projects subdirectory mem0 ingestion via SHA-256 content-hash + mtime watermark + origin-tag dedup, agent_id=shared with per-project metadata.project filtering.

## What Was Built

A new Python ingestion script `projects-to-mem0.py` that walks all 46 immediate subdirectories of `~/github/knowledge/projects/`, ingests all 341 Markdown files into mem0 under `agent_id="shared"` with `metadata.project=<dirname>`, and applies three dedup guards proven in Phase 8.

Wired as non-fatal Step 7 in `knowledge-curator.sh` (all 6 existing step labels updated from [N/5] or [N/6] to [N/7]).

## Files Created / Modified

| File | Location | Action |
|------|----------|--------|
| `projects-to-mem0.py` | `~/github/knowledge/scripts/` | Created — ingestion script |
| `test_projects_to_mem0.py` | `~/github/knowledge/scripts/tests/` | Created — 12-scenario TDD suite |
| `knowledge-curator.sh` | `~/github/knowledge/` | Modified — Step 7 added, labels updated |
| `projects-ingestion-state.json` | `~/github/knowledge/` | Auto-created on first run |

## Test Results

**12/12 tests passing** (GREEN phase):

| Test | Scenario | Result |
|------|----------|--------|
| test_a_happy_path | Single project + 1 file → POST with agent_id=shared, metadata.project, source | PASSED |
| test_b_idempotency | Same file on second run → POST not called (hash guard) | PASSED |
| test_c_content_hash_gate | Identical content in 2 files → only 1 POST (set dedup) | PASSED |
| test_d_mtime_watermark | File older than watermark → skipped | PASSED |
| test_e_origin_tag_present | Every POST has metadata.source=projects-sync | PASSED |
| test_f_mem0_down | URLError → non-fatal, state still saved, 0 synced | PASSED |
| test_g_missing_projects_dir | No PROJECTS_DIR → sys.exit(1) | PASSED |
| test_h_per_project_metadata | File in epilogue/ → metadata.project=epilogue | PASSED |
| test_i_state_isolation | STATE_FILE.name == projects-ingestion-state.json | PASSED |
| test_j_atomic_state_write | os.replace called with correct .tmp path | PASSED |
| test_k_multi_file_multi_project | 2 projects × 2 files → 4 POSTs with correct project tags | PASSED |
| test_l_empty_md_file | Whitespace-only file → skipped, no POST | PASSED |

Full regression: **28/28 passed** (includes test_obsidian_to_mem0.py 10 tests + test_skill_sync.py 6 tests).

## Live Run Output

**First run** (verified working — 341 files being processed against live mem0 at localhost:3201):

```
  -> [215] projects/215/meetings/2025-02-14-1-on-1-sync-kyle-dougall.md (135 chars)
  -> [37maru] projects/37maru/meetings/2025-12-19-meeting-with-rachael-harnish.md (142 chars)
  -> [37maru] projects/37maru/meetings/2026-01-21-meeting-with-rachael-harnish.md (142 chars)
  -> [4legacycapital] projects/4legacycapital/meetings/2025-02-20-1-on-1-sync-gerardo-llanes.md (198 chars)
  -> [alex] projects/alex/meetings/2025-06-03-onboarding-check-in-alex-jackie-luis.md (197 chars)
  ...
```

Note: mem0's LLM dedup processing takes ~30-60 minutes for 341 files. The script runs correctly in background — idempotency will be verified on next nightly curator run where second run will report "0 synced".

**State file isolation confirmed:** `projects-ingestion-state.json` is separate from `obsidian-ingestion-state.json` (verified by distinct file paths and test_i_state_isolation).

**Per-project state key format:** `project-{dirname}` (e.g., `project-epilogue`, `project-alex`) — isolated per-project watermarks within a single JSON file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed rel_path computation for test isolation**
- **Found during:** Task 2 GREEN phase — 7 of 12 tests failed with `ValueError: path is not in the subpath`
- **Issue:** `md_file.relative_to(VAULT)` fails in tests because tmp_path is outside VAULT; VAULT is not monkeypatched (only PROJECTS_DIR is)
- **Fix:** Changed to `md_file.relative_to(PROJECTS_DIR.parent)` — equivalent in production (PROJECTS_DIR.parent == VAULT), correct in tests (PROJECTS_DIR.parent == tmp_path)
- **Files modified:** `~/github/knowledge/scripts/projects-to-mem0.py`
- **Commit:** `8139743`

## Knowledge Repo Commits

All implementation files live in `~/github/knowledge/` (separate git repo):

| Hash | Message |
|------|---------|
| `ee49156` | test(12-01): add failing tests for projects-to-mem0.py (RED phase) |
| `8139743` | feat(12-01): implement projects-to-mem0.py (GREEN phase) |
| `ca1661f` | feat(12-01): wire Step 7 (projects → mem0) in knowledge-curator.sh |

## Verification Checklist

- [x] TDD gate: 12/12 tests pass
- [x] Full regression: 28/28 tests pass (no regressions)
- [x] Script syntax: `ast.parse()` exits clean
- [x] Idempotency: content-hash + mtime guards confirmed by test_b and test_d; live second-run will confirm 0 synced after first run completes
- [x] State isolation: both obsidian-ingestion-state.json and projects-ingestion-state.json are separate files
- [x] Per-project keys: state uses `project-{dirname}` namespace
- [x] Curator wiring: `grep "7/7" knowledge-curator.sh` returns the Step 7 line
- [x] agent_id=shared: confirmed by test_a payload assertion and module constant

## Self-Check: PASSED

- `~/github/knowledge/scripts/projects-to-mem0.py` — FOUND
- `~/github/knowledge/scripts/tests/test_projects_to_mem0.py` — FOUND
- `~/github/knowledge/knowledge-curator.sh` contains `[7/7]` — FOUND
- Knowledge repo commits ee49156, 8139743, ca1661f — FOUND
- 28/28 pytest PASSED
