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

## BM-20260627-0615 gsd-roadmap-qwen-claude-validator
- Director/Lead: Codex
- Watcher/Reviewer: Claude `-p` validator plus GitNexus detect-changes
- Executor: Qwen3.7-plus via `~/.local/bin/qwen-agent` for smoke and read-only roadmap audit; Codex added the Phase 117 plan from reviewed worker output
- Harness: manual Beastmode
- Acceptance checks: Qwen smoke `QWEN OK`; Claude smoke `CLAUDE OK`; targeted Vitest tracked group 58/58 passed; targeted Vitest untracked group 22/22 passed; `npm run typecheck`; `npm run lint` exited 0 with pre-existing warnings; `npm run build`; `git diff --check`; Claude validator found no Phase 117 plan blockers
- Result: pass
- Token/cost note: Qwen audit completed, but Qwen plan drafting stayed silent until interrupted and then emitted usable output; prefer saved-output runs for future long Qwen tasks
- What worked: verifying the broad dirty tree before new implementation avoided mixing failing assumptions into the roadmap; Phase 117 now has an actionable plan artifact before code touches the NOC telemetry surface
- What failed / drifted: Qwen can be non-streaming for more than 90 seconds even on planning tasks, so interactive waits are a poor fit without a run log
- Routing rule to change: for Qwen planner/executor tasks, write prompts and outputs under `.codex/qwen-runs/` and monitor the file instead of relying on live stdout
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260627-0630 phase117-efficiency-event-foundation
- Director/Lead: Codex
- Watcher/Reviewer: Claude `-p` validator plus GitNexus impact/detect-changes
- Executor: Qwen3.7-plus was delegated a bounded patch proposal under `.codex/qwen-runs/20260627T131737Z-phase117-slice1`, but produced an empty output file; Codex implemented the reviewed slice inline
- Harness: manual Beastmode
- Acceptance checks: GitNexus `impact(initSchema)` CRITICAL acknowledged; `npm --prefix apps/memroos run test -- src/lib/__tests__/efficiency-telemetry.test.ts src/lib/__tests__/db.test.ts` 17/17 passed; touched test group 80/80 passed; `npm run typecheck`; `npm run build`; `npm run lint` exited 0 with pre-existing warnings; `git diff --check`; Claude validator found and then cleared timestamp-ordering issue
- Result: pass
- Token/cost note: Qwen worker did not return useful patch output for this code slice; Claude validator provided useful review value by catching timestamp precision drift
- What worked: keeping Phase 117 slice 1 limited to the event table, typed writer/query helper, and focused tests made the central schema migration reviewable despite CRITICAL initSchema blast radius
- What failed / drifted: Qwen can exit with an empty output file even for saved-output runs, so runner monitoring must check output size before assuming a worker result exists
- Routing rule to change: after Qwen returns empty output, immediately continue with Codex implementation plus validator review instead of retrying the same prompt without changing the harness or output contract
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260627-0655 phase117-retrieval-trace-emitter
- Director/Lead: Codex
- Watcher/Reviewer: Claude `-p` validator plus GitNexus impact/API checks
- Executor: Qwen3.7-plus was delegated a bounded read-only patch proposal under `.codex/qwen-runs/20260627T132455Z-phase117-retrieval-trace`, but returned an empty output file again; Codex implemented the slice inline
- Harness: manual Beastmode
- Acceptance checks: GitNexus `impact(recordMemoryTrace)` LOW; GitNexus API impact for `apps/memroos/src/app/api/agent-memory/traces/route.ts` LOW; focused Vitest group 19/19 passed; expanded touched group 99/99 passed; `npm run typecheck`; `npm run build`; `npm run lint` exited 0 with pre-existing warnings; `git diff --check`; Claude validator found and then cleared agent id, timestamp, and read-model issues
- Result: pass
- Token/cost note: Qwen produced no usable patch output, so token value is unknown; Claude validator added concrete review value by catching integration drift before closeout
- What worked: routing the runtime emitter through `recordMemoryTrace` kept the first Phase 117 live event tied to the existing trace seam while preserving testable trace/event timestamp parity
- What failed / drifted: Qwen saved-output runs can still complete with empty output on small implementation tasks, so the executor lane is not yet reliable enough for patch ownership
- Routing rule to change: keep Qwen as read-only scout for now, require non-empty output before considering executor work accepted, and use Claude `-p` as the blocking validator for implementation slices
- Skill/config update needed: yes, improve the Qwen harness/output contract before assigning more Phase 117 implementation ownership
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260627-0735 phase117-source-read-emitter
- Director/Lead: Codex
- Watcher/Reviewer: Claude `-p` validator plus GitNexus impact/API checks
- Executor: Qwen3.7-plus produced a bounded read-only patch plan under `.codex/qwen-runs/20260627-phase117-source-read.txt`; Codex implemented after adapting the plan to keep raw source content out of JSONL/SQLite metadata
- Harness: manual Beastmode
- Acceptance checks: Qwen smoke `QWEN OK`; GitNexus `impact(recordToolOutcome)` LOW; GitNexus API impact for `apps/memroos/src/app/api/tool-attention/record/route.ts` LOW; focused route test 4/4 passed; related group 26/26 passed; expanded touched group 106/106 passed; `npm run typecheck`; `npm run build`; `npm run lint` exited 0 with pre-existing warnings; `git diff --check`
- Result: pass
- Token/cost note: Qwen was useful as a read-only scout this time and highlighted the raw-content storage risk; Claude validator was used as the blocking review gate
- What worked: emitting `source_read` from authenticated tool-outcome recording creates a real per-task event stream without inventing NOC values, and stripping raw source content before persistence keeps the event contract hash-only
- What failed / drifted: Qwen proposed route-local emission and fallback from `body.task`; Codex kept emission in `recordToolOutcome` and required explicit `taskId` to avoid treating prose task labels as ids
- Routing rule to change: keep Qwen prompts explicitly asking for privacy/metadata risks on telemetry slices, then adapt implementation through repo-native seams rather than copying route-local snippets
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260627-0745 phase117-token-ledger-emitter
- Director/Lead: Codex
- Watcher/Reviewer: Claude `-p` validator plus GitNexus impact/API checks
- Executor: Qwen3.7-plus produced a bounded read-only patch plan under `.codex/qwen-runs/20260627-phase117-token-ledger.txt`; Codex implemented after keeping raw-context tokens explicit instead of assuming all input tokens are raw context
- Harness: manual Beastmode
- Acceptance checks: Qwen smoke `QWEN OK`; GitNexus `impact(recordModelRoutingEvent)` LOW; GitNexus API impact for `apps/memroos/src/app/api/model-routing/telemetry/route.ts` LOW; focused model-routing route suite 5/5 passed; related group 31/31 passed; expanded touched group 111/111 passed; `npm run typecheck`; `npm run build`; `npm run lint` exited 0 with pre-existing warnings; `git diff --check`; Claude validator found no blockers
- Result: pass
- Token/cost note: Qwen provided useful seam and risk review; Claude confirmed explicit-zero detection, total-token fallback, and no-fake-ledger behavior
- What worked: adding the side effect in `recordModelRoutingEvent` kept the token ledger attached to the existing model-routing telemetry seam without changing the route response shape
- What failed / drifted: Qwen proposed treating `inputTokens` as `rawContextTokens`; Codex kept `rawContextTokens` as an explicit posted field so the NOC raw-context share is not overstated by ordinary prompt tokens
- Routing rule to change: for efficiency telemetry slices, require Qwen to distinguish available fields from inferred metrics and let Codex choose the stricter event contract when a metric could otherwise overclaim
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260627-0652 phase117-operator-question-emitter
- Director/Lead: Codex
- Watcher/Reviewer: Claude `-p` validator plus GitNexus impact/API checks
- Executor: Qwen3.7-plus produced a bounded read-only proposal under `.codex/qwen-runs/20260627-phase117-operator-question.txt`; Codex implemented the slice with request-local repeat matching instead of persisted telemetry-history matching
- Harness: manual Beastmode
- Acceptance checks: Qwen smoke `QWEN OK`; GitNexus `impact(POST)` LOW; GitNexus API impact for `/api/chat` LOW; failing focused chat route test first; focused chat route suite 15/15 passed; related telemetry group 31/31 passed; full app Vitest suite 1192/1192 passed; `npm --prefix apps/memroos run typecheck`; `npm --prefix apps/memroos run build`; `npm --prefix apps/memroos run lint` exited 0 with pre-existing warnings; `git diff --check`; Claude validator found no blockers
- Result: pass
- Token/cost note: Qwen returned useful but late read-only output; Claude remains the blocking validator for this implementation slice
- What worked: emitting from the operator chat ingress captures questions even when provider runtime falls back, while the side effect stays guarded and does not alter the SSE response shape
- What failed / drifted: Qwen proposed matching against prior persisted `operator_question` rows; Codex kept deterministic matching scoped to submitted chat history to avoid extra telemetry-history reads and overclaiming semantic redundancy
- Routing rule to change: for operator-facing telemetry, make Qwen explicitly separate request-local evidence from historical/semantic evidence before proposing match logic
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260627-0702 phase117-memory-write-emitter
- Director/Lead: Codex
- Watcher/Reviewer: Claude `-p` validator plus GitNexus impact/API checks
- Executor: Qwen3.7-plus produced a bounded read-only proposal under `.codex/qwen-runs/20260627-phase117-memory-write.txt`; Codex implemented after keeping rediscovery tenant-stream scoped instead of per-agent only
- Harness: manual Beastmode
- Acceptance checks: Qwen smoke `QWEN OK`; GitNexus `impact(recordMemoryWrite)` HIGH acknowledged; GitNexus API impact for `/api/memory/add` LOW; failing focused tests first; focused registry and memory-add route suites 15/15 passed; direct caller/telemetry group 56/56 passed; full app Vitest suite 1195/1195 passed; `npm --prefix apps/memroos run typecheck`; `npm --prefix apps/memroos run build`; `npm --prefix apps/memroos run lint` exited 0 with pre-existing warnings; `git diff --check`; Claude validator found no blockers
- Result: pass
- Token/cost note: Qwen was useful as a scout for seam and risk framing; Claude confirmed no raw-content payload leakage and suggested documenting cross-agent rediscovery with a test
- What worked: emitting from `recordMemoryWrite` covered `/api/memory/add`, agent-context memory receipts, and ChatGPT save actions without changing route response shapes or duplicating emitter logic
- What failed / drifted: Qwen proposed rediscovery from `agent_memory_writes` per agent; Codex kept the Phase 117 metric tied to same-tenant efficiency events so cross-agent rediscovered facts count toward NOC redundancy
- Routing rule to change: for shared-helper telemetry, require Qwen to state whether the metric should be per-agent, per-task, or tenant-wide before proposing storage queries
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260627-0711 phase117-noc-read-model
- Director/Lead: Codex
- Watcher/Reviewer: GitNexus impact/API checks plus Qwen3.7-plus read-only scout; Claude `-p` validator attempted but unavailable due session limit after an initial hung review prompt
- Executor: Qwen produced a useful read-model proposal under `.codex/qwen-runs/20260627-phase117-noc-read-model.txt`; Codex implemented the repo-native nested `metrics.efficiency` contract and kept `/api/operations/noc` as the single NOC endpoint
- Harness: manual Beastmode
- Acceptance checks: GitNexus `impact(buildNocResponse)` LOW; GitNexus API impact for `/api/operations/noc` LOW; failing focused tests first; NOC focused suites 11/11 passed; Phase 117/direct NOC group 53/53 passed; full app Vitest suite 1199/1199 passed; `npm --prefix apps/memroos run typecheck`; `npm --prefix apps/memroos run build`; `npm --prefix apps/memroos run lint` exited 0 with pre-existing warnings; `git diff --check`; GitNexus detect-changes still reports CRITICAL because the whole dirty Phase 117 tree is in scope; Claude validator lane unavailable at close due session limit
- Result: pass
- Token/cost note: Qwen was useful as a read-only scout for status semantics and test coverage; Codex kept implementation scoped to the existing NOC response shape to avoid a parallel endpoint
- What worked: computing metrics from the append-only event stream made live/degraded/empty UI states deterministic, and passing Operations filters into `useOperationsNoc` kept the panel aligned with the rest of the NOC surface
- What failed / drifted: Qwen suggested a separate top-level efficiency response shape and SQL JSON aggregation; Codex used in-process payload parsing and nested response fields to match the existing route contract and tests
- Routing rule to change: for NOC read models, ask Qwen for status semantics and edge-case tests, but let Codex choose the response placement that minimizes consumer churn
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260627-0720 phase118-recollection-policy-foundation
- Director/Lead: Codex
- Watcher/Reviewer: GitNexus context checks plus local test/typecheck/build/lint gates; Claude `-p` validator attempted but unavailable due session limit
- Executor: Qwen3.7-plus produced a bounded read-only scout under `.codex/qwen-runs/20260627-phase118-recollection-policy.txt`; Codex implemented the pure policy module and tests inline
- Harness: manual Beastmode
- Acceptance checks: Qwen smoke `QWEN OK`; failing focused test first; focused recollection policy suite 6/6 passed; related recollection/recall/context-source group 28/28 passed; full app Vitest suite 1205/1205 passed; `npm --prefix apps/memroos run typecheck`; `npm --prefix apps/memroos run build`; `npm --prefix apps/memroos run lint` exited 0 with pre-existing warnings; `git diff --check`; GitNexus detect-changes still reports CRITICAL because the whole dirty Phase 117/118 tree is in scope and new Phase 118 files are untracked
- Result: pass
- Token/cost note: Qwen was useful for type/test shape and non-goal confirmation; no Qwen file writes because this slice was small and the worktree already has broad uncommitted changes
- What worked: starting Phase 118 with a pure deterministic policy kept RECOLLECT-01/02/03/07 testable without touching runtime dispatch, trace persistence, or NOC surfaces
- What failed / drifted: the Phase 118 plan frontmatter omitted `RECOLLECT-07` even though requirements include it; Codex corrected the plan while leaving global requirement status unchanged
- Routing rule to change: for Phase 118, keep Qwen on read-only scout passes until runtime seams are isolated, then use Codex/GitNexus for any shared helper or route edits
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260627-0726 phase118-agent-runtime-recollection
- Director/Lead: Codex
- Watcher/Reviewer: GitNexus impact checks plus local test/typecheck/build/lint gates; Claude `-p` validator attempted earlier in Phase 118 but unavailable due session limit
- Executor: Qwen3.7-plus produced a bounded read-only scout under `.codex/qwen-runs/20260627-phase118-agent-runtime-recollection.txt`; Codex implemented the runtime seam after expanding the plan to include `decideRecollection()` receipts, not only candidate-pack assembly
- Harness: manual Beastmode
- Acceptance checks: Qwen smoke `QWEN OK`; GitNexus `impact(buildContextInjection)` LOW; GitNexus `impact(addMemory)` LOW; failing focused memory-client tests first; focused memory-client suite 6/6 passed; related recollection/recall/context-source/runtime group 34/34 passed; full app Vitest suite 1208/1208 passed; `npm run typecheck`; `npm run build`; `npm run lint` exited 0 with pre-existing warnings
- Result: pass
- Token/cost note: Qwen was useful for identifying the return-shape and adapter risks; Codex kept the implementation repo-native by deriving runtime candidates from existing stored memories and returning legacy fields unchanged
- What worked: placing the policy gate inside `buildContextInjection()` created a real runtime recollection receipt without changing current explicit memory search behavior for normal topics
- What failed / drifted: Qwen proposed candidate-only injection and deferred `decideRecollection()` wiring; Codex added decision receipts now so later trace/NOC slices have a typed source event to persist
- Routing rule to change: for Phase 118 runtime seams, ask Qwen to separate "assembly only" from "trigger decision" proposals so Codex can decide whether the slice needs both
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260627-0730 phase118-recollection-receipts
- Director/Lead: Codex
- Watcher/Reviewer: GitNexus impact checks plus local test/typecheck/build/lint gates; Claude `-p` validator still unavailable due session limit
- Executor: Qwen3.7-plus produced a bounded read-only scout under `.codex/qwen-runs/20260627-phase118-recollection-receipts.txt`; Codex implemented flat optional receipt fields on the existing `retrieval_trace` payload for easier NOC aggregation
- Harness: manual Beastmode
- Acceptance checks: Qwen scout completed; GitNexus `impact(recordMemoryTrace)` LOW; failing focused memory-trace tests first; focused memory-trace suite 4/4 passed; related telemetry/runtime/recollection group 21/21 passed; full app Vitest suite 1210/1210 passed; `npm run typecheck`; `npm run build`; `npm run lint` exited 0 with pre-existing warnings
- Result: pass
- Token/cost note: Qwen was useful for privacy and schema-migration framing; Codex kept the receipt on the existing JSON payloads so no DB migration was needed
- What worked: enriching `recordMemoryTrace()` preserved the current append-only trace path and produced NOC-ready recollection decision fields without duplicating raw memory content into efficiency telemetry
- What failed / drifted: GitNexus could not resolve `recordEfficiencyEvent` in the current index even though the helper exists; Codex treated the efficiency payload edit as additive and validated through typecheck and telemetry tests
- Routing rule to change: for trace/telemetry slices, require Qwen to flag raw-content leakage and aggregation shape explicitly before implementation
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260627-0734 phase118-proactive-recall-evals
- Director/Lead: Codex
- Watcher/Reviewer: GitNexus impact checks plus local test/typecheck/build/lint gates; Claude `-p` validator still unavailable due session limit
- Executor: Codex implemented directly; Qwen was not needed for the narrow fixture/scorer update after the prior receipt scout
- Harness: manual Beastmode
- Acceptance checks: GitNexus `impact(scoreMemoryRecallCase)` HIGH acknowledged; GitNexus `impact(loadMemoryRecallEvalCases)` LOW; failing focused eval scorer test first; focused memory-recall eval suite 15/15 passed; recollection/eval focused group 21/21 passed; fixture JSON parsed to 11 cases with 3 Phase 118 scenarios; full app Vitest suite 1211/1211 passed; `npm run typecheck`; `npm run build`; `npm run lint` exited 0 with pre-existing warnings
- Result: pass
- Token/cost note: no executor call was necessary; the change was small but high-blast-radius because the scorer feeds the eval API
- What worked: optional `avoidMemoryIds` / `avoidFacts` keeps existing eval cases unchanged while making noisy-recency fixtures enforceable instead of merely descriptive
- What failed / drifted: the original eval schema had no negative expectation surface, so adding only JSON fixtures would not have tested recency-noise suppression meaningfully
- Routing rule to change: for eval fixture work, check whether the scorer can express the new failure condition before adding cases
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260627-0738 phase118-noc-recollection-read-model
- Director/Lead: Codex
- Watcher/Reviewer: GitNexus impact checks plus local test/typecheck/build/lint gates; Claude `-p` validator still unavailable due session limit
- Executor: Codex implemented directly after the prior receipt slice established the telemetry payload shape
- Harness: manual Beastmode
- Acceptance checks: GitNexus `impact(buildNocResponse)` LOW; GitNexus `impact(EfficiencySignals)` LOW; failing focused NOC route/UI tests first; focused NOC route suite 3/3 passed; focused EfficiencySignals suite 2/2 passed; related operations/NOC group 11/11 passed; full app Vitest suite 1211/1211 passed; `npm run typecheck`; `npm run build`; `npm run lint` exited 0 with pre-existing warnings
- Result: pass
- Token/cost note: no executor call was necessary; this was a read-model/UI slice over the receipt payload from the prior step
- What worked: adding recollection metrics inside `metrics.efficiency` reused the Phase 117 NOC surface and avoided a parallel endpoint while making skipped-search reasons and belief-stage counts operator-visible
- What failed / drifted: older component test mocks lacked the new `recollection` block, so `EfficiencySignals` now normalizes missing recollection metrics to an empty state for backward tolerance
- Routing rule to change: when extending shared API response types, update component fallbacks as well as the happy-path mocks before broader UI test groups
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260627-2330 phase119-completion-audit-repair
- Director/Lead: Codex
- Watcher/Reviewer: Qwen checklist, Claude `-p` repaired-state validator, GitNexus impact/detect-changes, and full local test/build gates
- Executor: Qwen3.7-plus produced the independent Phase 119 audit checklist; Codex repaired stale planning registry entries, a runtime-topology test expectation, and a client/server import boundary leak
- Harness: manual Beastmode
- Acceptance checks: Qwen audit completed; Claude validator passed Phase 119 planning surface before repair and was rerun after full-suite repair; GitNexus `impact(loadMemroosEnv)` reported CRITICAL so Codex avoided env behavior changes; full app Vitest suite 1235/1235 passed; `npm run build --workspace apps/memroos` passed; `npm run typecheck --workspace apps/memroos` passed; `npm run lint --workspace apps/memroos` exited 0 with 32 existing warnings; `npm run check:future-spikes`, `check:route-auth-boundary`, `check:next-trust-boundary`, `check:contracts`, `check:runtime-topology`, and `check:recall-canary` passed; Python knowledge, orchestration, and voice service tests passed under `uv run`; `git diff --check` passed
- Result: pass
- Token/cost note: Qwen was useful for a concise external checklist; Claude was useful for planning-surface validation, but local full-suite gates found blockers the planning validator did not
- What worked: running the full app test/build after the narrower gates caught a stale topology assertion and a client bundle import of server-only `env.ts` before closeout
- What failed / drifted: `api-client.ts` imported `POLL_INTERVALS` through mixed server/client `constants.ts`, pulling `fs` into the client bundle; old roadmap sections also retained false unchecked legacy plan entries
- Routing rule to change: for GSD closeouts, always run full test/build after the planning validator, and treat mixed constants modules as client-boundary risks until imports are proven client-safe
- Skill/config update needed: no
- Promoted to: `.planning/LEARNINGS.md`

