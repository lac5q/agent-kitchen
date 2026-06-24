## BM-20260615-1035 option-c-harness-positioning
- Director/Lead: Codex
- Watcher/Reviewer: Codex with GitNexus detect-changes and focused diff review
- Executor: Codex-led manual continuation from prior in-tree edit pass
- Harness: manual
- Acceptance checks: `npm --prefix apps/memroos run test -- src/app/__tests__/landing-research-paper.test.ts`; `npm run typecheck`; `npm run build`; `git diff --check`; `npx gitnexus detect-changes --repo memroos --scope all`; stale-positioning `rg`
- Result: pass
- Token/cost note: no external executor cost; continued after compacted handoff
- What worked: treating the repositioning as an evolution kept the existing proof, dispatch, and governance story while moving the first impression to company-owned memory and harness control
- What failed / drifted: GitNexus MCP output compressed, so the CLI was used to recover the readable scope report
- Routing rule to change: when a Beastmode handoff already contains completed edits, lead should prioritize verification, scope review, and learning capture before making further copy changes
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260619-1040 presidio-storage-ingress
- Director/Lead: Codex
- Watcher/Reviewer: Codex with GitNexus impact checks
- Executor: requested qwen3.7-plus; attempted `~/.local/bin/qwen-agent`, blocked by 401 invalid bearer token; Codex completed low-risk wiring inline
- Harness: manual Beastmode
- Acceptance checks: `python3 -m py_compile services/memory/pii_guard.py services/memory/mem0-server.py services/memory/mcp-mem0.py services/memory/mem0-queue-server.py`; direct Python PII guard assertions; `npm --prefix apps/memroos test -- --run src/lib/privacy/__tests__/pii-storage.test.ts src/app/api/memory/__tests__/add-route.test.ts src/app/api/chatgpt/actions/__tests__/route.test.ts`; `npm --prefix apps/memroos run typecheck`
- Result: pass
- Token/cost note: Qwen executor cost unavailable because auth failed before work began
- What worked: official Presidio guard is lazy-loaded, local-only, and backed by deterministic fallback so memory ingress does not fail open or require paid cloud
- What failed / drifted: qwen-agent local credentials invalid; pytest not installed in system Python or repo `.venv`, so direct assertions were used instead of pytest execution
- Routing rule to change: verify qwen-agent auth before assigning critical-path executor tasks; keep Qwen tasks read-only unless worktree isolation is available
- Skill/config update needed: yes, fix qwen-agent credentials before next Beastmode run requiring Qwen
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260619-1238 route-auth-hardening-slice
- Director/Lead: Codex
- Watcher/Reviewer: GPT high fallback reviewer plus GitNexus impact/API checks
- Executor: qwen3.7-plus read-only review after retry succeeded; Codex implemented guarded route slices inline
- Harness: manual Beastmode
- Acceptance checks: GitNexus `api_impact` and `impact` LOW for edited route handlers; failing direct non-local route tests first; `tmpdir=$(mktemp -d); SQLITE_DB_PATH="$tmpdir/routes.db" npm --prefix apps/memroos test -- --run src/app/api/agent-checkpoints/__tests__/route.test.ts src/app/api/agents/versions/__tests__/route.test.ts src/app/api/agent-memory/traces/__tests__/route.test.ts src/app/api/agent-runtime/observability/__tests__/route.test.ts src/app/api/hive/__tests__/route.test.ts src/app/api/model-routing/__tests__/route.test.ts`; `npm --prefix apps/memroos run typecheck`
- Result: pass
- Token/cost note: Qwen auth failed earlier in the run, but a later retry returned `QWEN OK`; used Qwen only for read-only review because wrapper runs without sandbox.
- What worked: handler-local operator guards are a low-risk way to move ARCHREV-01/09 forward on no-consumer operational routes and mutation-only endpoints without refactoring shared auth or relying on `proxy.ts` as the only security boundary.
- What failed / drifted: some planning docs use wrapped/terse prose, so exact patch contexts were brittle; use raw-line inspection before doc edits.
- Routing rule to change: after Qwen auth failures, retry a tiny `QWEN OK` preflight before abandoning Qwen for the rest of the run; keep Qwen tasks read-only unless isolated worktrees are available.
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260619-1300 runtime-topology-manifest
- Director/Lead: Codex
- Watcher/Reviewer: Qwen3.7-plus read-only scout plus focused test contract
- Executor: Codex implemented bounded ARCHREV-04 manifest slice inline
- Harness: manual Beastmode
- Acceptance checks: failing `node --test scripts/check-runtime-topology.test.mjs` first; `node --test scripts/check-runtime-topology.test.mjs`; `npm run check:runtime-topology`; `npm --prefix apps/memroos test -- --run src/lib/__tests__/runtime-topology.test.ts`; `npm --prefix apps/memroos run typecheck`; `git diff --check`
- Result: pass
- Token/cost note: Qwen was used read-only because wrapper runs without sandbox.
- What worked: a shared JSON manifest plus TS wrapper and standalone Node checker gives scripts and Docker a single source to validate against; `start.sh` can now derive manual-script port defaults while preserving environment overrides.
- What failed / drifted: current topology legitimately differs by supervision mode (`3000` Docker vs `3002` launchd/local), so the manifest must model per-mode ports instead of forcing one global port.
- Routing rule to change: for ARCHREV-04 follow-on, continue deriving one runtime surface at a time from the manifest and keep validation tests proving parity.
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260619-1315 launchd-topology-derivation
- Director/Lead: Codex
- Watcher/Reviewer: Qwen3.7-plus read-only scout plus focused test contract
- Executor: Codex implemented bounded launchd follow-up inline
- Harness: manual Beastmode
- Acceptance checks: failing `node --test scripts/check-runtime-topology.test.mjs` first; `node --test scripts/check-runtime-topology.test.mjs`; `npm run check:runtime-topology`; `npm --prefix apps/memroos test -- --run src/lib/__tests__/runtime-topology.test.ts`; `bash -n scripts/launchd-start.sh`; `npm --prefix apps/memroos run typecheck`; `git diff --check`
- Result: pass
- Token/cost note: Qwen returned a bounded read-only scout report; no Qwen file writes because current wrapper runs without sandbox isolation.
- What worked: validating launchd on the manifest lookup command caught the old hard-coded `PORT="${PORT:-3002}"` default and kept the Node checker and TS wrapper in sync.
- What failed / drifted: markdown planning docs contain compressed/terse prose that made exact `apply_patch` contexts brittle; use line-predicate updates only for planning docs when display compression hides words.
- Routing rule to change: for shell-entrypoint derivation, calculate defaults after runtime env and Node path resolution so launchd's sparse environment does not break the checker call.
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`
