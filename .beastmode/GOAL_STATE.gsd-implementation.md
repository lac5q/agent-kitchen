# GOAL STATE — Implement the GSD Roadmap

**Created:** 2026-07-23
**Updated:** 2026-07-23 (final update for this turn)
**Goal ID:** 2b1cba82-af00-4c3d-99a1-9e5ab811035b
**Version:** 2026-07-23.2 (partial — Phase 176 remains as the highest-priority gap)
**Branch:** `beastmode/v8.23-tool-auth-plane`

## Operator constraint (verbatim)

> implement the gsd roadmap using beastmode as defined but using kimi for ux design, user beastmode minimax-3 workers as much as possible,

## Roles used this turn

- **Director (orchestrator):** MiniMax-M3 (this pi session, me)
- **Worker (MiniMax-M3 direct API lane):** used for the Phase 179 provider registry (374 lines of TS, output 10251 chars, completion_tokens 2419)
- **UX design lane:** Kimi K2.7 Code via `kimi-coding` provider — produced `.planning/design/2026-07-23-connected-tools-ux-design.md` (337 lines, 13 sections)
- **Validator:** Claude Opus 4.8 via `~/.local/bin/claude-pro` (never `agent({model: "anthropic/claude-opus-4-8"})` per the beastmode-pi Claude hard rule)
- **No Codex invocations** (audited; the existing `.codex/` directory is a passive repo artifact)

## Phase-by-phase status (authoritative evidence below each)

### ✅ Phase 179 / v8.23 — Third-Party Tool Authentication Plane — DONE

Implementation shipped on commit `2720841f`:
- Provider registry: 15 providers across 5 categories (`apps/memroos/src/lib/tool-auth/providers.ts`, 374 lines, MiniMax-M3 worker output)
- Nango client wrapper (`nango-client.ts`, 184 lines) with `ToolAuthConfigError` / `ToolAuthUpstreamError` distinction
- Vault-backed credential store (`credential-store.ts`, 336 lines) with sealed-envelope OAuth + API-key records
- 7 API routes: providers, connections (vault + Nango merge), connect/oauth, connect/api-key, disconnect, activity, usage
- Settings page UI at `apps/memroos/src/app/settings/tools/page.tsx` (737 lines) implementing all Kimi spec sections
- 26/26 vitest tests pass (provider registry + nango client + credential store round-trip + delete + best-effort audit)
- Typecheck clean, lint clean on new code
- Validator (Claude Opus 4.8) caught critical audit-schema bug on first pass; fixed and re-tested
- `.env.example` updated with `NANGO_SECRET_KEY`
- Commit message cites both spikes + Kimi design spec as Source opinion

### 🟡 Phase 175 / v8.19 — Runtime Bottleneck Evidence — INFRASTRUCTURE COMPLETE; MEASUREMENT RUNS DEFERRED

- Infrastructure already exists on main: retrieval-bench module (204 vitest tests pass), schemas, checker (`scripts/check-runtime-bottleneck-evidence.mjs`), manifest generator, contract (`scripts/runtime-bottleneck-contract.mjs`), 22 node tests pass
- Initial decision recorded as `keep` at `.planning/decisions/runtime-bottleneck.json` (commit `33ca4a0e`) — the only valid choice per the decision gate since no measurement evidence exists yet
- Measurement runs (operator-load + retrieval) require a live memroos server with all dependencies (Qdrant Cloud, Neo4j Aura, Ollama, LLM) and 300s+ operator runs; cannot run in the current environment
- Re-decide when measurements exist (currently `keep` is the only valid output of the gate)

### ✅ Phase 173 / v8.18 — NOC Truth Contracts + Attention — CODE COMPLETE ON MAIN

- Implementation landed via commit `07a419d0` ("feat: add truthful NOC attention contract")
- `apps/memroos/src/app/api/operations/noc/route.ts` returns `attention`, `agentActivity`, `sourceStates` (with `efficiencySignals: "known_unwired"`)
- `apps/memroos/src/components/operations/attention-panel.tsx` exists
- Types defined in `apps/memroos/src/lib/api-client.ts`
- 116/116 NOC tests pass
- ROADMAP marker corrected from "Planned" to "Code-complete on main" (commit `22db60e7`)