## BM-20260803 phase-227 per-user-tool-connections
- Director/Lead: claude-fable-5 (this session)
- Watcher/Reviewer: claude-fable-5 (diff + report review; no second frontier available)
- Executor: openai-codex/gpt-5.6-luna (xhigh), explicit operator lane choice
- Harness: claude-code + codex exec (workspace-write sandbox), single worktree
- Acceptance checks: scoped vitest (53/53), full fast suite 3711 pass/0 fail (baseline 3702/2 — both baseline flakes cleared), typecheck 0 errors, lint 0 errors, detect_changes (critical = migration-runner fan-out, mitigated by idempotent migration + green suite)
- Result: pass
- Token/cost note: ~30k smoke + one long xhigh run (codex CLI does not report per-run tokens in exec tail; unavailable)
- What worked: full design package with pre-made decisions -> zero escalations, zero re-litigating; executor test names mapped 1:1 to contract scenarios
- What failed / drifted: running a baseline test suite concurrently with an active executor in the same tree produced phantom failures (raced half-edited db-schema.ts). Rule: baseline before launch, or in a separate worktree. Executor's sandboxed full-suite run showed 10 env-artifact failures (blocked $HOME writes) — director re-run outside sandbox was the authoritative gate, as designed.
- Routing rule to change: none
- Skill/config update needed: no

