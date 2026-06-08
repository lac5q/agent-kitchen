# Phase 113 Summary: Test Validation and Build Verification

## Status

Complete.

## Changes

- Fixed schema initialization ordering in `apps/memroos/src/lib/db-schema.ts`:
  - `addSkillForgeTraceabilityColumns(db)` now runs immediately after `skillforge_proposals` is guaranteed to exist.
  - `skillforge_proposals_edit_hash` is now created only after `edit_hash` has been added to older databases.
- This resolved the full-suite `SqliteError: no such column: edit_hash` failure that blocked memory, heartbeat, embedding, agent checkpoint, trace, and agent-version tests.

## GitNexus Impact

- `initSchema` impact: CRITICAL.
- Scope: 184 impacted symbols, 41 execution flows, 20 modules.
- Change type: additive migration ordering only. No table shape was removed or renamed.

## Validation

- `npm test` passed:
  - 191 test files
  - 1079 tests
  - 0 failures
  - Note: Vitest emitted one hoisting warning for a nested `vi.mock()` in `src/app/api/recall/__tests__/route.test.ts`; it is non-fatal.
- `npm run build` passed:
  - Next.js 16.2.7 production build compiled successfully.
  - TypeScript completed during build.
  - Static generation completed for 60 pages.
- `npm run typecheck` passed.
- `git diff --check` passed.
- Python validation:
  - `uv run --with pytest --with httpx --with pyyaml --with fastapi --with fastmcp -- python -m pytest services/knowledge-mcp/tests services/memory/tests` passed: 58 tests.
  - `uv run --with pytest --with pytest-asyncio --with httpx --with respx -- python -m pytest packages/sdk-py/tests` with `PYTHONPATH=packages/sdk-py` passed: 8 tests.
  - `uv run --with pytest --with pytest-asyncio --with httpx --with respx --with pyyaml --with fastapi --with fastmcp -- python -m pytest services/voice-server/tests` passed: 36 tests.
- Static/service checks:
  - `python3 -m ruff check services/knowledge-mcp services/memory --fix` passed.
  - `python3 -m vulture services/knowledge-mcp services/memory services/knowledge-mcp/vulture_whitelist.py services/memory/vulture_whitelist.py --min-confidence 80` passed.
  - `npm run eval:knowledge-save-contract` passed.

## Dependency Audit Notes

- `npm audit --audit-level=high` exited 0. Remaining advisories are moderate severity.
- Scoped `pip-audit` still reports the already documented accepted-risk findings:
  - `mem0ai` CVE family in `services/memory/requirements.txt`.
  - `diskcache` CVE-2025-69872 via `services/knowledge-mcp/requirements.txt`.
  - `services/voice-server/requirements.txt` remains blocked by pipecat-ai resolver conflicts.
- These are covered by `.planning/phases/111-dependency-cve-sweep-medium-fixes/111-CVE-ACCEPTED-RISK.md` with compensating controls and remediation tracks.