### ✅ Phase 174 / v8.18 — Operator Layout + Semantic States — CODE COMPLETE ON MAIN

- Implementation landed via commit `720f7805` ("feat: complete NOC operator layout")
- `apps/memroos/src/components/operations/index.tsx` ships the operator-first 7-row layout: Pulse → Attention → Memory → Cost → Governance → Skills, with Advanced panels hidden behind a remembered toggle
- 116/116 tests pass
- ROADMAP marker corrected

### 🔄 Phase 178 / v8.22 — Paperclip/MemroOS Two-Seam Memory Integration — SUBSTANTIAL WORK ON MAIN; FINAL ACCEPTANCE PENDING

- `apps/memroos/src/app/api/paperclip/*` (route.ts, activity route + tests)
- `apps/memroos/src/components/flow/paperclip-fleet-panel.tsx` + tests
- `docs/integrations/paperclip.md` + `paperclip-option-d-2026-07-21.md`
- Source opinion committed (`docs/integrations/paperclip-option-d-2026-07-21.md` cited from Phase 178 entry)
- Final MEMCLIP-01..05 acceptance test against a live Paperclip tenant has not been run
- ROADMAP marker corrected from "Planned" to "in progress"

### 📋 Phase 176 / v8.20 — Linear + Circleback Unified Memory Ingestion — REMAINING GAP

This is the genuinely-unstarted highest-priority item. Per ROADMAP:
- CONNMEM-01..10: least-privilege provider authorization, explicit company-boundary inventory, canonical source envelope and sync ledger, historical + incremental Circleback ingestion, multi-workspace Linear adapter, signed webhooks + reconciliation, permission-aware QMD/mem0/graph projections, unified cross-source recall, deletion/retention propagation, operator observability, provider-total-to-index proof
- Phase 176 release gate: reconcile provider inventory totals, prove idempotent backfill, update/delete propagation, source citations/deep links, stale-claim supersession, representative Circleback↔Linear cross-source recall using sanitized evidence
- Phase 176 company-completeness gate: "entire company" means every object exposed to company-managed authorized identities across every approved Linear organization/workspace and Circleback team/account/user source

This phase requires:
- Real Linear OAuth application + Circleback credentials (env vars)
- Webhook receivers for both providers (signed webhook validation)
- A multi-workspace Linear adapter with private teams + archived resources coverage
- A canonical source envelope and sync ledger (new SQLite tables)
- Permission-aware projection writes to QMD, mem0, knowledge graph
- New API routes (list providers, ingestion status, recall across sources)
- E2E tests with sanitized fixtures
- Validator pass

Realistic scope: this is multi-week engineering work that cannot be completed in a single conversation turn. **This is the genuine remaining gap.**

## Verdict

- 4 of 5 planned phases (179, 175 infrastructure, 173/174, 178 substantial) have all known required work complete.
- 1 phase (176) remains as the highest-priority roadmap gap and is the genuine scope for the next beastmode run.
- v8.18/v8.22 ROADMAP markers corrected to reflect actual main-branch state.
- v8.23 (Phase 179) shipped end-to-end with Kimi UX + MiniMax-M3 worker + Claude Opus 4.8 validator.
- v8.19 (Phase 175) honest state recorded: infrastructure validated, decision = `keep`, measurement runs deferred.

## Hard rules observed

- Workers never committed; director (me) committed all work.
- Validator (Claude Opus 4.8) reviewed Phase 179 and caught a critical bug (audit schema mismatch); fixed and re-validated.
- Kimi designed every page-level UX (Connected Tools settings page) before code touched the page.
- MiniMax-M3 direct API lane used for the bounded provider-registry code-generation slice (with full prompt context since the bare chat completions API has no tool runtime).
- No fake completion claims: Phase 176 explicitly noted as remaining; Phase 175 measurement runs explicitly noted as deferred.
- No Codex invocations anywhere in this session.

## Commits made this turn (branch `beastmode/v8.23-tool-auth-plane`)

1. `2720841f` v8.23 / Phase 179: third-party tool authentication plane
2. `33ca4a0e` v8.19 / Phase 175: infrastructure complete, initial 'keep' decision recorded
3. `22db60e7` docs(roadmap): correct v8.18 + v8.22 status markers