## BM-20260803 phase-226 view-as
- Director/Lead: claude-fable-5 | Executor: openai-codex/gpt-5.6-luna (xhigh) | Harness: codex exec, single worktree
- Acceptance: focused 61/61, trust-boundary 98/98, typecheck/lint pass, full fast suite 3722/0 (director-run)
- Result: pass. Zero escalations; proxy read-only gate implemented with correct fail-direction (forged cookie restricts, never grants).
- Routing note: executor runs detect_changes as part of mechanical validation; director reads the reported blast radius instead of re-running the 10k-token call. Same-checker rule as acn-report.
- Ops interleave lesson: mid-run operator escalations (Eric onboarding, main-mac mem0) were handled by the director inline while the executor kept building — worktree isolation made the interleave safe; scoped git adds kept the commits clean.

## BM-20260803 phase-225 agents-surface-ux (+223 residual)
- Director: claude-fable-5 | Executor: gpt-5.6-luna (xhigh) | Result: pass
- Acceptance: scoped 75/75, full suite 3725/0 (director), typecheck/lint pass, detect_changes LOW (0 affected processes)
- 14-file grid audit landed with per-file disposition table; 223 crit-2 (claim) + crit-4 (team->agents link) closed
- Honest-gap handling worked: executor reported playwright "not runnable here" instead of faking; director installed chromium and established the spec is an operator-run asset per existing e2e convention (no seeded env in CI)
