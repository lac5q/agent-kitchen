---
phase: 14-skill-failure-rate
plan: "01"
subsystem: knowledge-python
tags: [skill-sync, failures-parser, tdd, skill-06, observability]
dependency_graph:
  requires: []
  provides: [failures_parser.parse_failures_log, failures_parser.aggregate_failures, skill-sync._classify_error, skill-sync._emit_failed_event]
  affects: [skill-contributions.jsonl, failures.log]
tech_stack:
  added: [failures_parser.py]
  patterns: [raw_decode-loop, jsonl-append, exception-classification]
key_files:
  created:
    - ~/github/knowledge/scripts/failures_parser.py
    - ~/github/knowledge/scripts/tests/test_failures_parser.py
  modified:
    - ~/github/knowledge/scripts/skill-sync.py
    - ~/github/knowledge/scripts/tests/test_skill_sync.py
decisions:
  - "disk_critical exclusion is strict lowercase match only — variant spellings (DISK_CRITICAL, Disk_Critical) remain visible in aggregates per STATE.md"
  - "OSError(errno.EPERM) promotes to PermissionError in Python 3 — _classify_error returns permission_denied for both"
  - "_emit_failed_event writes only classified error_type to JSONL, never raw exception message (T-14-02 mitigation)"
metrics:
  duration: ~20min
  completed: "2026-04-13"
  tasks_completed: 2
  files_changed: 4
---

# Phase 14 Plan 01: Skill Failure Rate Data Layer Summary

Stateful multi-line JSON parser for failures.log plus failed event emission in skill-sync.py — establishing the SKILL-06 data path before Plan 14-02 wires API + UI.

## What Was Built

### failures_parser.py

**Path:** `~/github/knowledge/scripts/failures_parser.py`

**Exported functions:**

| Function | Signature | Purpose |
|----------|-----------|---------|
| `parse_failures_log` | `(path: str) -> list[dict]` | Read failures.log, return list of decoded entry dicts |
| `aggregate_failures` | `(entries: list[dict]) -> dict` | Count entries by agent_id and error_type, excluding disk_critical |

**Key implementation detail:** Uses `json.JSONDecoder().raw_decode()` in a loop over the full file content. This natively handles single-line compact JSON and multi-line pretty-printed JSON objects without any brace-counting or line-splitting. A naive `splitlines()` + `json.loads()` approach would break on multi-line traceback entries.

**Output shape consumed by Plan 14-02:**
```python
{
  "failuresByAgent": {"hermes": 12, "gwen": 3},
  "failuresByErrorType": {"permission_denied": 8, "timeout": 7}
}
```

### skill-sync.py instrumentation

**Path:** `~/github/knowledge/scripts/skill-sync.py`

#### `_classify_error(exc: Exception) -> str`

| Exception type | `error_type` returned |
|---------------|----------------------|
| `PermissionError` | `"permission_denied"` |
| `FileNotFoundError` | `"file_not_found"` |
| `OSError` with `errno.ENOSPC` | `"disk_full"` |
| `TimeoutError` | `"timeout"` |
| everything else | `"unknown"` |
| emergency/abort paths | `"disk_critical"` (caller skips JSONL) |

Note: Python 3 auto-promotes `OSError(errno.EPERM)` to `PermissionError`, so it maps to `"permission_denied"`.

#### `_emit_failed_event(agent_id, error_type, skill=None)`

- If `error_type == "disk_critical"`: returns early — event is written to failures.log only, NOT to skill-contributions.jsonl (keeps the contributions feed clean; Plan 14-02 filters disk_critical downstream anyway).
- Writes only: `timestamp`, `agent_id`, `event="failed"`, `error_type` (classified enum), `skill` (may be None). No raw traceback or exception message (T-14-02 mitigation).
- Appends with `open(mode="a")` + `json.dumps(...) + "\n"` — same pattern as existing `append_jsonl_event`.

## disk_critical Dual-Layer Exclusion

Per SKILL-06 / STATE.md, `disk_critical` is filtered at BOTH layers:

1. **Emit layer (skill-sync.py):** `_emit_failed_event` returns early when `error_type == "disk_critical"` — nothing written to JSONL.
2. **Aggregate layer (failures_parser.py):** `aggregate_failures` skips entries where `error_type == "disk_critical"` (strict lowercase) before counting.

## Test Coverage

| File | Tests | All Pass |
|------|-------|----------|
| `test_failures_parser.py` | 9 | Yes |
| `test_skill_sync.py` | 16 (6 existing + 10 new) | Yes |
| **Total** | **25** | **Yes** |

## Knowledge Repo Commits

All implementation lives in `~/github/knowledge/` (separate git repo):

| Commit | Message |
|--------|---------|
| `3db2012` | test(14-01): add failing tests for failures_parser.py (RED) |
| `d3f9945` | feat(14-01): implement failures_parser.py with multi-line JSON support (GREEN) |
| `8ea8e73` | test(14-01): add failing tests for skill-sync.py failed event emission (RED) |
| `8b2b2f3` | feat(14-01): instrument skill-sync.py with failed event emission (GREEN) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] test_classify_error_mapping expected wrong value for OSError(EPERM)**
- **Found during:** Task 2 GREEN phase
- **Issue:** Test asserted `OSError(errno.EPERM, ...)` → `"unknown"`, but Python 3 auto-promotes `OSError(EPERM)` to `PermissionError` at construction time, so `isinstance(exc, PermissionError)` is `True`.
- **Fix:** Corrected test assertion to `"permission_denied"` and added a `ValueError` case to cover the true `"unknown"` branch.
- **Files modified:** `scripts/tests/test_skill_sync.py`
- **Commit:** `8b2b2f3`

## Known Stubs

None — all exported functions are fully implemented and wired.

## Threat Flags

No new network endpoints, auth paths, or schema changes introduced. The two mitigations from the plan's threat register were applied:

| Threat | Mitigation Applied |
|--------|--------------------|
| T-14-01 (Tampering — parser) | `raw_decode` with per-object try/except; poisoned entries are skipped, not propagated |
| T-14-02 (Info Disclosure — JSONL) | `_emit_failed_event` writes only classified enum strings, never raw exception args or tracebacks |

## Self-Check: PASSED

- `/Users/lcalderon/github/knowledge/scripts/failures_parser.py` — FOUND
- `/Users/lcalderon/github/knowledge/scripts/tests/test_failures_parser.py` — FOUND
- `/Users/lcalderon/github/knowledge/scripts/tests/test_skill_sync.py` (modified) — FOUND
- Knowledge repo commit `8b2b2f3` — FOUND (verified via git log)
- All 25 pytest tests pass
