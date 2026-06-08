# Phase 112-01 Summary: Dead Export and Dead File Cleanup

## Status

Complete.

## Changes

- Removed the unused `generateRefreshToken` export from `apps/memroos/src/lib/auth/jwt.ts`.
- Removed the unused `AuthUser` interface from `apps/memroos/src/lib/auth/types.ts`.
- De-exported local-only security/audit types that are still used inside their modules:
  - `MemoryUseDecision`
  - `ClassificationReviewStatus`
  - `PromotionMetadata`
  - `SandboxToolCallResult`
- Removed unused wrapper exports from SEAL helper modules:
  - `applyProposal`
  - `reflectOnTrace`
  - `buildProposalDraftsForRun`
  - `listEvalJobs` re-export from `behavioral-runner.ts`
- Preserved NetSuite, Salesforce, and Zendesk L3 adapters and marked each with `INTENTIONAL_STUB`.
- Deleted confirmed orphan files:
  - `apps/memroos/src/components/flow/demo-mode.tsx`
  - `apps/memroos/src/components/flow/flow-canvas.tsx`
  - `apps/memroos/src/components/flow/flow-edge.tsx`
  - `apps/memroos/src/components/flow/flow-node.tsx`
  - `apps/memroos/src/components/layout/health-dot.tsx`
  - `apps/memroos/src/components/ui/tabs.tsx`
  - `apps/memroos/src/components/voice/useVoiceTranscript.ts`
  - `apps/memroos/scripts/generate-demo-video.mjs`
- Added vulture whitelist artifacts:
  - `services/knowledge-mcp/vulture_whitelist.py`
  - `services/memory/vulture_whitelist.py`
- Applied Python cleanup in `services/knowledge-mcp` and `services/memory`:
  - Removed unused imports.
  - Converted bare `except` blocks to `except Exception`.
  - Added narrow `noqa: E402` annotations for intentional runtime import bootstraps.

## Verification

- `npm run typecheck` passed.
- `npm --prefix apps/memroos test -- src/lib/seal src/lib/auth src/components/flow src/components/voice src/components/engagement` passed: 16 files, 115 tests.
- `python3 -m ruff check services/knowledge-mcp services/memory --fix` passed.
- `python3 -m vulture services/knowledge-mcp services/memory services/knowledge-mcp/vulture_whitelist.py services/memory/vulture_whitelist.py --min-confidence 80` passed.
- `.venv/bin/python -m compileall services/knowledge-mcp/knowledge_system services/memory/*.py services/memory/tests/test_mem0_queue.py` passed.
- `git diff --check` passed.

## Notes

- Python pytest was not run because both the system Python and repo `.venv` are missing `pytest`, and the service requirements files do not currently declare it.
- The Phase 112 plan referenced `apps/memroos/src/scripts/generate-demo-video.mjs`; the actual confirmed-dead file was `apps/memroos/scripts/generate-demo-video.mjs`.
- The broader memory route suite still has known Phase 113 failures, including the pre-existing `edit_hash` schema error.
