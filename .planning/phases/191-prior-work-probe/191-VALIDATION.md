## Validation Report phase-191

### Commands and validation

- `MEMROOS_VAULT_ROOT=/private/tmp/memroos-phase191-vault npm test -- --run` — exit 0; 439 test files passed, 1 skipped; 3,739 passed and 33 skipped (TypeScript/Vitest).
- Plain `npm test -- --run` — exit 1 in the restricted environment because baseline db-ingest tests attempted writes under `/Users/lcalderon/.memroos/vault` (`EPERM`). The same full suite passed with the task-scoped temporary vault above; no feature failures were observed.
- `cd services/knowledge-mcp && python -m pytest tests/ -q` — exit 127 because `python` is not installed. The equivalent Python 3.14 runner passed 110/110 tests (exit 0), including the new MCP wrapper tests.
- `npm run typecheck` — exit 0 after clearing the stale incremental-cache path by running the non-incremental check once.
- Scoped ESLint over changed TypeScript — exit 0, no errors; two existing warnings remain in `belief-promotion-eval.ts`.
- `npm run check:lib-boundary` — exit 0; 53 root-level domain files, baseline 53.
- `npm run check:route-auth-boundary` — exit 0; route checker passed and its 61 Vitest tests passed.
- `git diff --check` — exit 0.
- Stale-import assertion with `rg` — exit 0; no importer of either deleted module remains.
- GitNexus unstaged change detection — medium risk summary: 23 changed symbols, 19 indexed files, 5 affected processes. No commit was created.
- Worker lane: MiniMax-M3 was unavailable in this session; the bounded mechanical importer repoint ran in the `gpt-5.6-luna` fallback lane, then received director review and verification.

### Consolidation

The richer `gsd/proactive-recollection.ts` semantics won the trigger-policy seam: `source_changed`, `operator_reask`, `rediscovered_fact_risk`, `final_answer_citation_gap`, and the EFFTEL-04 rediscovery guard are present in `apps/memroos/src/lib/memory/recollection/`. The legacy kernel's deterministic query policy, ranking behavior, context-pack behavior, and `BeliefStage` contract were carried over.

The canonical module is split into `types.ts`, `policy.ts`, `queries.ts`, `ranking.ts`, and `context-pack.ts`, exported by `index.ts`. Importers were repointed with call-graph-aware impact review and reviewed mechanically afterward. Both losing files were deleted: yes.

`BeliefStage` remains re-exported through `apps/memroos/src/lib/belief/types.ts`, preserving the stable consumer path.

### Digest-pack shape

Redacted real-test shape:

```json
{
  "title": "Onboarding limiter decision",
  "one_liner": "Bounded vector recollection matched the requested topic.",
  "belief_stage": "gold_operational_truth",
  "age": 8,
  "salience": 1,
  "fetch_ref": "memory://prior-work/vector%3Amemory-001"
}
```

The route test asserts at most five items, the exact pointer-only item keys, and that a sentinel raw memory body is absent from the response. `fetch_ref` is the only body lookup pointer; no `content`, `text`, or raw payload is returned.

### Telemetry proof

The served-probe test and skipped-probe test each assert exactly one `recordMemoryTrace()` call. The observability tests additionally persist one `retrieval_trace` event for each case and verify the full pointer-only recollection receipt, including tier statuses and typed reason data. Candidate content is written as an empty string in the receipt path.

### Diff stats and scope

- Tracked implementation diff: 439 insertions and 1,091 deletions across 21 tracked files.
- New phase route/kernel/test files: 1,777 lines across 8 untracked files.
- Unrelated files: no. The only planning change is the required impact-audit evidence in `191-01-PLAN.md`; `.phase191-report.md` is the requested report.
- Commits: none.

### Checklist

- PRIORWORK-01 — met: one canonical recollection module, richer vocabulary and guard retained, importers repointed, both old modules deleted.
- PRIORWORK-02 — met: authenticated bounded probe, tier ranking/threshold pipeline, pointer-only digest, typed skips, and fail-open degradation receipts.
- PRIORWORK-03 — met: `memory_prior_work` is in Python `CORE_TOOLS`, has the deliberate task-boundary contract in its description, and has service tests.
- PRIORWORK-04 — met: served, skipped, and all-tier-failed probes emit one `retrieval_trace` receipt through `recordMemoryTrace()`.
- PRIORWORK-05 — met: `/api/agent-context` supports topic-only recall and the MCP `agent_context_packet` wrapper exposes it without curl.

### Escalations

- The three external search tiers are not live in this environment; route tests use fakes for episodic, vector, and graph responses, including a dead-tier degradation case. Live provider proof and NOC movement remain unverified.
- GitNexus local analysis reached the current commit but could not update its global registry because of restricted-environment `EPERM`; the unstaged detector still produced the medium-risk summary above. A compare-to-main result was noisy because the branch/index baseline contains unrelated prior work.
- No semantic conflict or MCP service contract change beyond adding the two tools was found.
