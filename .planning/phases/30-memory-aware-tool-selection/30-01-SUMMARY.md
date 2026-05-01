# Phase 30 Plan 01 Summary: Outcome-Aware Tool Selection

## Status

Complete.

## What Shipped

- Added outcome summaries keyed by capability id:
  - uses
  - successes
  - failures
  - last outcome
  - last used timestamp
  - score
- Added `outcomeSummary` to capabilities with recorded outcomes.
- Added outcome-score ranking to `tool_discover`.
- Added `outcomesByTool` to `tool_stats`.
- Verified aggregate stats do not expose raw task text.

## Files Changed

- `services/knowledge-mcp/knowledge_system/tool_attention.py`
- `services/knowledge-mcp/tests/test_knowledge_system.py`

## Verification

`PYTHONPATH=services/knowledge-mcp "$HOME/github/knowledge/.venv/bin/python" -m pytest services/knowledge-mcp/tests/test_knowledge_system.py`

Result: 11 passed.

## Next

Phase 30 Plan 02: add similar-task memory recommendations using safe metadata/context packs.
