## Validation Report phase-188

Scope: STORE-04 audit/memory migration and LIBNORM-02 family consolidation in the current linked worktree. No commit or push was made.

### Commands run

- Baseline `npm run check:sqlite-allowlist` — exit 0; 116 direct importers, baseline 116; fixture subtests 4/4.
- Baseline `npm run check:lib-boundary` — exit 0; 75 root-level domain files, baseline 75; fixture subtests 3/3.
- Final `npm run check:sqlite-allowlist` — exit 0; 113 direct importers, baseline 113; fixture subtests 4/4.
- Final `npm run check:lib-boundary` — exit 0; 53 root-level domain files, baseline 53; fixture subtests 3/3.
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0; 0 errors and 95 warnings.
- `git diff --check` — exit 0.
- Focused STORE-04 suites — exit 0; 104/104 tests passed.
- Focused agent-context/GSD suites — exit 0; 12/12 tests passed.
- Full `npm test -- --run` — exit 1; 437/439 test files completed (1 failed, 1 skipped), 3,723/3,766 tests passed (33 skipped, 10 failed). All ten failures were `db-ingest.test.ts` environment failures attempting `EPERM` writes under `/Users/lcalderon/.memroos/vault/` and scanning inaccessible session roots. No import-path or behavior regression was implicated, and no test expectation was changed.
- GitNexus `detect_changes({scope: "all", repo: "/Users/lcalderon/github/memroos", worktree: "<this worktree>"})` — risk `low`; 10 indexed changed symbols, 0 affected processes, 173 changed files. The index is stale relative to this worktree, so the result is supplementary to the real test/gate checks.

### STORE-04

| Table/domain | New owner | Callers migrated |
| --- | --- | --- |
| `audit_log` | `apps/memroos/src/lib/store/audit.ts` | Audit-log, NOC, and security-report reads; production audit writers in A2A, classification, ChatGPT actions, dispatch, memory add/consolidate, telemetry, recall ingest, hive, agent-context messaging, belief promotion, and policy-gate paths. |
| `memory_eval_runs`, `memory_eval_cases`, `memory_eval_results` | `apps/memroos/src/lib/store/memory.ts` | `lib/memory/recall-evals.ts` schema creation, run persistence, and latest-run reads. |
| `agent_memory_traces` | `apps/memroos/src/lib/store/memory.ts` | `lib/memory/trace-observability.ts` writes/reads and agent context-packet trace reads. |
| `agent_memory_candidates` | `apps/memroos/src/lib/store/memory.ts` | Agent context-packet candidate reads. |

All low-level store writes require `GovernanceContext`; reads do not. `store/__tests__/audit.test.ts` includes a `@ts-expect-error` assertion proving that `writeAuditLog(db, entry)` without governance does not typecheck, plus runtime governance validation. The root `lib/audit.ts` remains a no-SQL compatibility facade for legacy two-argument tests/callers; its adapter derives the required context before invoking the store writer.

The SQLite allowlist moved from 116 to 113 direct importers: three table-owning production importers were removed. Renamed agent modules were repathed in the allowlist without inflating the count.

Callers deliberately left behind:

- `memory/recall-evals.ts` still writes the shared `messages` fixture table for episodic evaluation setup. `messages` is shared core storage, not memory-evaluation-owned storage; moving it would expand into STORE-02/schema work or change fixture behavior.
- `db-schema.ts` migration/DDL access remains by design; STORE-02 is explicitly out of scope.
- Other direct SQLite callers and unrelated memory tables remain; this slice was limited to audit and memory evaluation/trace tables, not all 116 importers.

### LIBNORM-02

Both families were moved with manual actual-import-graph updates. GitNexus `rename` was attempted for the file moves but its calls were canceled/unavailable in this session; no find-and-replace migration was used. GitNexus query/context/impact analysis guided the affected-symbol review.

Memory family — 11 files:

- `lib/memory-consolidation.ts` → `lib/memory/consolidation-scheduler.ts`
- `lib/memory-decay.ts` → `lib/memory/decay.ts`
- `lib/memory-doctor.ts` → `lib/memory/doctor.ts`
- `lib/memory-graph-catchup-scheduler.ts` → `lib/memory/graph-catchup-scheduler.ts`
- `lib/memory-inventory.ts` → `lib/memory/inventory.ts`
- `lib/memory-policy-lab.ts` → `lib/memory/policy-lab.ts`
- `lib/memory-recall-evals.ts` → `lib/memory/recall-evals.ts`
- `lib/memory-retention-expiry-scheduler.ts` → `lib/memory/retention-expiry-scheduler.ts`
- `lib/memory-trace-observability.ts` → `lib/memory/trace-observability.ts`
- `lib/meeting-qmd-recall.ts` → `lib/memory/meeting-qmd-recall.ts`
- `lib/recollection-policy.ts` → `lib/memory/recollection-policy.ts`

Agent family — 11 files:

- `lib/agent-checkpoints.ts` → `lib/agent/checkpoints.ts`
- `lib/agent-cicd-gates.ts` → `lib/agent/cicd-gates.ts`
- `lib/agent-context-bus.ts` → `lib/agent/context-bus.ts`
- `lib/agent-context-packet.ts` → `lib/agent/context-packet.ts`
- `lib/agent-context-policy.ts` → `lib/agent/context-policy.ts`
- `lib/agent-gsd-control.ts` → `lib/agent/gsd-control.ts`
- `lib/agent-liveness.ts` → `lib/agent/liveness.ts`
- `lib/agent-memory-continuity.ts` → `lib/agent/memory-continuity.ts`
- `lib/agent-onboarding.ts` → `lib/agent/onboarding.ts`
- `lib/agent-registry-seed.ts` → `lib/agent/registry-seed.ts`
- `lib/agent-registry.ts` → `lib/agent/registry.ts`

The canonical `BeliefStage` export remains `lib/memory/recollection-policy.ts`. The 22 root originals are gone, old family import specifiers are gone, 162 importer files were updated, and the lib-boundary baseline is 75 → 53 (22 exceptions removed).

### Diff and scope

- Tracked diff: 196 files changed, 280 insertions, 9,157 deletions. The worktree status also contains the untracked moved files, store modules/tests, and this report before staging.
- Unrelated files: no. Changes are limited to the two requested migrations, their import-graph callers/tests, the two baselines, store tests/modules, and this report.
- No commits, pushes, deployments, secret access, or outbound actions.

### Checklist

- STORE-04: **met for the requested audit and memory-owned evaluation/trace tables** — 4 table groups routed, required governance write contract tested, and allowlist reduced 116 → 113. Shared `messages`, schema migrations, and unrelated callers are explicitly left out of this slice.
- LIBNORM-02: **met** — 22/22 files moved, 162 importer files updated, root-family originals 0, and boundary baseline reduced 75 → 53.

### Escalations

- Full-suite completion is blocked only by the sandbox’s inaccessible `/Users/lcalderon/.memroos` vault/session surface: 10 `db-ingest` failures with `EPERM`/empty inaccessible scans. No behavior-changing workaround was attempted.
- GitNexus’s indexed snapshot is stale and file `rename` calls were unavailable/canceled; manual import-graph moves were used and the final indexed change review was low risk with 0 affected processes.
