## Validation Report phase-193

### Commands + exit codes

- `MEMROOS_VAULT_ROOT=$(mktemp -d) npm test -- --run` — exit 0; **3,760 passed / 3,793 total**, 33 skipped; 443 test files passed, 1 skipped.
- `MEMROOS_VAULT_ROOT=$(mktemp -d) npm run test:slow -- --run` — exit 0; 33 passed, 3,759 skipped.
- `MEMROOS_VAULT_ROOT=$(mktemp -d) npm --prefix apps/memroos run test -- --run src/app/api/memory/__tests__/add-route.test.ts` — exit 0; 7/7.
- `MEMROOS_VAULT_ROOT=$(mktemp -d) npm --prefix apps/memroos run test -- --run src/lib/__tests__/memory-salience-migration.test.ts` — exit 0; 1/1.
- `MEMROOS_VAULT_ROOT=$(mktemp -d) npm --prefix apps/memroos run test -- --run src/app/api/tool-attention/__tests__/record-route.test.ts` — exit 0; 5/5.
- `npm run typecheck` — exit 0.
- Scoped ESLint over all changed TypeScript files — exit 0; 0 errors and 5 existing warnings (unused NOC helpers and the pre-existing `previousInternalKey` test variable).
- `npm run check:mcp-tool-governance` — exit 0.
- `python3 -m py_compile services/knowledge-mcp/knowledge_system/mcp_server.py services/memory/mcp-mem0.py` — exit 0.
- Targeted MCP Python tests — exit 0; 3 passed, 48 deselected.
- `git diff --check` — exit 0.
- `npm run check:route-auth-boundary` — not run; no route-auth logic changed.

The full `python3 -m pytest services/knowledge-mcp/tests/test_knowledge_system.py -q` attempt returned exit 1 with 48 passed and 3 failures because this sandbox cannot write the pre-existing global audit path `/Users/lcalderon/.memroos/audit/knowledge-writes.jsonl`; the failures were `PermissionError` in the existing store audit mirror, not phase assertions.

### Write path: latency and durability

- Before: the supplied production measurement was approximately **104,000 ms** for mem0 `/memory/add`, caused by inline Ollama fact extraction.
- After: the route test measures the request with `performance.now()` and requires the durable bronze capture response in **under 1,000 ms**. The request does not call mem0 or wait for extraction; the focused route suite completed in 1.09 s including setup and all seven tests.
- The response is a bronze receipt, not a queue-acceptance receipt. Before returning, `writeVaultArtifactWithDurability` has written the vault artifact, completed its durability ledger (`write_state=complete`, `replay_state=complete`), and written the chained vault audit receipt. The response includes artifact ID, durability ID, content hash, and persistence timestamp.
- The test immediately reads the artifact back from disk, verifies its SHA-256 hash, checks the durability ledger states, checks the `agent_memory_writes` row, and checks the `memory_write` telemetry event. This is the proof that the receipt represents durable persistence.

### Async worker

- Reused the existing durable `agent_session_captures` plus vault/durability ledger as the bronze queue; no second queue backend was introduced.
- `startMemoryEnrichmentScheduler` runs from the existing scheduler-singleton startup path. The worker claims pending rows with a lease, calls the unchanged mem0 `/memory/add` extraction endpoint off the request path, writes silver `agent_memory_candidates`, and marks the capture `handoff_ready`.
- Failures move to `retrying` with exponential backoff. Expired `running` leases are reclaimable after restart. Candidate insertion is idempotent on `(capture_id, content_hash)`.
- The restart test captures a write, closes/reloads the DB, runs the worker, and verifies the candidate survives and reaches silver. The unreachable-backend test verifies bronze remains readable while enrichment retries.
- `memory_write` telemetry now emits capture/enrichment phase, quality score, queue depth, and extraction lag. The NOC efficiency envelope exposes `extractionQueueDepth` and `extractionLagMs` for later NOC rows.

### SAVEQ-01..05

- **SAVEQ-01 — met.** `scoreMemoryWrite` produces and persists deterministic components for memory type fit, provenance, dedupe, specificity, and promotion readiness. The report is present in the route receipt, `agent_memory_writes.result`, bronze metadata, and silver candidate metadata.
- **SAVEQ-02 — met.** Sub-threshold writes are accepted with actionable coaching for missing outcomes, missing provenance, duplicates/rediscovery, and procedure-shaped content. The procedure guidance explicitly points to SkillForge and the Skills > Memory ordering. Quality scoring never hard-rejects; existing security/classification policy gates remain the only rejection path.
- **SAVEQ-03 — met.** Knowledge MCP `memory_save`, `agent_memory_save`, and `memory_search`, plus legacy `mcp-mem0` save/search/get-all handlers, route through the governed app endpoints. Writes therefore receive policy, audit, dedupe, quality, and telemetry handling; searches use the traced `/api/memory/prior-work` path. The static governance check enumerates these paths and targeted Python tests verify the routing.
- **SAVEQ-04 — met.** `runBeliefPromotion` is scheduled at startup and uses the existing five deterministic checks: provenance, freshness, policy, conflict, and dedupe. Passing candidates are promoted without an LLM-only decision; conflicts enter the operator review queue; admissions use the existing hash-chained promotion receipt. The scheduler test verifies silver → gold and the receipt hash.
- **SAVEQ-05 — met.** Schema version 40 makes `memory_salience` polymorphic for messages, agent writes, and silver candidates, with a legacy-table migration test. Agent writes and candidates receive salience rows; inventory, decay, and subject erasure handle the new identities. `tool_record_outcome` usefulness feedback reinforces named memory salience, covered by a route test.

### Diff stats and scope

- 24 implementation/test files changed: **1,735 additions / 208 deletions** (including 7 new files), plus the required `.phase193-report.md` report artifact; nothing is committed.
- Unrelated files: **no**. Changes are limited to the governed save route, durable capture/enrichment and promotion schedulers, quality/salience/telemetry/lifecycle paths, MCP governance routing, tests, and the governance check script.
- GitNexus `detect_changes` reported 28 changed symbols, 69 affected symbols, 17 indexed changed files, and `critical` risk because `initSchema` is a high-fanout migration hub. The schema-33 compatibility and legacy salience migration tests passed; this was reviewed as required SAVEQ-05 scope, not an escalation.

### Escalations

- No functional escalation. No new backend was required, mem0 inference was not removed, and no route-auth boundary change was made.
- The full Python test limitation is environment-only: the sandbox denies the existing home audit mirror path. The targeted governed MCP tests and Python syntax checks pass.
- MemroOS knowledge persistence was unavailable because the MCP search call was cancelled in-session; no direct knowledge-repository write or commit was attempted, and the required report remains in the current tree.
- No commit was created.
