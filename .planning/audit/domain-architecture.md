# Domain D — Architecture & Code Quality Audit (AUDIT-04)

Generated: 2026-06-07
Phase: 109 — Parallel Domain Audit (Plan 109-05, Wave 2)
Source revision audited: `17646aa` (worktree == main, tree identical)
Consumer: Phase 112 ARCH-01..05 work queue
Tools (from 109-01 toolchain-baseline.md): madge 8.0.0, knip 6.16.1, ruff 0.15.16, vulture 2.16, tsc (next ^16.2.4)
GitNexus MCP: NOT available in this executor's tool set — fell back to madge/knip per plan allowance.

Severity is calibrated per **Pitfall 3** (exploitability/impact, not a blanket template). Findings are routed to ARCH requirements **by type, not severity**:
dead code → ARCH-01, circular dep / cross-layer → ARCH-02, redundant pattern → ARCH-03, inconsistent error handling → ARCH-04, unsafe TS cast → ARCH-05.

---

## Top Findings (severity-ranked)

| ID | Sev | Type → Req | Summary | Location |
|----|-----|-----------|---------|----------|
| D01-001 | MEDIUM | inconsistent error handling → ARCH-04 | 129 API routes; only 29 use the canonical `{ ok: false, error }` shape. 10+ routes have `catch` blocks returning unstructured/ad-hoc errors. | `apps/memroos/src/app/api/**/route.ts` |
| D01-002 | LOW | circular dep → ARCH-02 | Runtime circular import in memory subsystem: `backends.ts` value-imports `getAdapters/registerAdapter` from `registry.ts`, which type-imports back to `adapter.ts`. One real (non-type) edge. | `apps/memroos/src/lib/memory/backends.ts:4` ↔ `registry.ts:9` ↔ `adapter.ts:10` |
| D01-003 | LOW | unsafe TS cast → ARCH-05 | 12 unsafe casts. 9 are `catch (error: any)` in agent API routes (acceptable idiom but loses typing); 3 in VoicePanel for browser SpeechRecognition (no DOM types). None in auth/JWT/policy/crypto paths. | see D01-003 detail |
| D01-004 | LOW | circular dep → ARCH-02 | Type-only circular import (erased at compile): `seal/types.ts` ↔ `seal/proposal-registry.ts`. No runtime cycle. | `apps/memroos/src/lib/seal/types.ts:2` ↔ `proposal-registry.ts:1` |
| D01-005 | LOW | dead code → ARCH-01 | knip: 5 unused exports + 6 unused exported types in security-sensitive paths (auth, seal, policy-gate, classification). `generateRefreshToken` exported but unconsumed. | see D01-005 detail |
| D01-006 | INFO | dead code → ARCH-01 | knip: 11 unused files (3 L3 CRM adapters, 5 flow components, demo/health-dot/tabs) + 120 unused exports + 125 unused types repo-wide. | see D01-006 detail |
| D01-007 | INFO | Python dead code → ARCH-01 | vulture: ~30 "unused" Python functions in services/. Majority are MCP `@mcp.tool()` / FastAPI decorator-registered handlers (false positives, 60% confidence). 2-3 genuine unused vars. | `services/**/*.py` |
| D01-008 | INFO | Python lint → ARCH-01 | ruff: 50 errors (29 auto-fixable), mostly unused imports in test files. | `services/**/*.py` |

No HIGH or CRITICAL findings. No unsafe-cast or execFile/spawn finding reaches a security trust boundary (see attestation rows AC-3, AC-8).

---

## Coverage Attestation

Status legend: CLEAN (checked, no issue) | FINDING (issue raised) | N-A (not applicable) | NOT-CHECKED.

| # | Checklist item (Domain D manual) | Status | Evidence | Finding |
|---|----------------------------------|--------|----------|---------|
| AC-1 | madge circular dependencies → module pairs | FINDING | `madge --circular --extensions ts,tsx apps/memroos/src/` → 3 cycles. 2 are type-only (erased); 1 has a real runtime edge (`backends.ts:4`). Initial `--ts-config ... lib/` invocation processed 0 files; corrected with `--extensions ts,tsx` (648 files). | D01-002, D01-004 |
| AC-2 | knip dead exports in security paths (auth/policy-gate/content-scanner) | FINDING | knip JSON: 5 unused exports + 6 unused types in auth/seal/policy-gate/classification. `auth/jwt.ts:50 generateRefreshToken` unconsumed. Flagged higher than generic dead code per threat T-109-D-03. | D01-005 |
| AC-3 | `as any` / `@ts-ignore` — per-occurrence assessment (Pitfall 3) | FINDING | 12 occurrences enumerated. Each assessed individually: 9 `catch (error: any)` (error-narrowing idiom, no security path); 3 VoicePanel browser-API casts. **Zero in auth/validation/crypto/JWT paths** → none rated above LOW. No blanket rating applied. | D01-003 |
| AC-4 | Error-handling consistency — uniform `{ ok: false, error }` | FINDING | 129 routes; 29 (22%) use canonical shape. 10+ routes (`knowledge`, `skills`, `activity`, `gitnexus`, `cache/purge`, `operations/noc`, …) catch and return ad-hoc/unstructured errors. | D01-001 |
| AC-5 | Redundant patterns — multiple auth-check / DB-connection impls | CLEAN | DB access centralized in `lib/db.ts` (`getDb()`/`closeDb()`). **0 files** instantiate raw `new Database()` outside `db.ts`; 61 consumers all route through the shared module. No redundant DB-connection or duplicate auth-check pattern found. | — |
| AC-6 | Cross-layer leakage — UI importing `lib/db` directly | CLEAN | `grep -rln "lib/db" apps/memroos/src/components/` → no matches. UI layer does not import the DB layer. | — |
| AC-7 | Python cross-service-boundary imports | CLEAN | `grep` for `from services.` / cross-package relative imports across `services/{memory,orchestration,voice-server,knowledge-mcp}` → no matches. Services are import-isolated. | — |
| AC-8 | execFile/spawn/execFileSync arg safety (T-109-D-01) | CLEAN | All call sites use static argv arrays with **no `shell:` option** and no string concatenation. chat/route.ts:210 `spawn(OPENCODE_BIN, ["run","--model",runtime.model,"--dir",cwd,prompt])` passes user `prompt` as a single argv element — injection-safe (no shell). `db.exec(...)` sites are SQLite DDL, not process exec. `execSync` (banned per STATE.md): **0 occurrences**. | — |

All 8 checklist items attested; no blank rows.

---

## Full Findings (schema)

### D01-001 — Inconsistent API error-handling shape (MEDIUM → ARCH-04)
- **File:line:** `apps/memroos/src/app/api/**/route.ts` (129 routes; representative non-conforming: `knowledge/route.ts`, `skills/route.ts`, `activity/route.ts`, `gitnexus/route.ts`, `engagement/test/route.ts`, `model-routing/recommendations/route.ts`, `onboarding/invite/route.ts`, `orchestration/hil/[id]/edit/route.ts`, `cache/purge/route.ts`, `operations/noc/route.ts`)
- **Evidence:** 129 total `route.ts`; 29 use `{ ok: false, error }`. The remaining routes either return bare `Response.json({...})` on error or unstructured catch payloads. Clients cannot rely on a single error contract.
- **Severity rationale:** MEDIUM, not high — no security exposure; impact is maintainability + client error-handling fragility. Highest-ranked because it is the broadest, most systemic issue in Domain D.
- **Fix (Phase 112, ARCH-04):** Introduce a shared `apiError(status, message)` helper returning the canonical `{ ok: false, error }` envelope; migrate routes.

### D01-002 — Runtime circular import in memory subsystem (LOW → ARCH-02)
- **File:line:** `apps/memroos/src/lib/memory/backends.ts:4` → `registry.ts:9` → `adapter.ts:10` → back to `backends.ts`
- **Evidence:** madge cycle #1/#2. `backends.ts:4` is a **value** import (`getAdapters, registerAdapter`); the other edges are `import type`. The single runtime edge makes this a real (if benign) cycle.
- **Severity rationale:** LOW — currently functions (registry uses lazy adapter lookup), but a runtime cycle risks init-order bugs if any edge becomes eager.
- **Fix (Phase 112, ARCH-02):** Extract the adapter-registration contract into a `registry-contract.ts` interface module to break the value-import edge.

### D01-003 — Unsafe TypeScript casts (LOW → ARCH-05)
- **Evidence (per-occurrence, Pitfall 3):**
  - `app/api/agents/versions/route.ts:24,49` — `catch (error: any)` — error narrowing idiom, non-security
  - `app/api/agents/versions/promote/route.ts:21` — `catch (error: any)`
  - `app/api/agents/versions/rollback/route.ts:21` — `catch (error: any)`
  - `app/api/agent-memory/traces/route.ts:22,56` — `catch (error: any)`
  - `app/api/agent-checkpoints/metrics/route.ts:14` — `catch (error: any)`
  - `app/api/agent-checkpoints/route.ts:26,58` — `catch (error: any)`
  - `components/voice/VoicePanel.tsx:354` — `window as any` (SpeechRecognition not in DOM lib types)
  - `components/voice/VoicePanel.tsx:373` — `(event: any)` (SpeechRecognitionEvent untyped)
  - `components/voice/VoicePanel.tsx:375` — `Array.from(event.results) as any[]`
- **Severity rationale:** LOW — **none** sit in auth/validation/JWT/crypto/policy paths. The 9 `catch (error: any)` are the standard pre-`unknown` idiom; the 3 VoicePanel casts are browser-API gaps. Per Pitfall 3, no occurrence is elevated.
- **Fix (Phase 112, ARCH-05):** Replace `catch (error: any)` with `catch (error: unknown)` + narrowing; add a minimal SpeechRecognition `.d.ts` for VoicePanel.

### D01-004 — Type-only circular import in seal (LOW → ARCH-02)
- **File:line:** `apps/memroos/src/lib/seal/types.ts:2` ↔ `proposal-registry.ts:1`
- **Evidence:** madge cycle #3. Both edges are `import type` → fully erased at compile; no runtime cycle.
- **Severity rationale:** LOW (near-INFO) — purely a structural smell.
- **Fix (Phase 112, ARCH-02):** Hoist shared types (`ProposalType`, `ProposalDraft`) into a leaf `seal/proposal-types.ts`.

### D01-005 — Dead exports in security-sensitive paths (LOW → ARCH-01)
- **File:line:**
  - `lib/auth/jwt.ts:50 generateRefreshToken` (unused export)
  - `lib/seal/behavioral-runner.ts:37 listEvalJobs`, `seal/apply.ts:11 applyProposal`, `seal/reflection.ts:4 reflectOnTrace`, `seal/reflection.ts:16 buildProposalDraftsForRun`
  - types: `lib/auth/types.ts:7 AuthUser`, `lib/memory/policy-gate.ts:6 MemoryUseDecision`, `lib/classification/types.ts:34 ClassificationReviewStatus`, `seal/behavioral-jobs.ts:38 PromotionMetadata`, `seal/behavioral-sandbox.ts:28 SandboxToolCallResult`, `seal/types.ts:7 SealAuditEvent`
- **Evidence:** knip JSON, filtered to auth/seal/policy/classification paths.
- **Severity rationale:** LOW — dead security code is attack-surface-neutral while unwired but should be removed or wired (`generateRefreshToken` unused may indicate an incomplete refresh-token flow worth verifying against 82-auth-hardening). Confirm not dynamically referenced before deletion.
- **Fix (Phase 112, ARCH-01):** Verify each is truly unreferenced (knip can miss dynamic refs), then delete or wire `generateRefreshToken`.

### D01-006 — Repo-wide dead code (INFO → ARCH-01)
- **Evidence:** knip — 11 unused files (`lib/l3/adapters/{netsuite,salesforce,zendesk}.ts`, `components/flow/{demo-mode,flow-canvas,flow-edge,flow-node}.tsx`, `components/layout/health-dot.tsx`, `components/ui/tabs.tsx`, `components/voice/useVoiceTranscript.ts`, `scripts/generate-demo-video.mjs`), 120 unused exports, 125 unused types, 1 unused dependency (`@types/bcryptjs`).
- **Severity rationale:** INFO — maintenance/bundle hygiene; no correctness/security impact. L3 CRM adapters may be intentionally pre-built for a future phase — confirm before removal.
- **Fix (Phase 112, ARCH-01):** Triage; remove confirmed-dead, document intentional-future stubs.

### D01-007 — Python dead code (INFO → ARCH-01)
- **File:line:** `services/{knowledge-mcp,memory}/**/*.py` (see vulture listing)
- **Evidence:** vulture flagged ~30 functions at 60% confidence. The majority are `@mcp.tool()` / FastAPI route decorator handlers (e.g., `knowledge_search`, `memory_save`, `shutdown_event`) — **false positives** (registered via decorator, not called by name). Genuine: `store.py:115 preview`, `mem0-queue.py:19 MAX_RETRIES`, `mem0-queue.py:94 row_factory`.
- **Severity rationale:** INFO — low-confidence + decorator false positives dominate.
- **Fix (Phase 112, ARCH-01):** Add vulture whitelist for decorator-registered handlers; remove the 2-3 genuine unused vars.

### D01-008 — Python lint (INFO → ARCH-01)
- **File:line:** `services/voice-server/tests/*.py` and others
- **Evidence:** ruff — 50 errors, 29 auto-fixable, dominated by unused imports (`sys`, `pytest`) in test files.
- **Severity rationale:** INFO — test-file hygiene; auto-fixable.
- **Fix (Phase 112, ARCH-01):** `ruff check services/ --fix`.

---

## Summary Stats

| Metric | Value |
|--------|-------|
| Findings total | 8 (D01-001 .. D01-008) |
| CRITICAL / HIGH | 0 / 0 |
| MEDIUM | 1 (D01-001) |
| LOW | 4 (D01-002, D01-003, D01-004, D01-005) |
| INFO | 3 (D01-006, D01-007, D01-008) |
| Circular deps (madge) | 3 cycles (1 runtime, 2 type-only) |
| Unsafe TS casts | 12 (0 in security paths) |
| Unused files (knip) | 11 |
| Unused exports / types (knip) | 120 / 125 |
| Dead exports in security paths | 11 (5 exports + 6 types) |
| API routes total / canonical error shape | 129 / 29 (22%) |
| Python ruff errors | 50 (29 auto-fixable) |
| Python vulture flags | ~30 (mostly decorator false positives) |
| execSync (banned) occurrences | 0 |
| Cross-layer (UI→db) violations | 0 |
| Redundant DB-connection impls | 0 (centralized in lib/db.ts) |
| ARCH requirement mapping | ARCH-01: D01-005/006/007/008 · ARCH-02: D01-002/004 · ARCH-04: D01-001 · ARCH-05: D01-003 |

### Tool invocation notes (reproducibility)
- madge: `madge --circular --extensions ts,tsx apps/memroos/src/` (the plan's `--ts-config ... lib/` form processed 0 files; `--extensions` flag required — Rule 3 tooling fix).
- knip: `cd apps/memroos && knip --reporter json > /tmp/knip-domain-d.json` (valid JSON, 87 issue groups).
- tsc: `cd apps/memroos && npx tsc --noEmit` — all reported errors are in `**/__tests__/*.test.ts` (test-only type drift, e.g. `ApplyResult.kept`), none in production paths.
- ruff/vulture: `ruff check services/`, `vulture services/`.
- GitNexus MCP unavailable in executor tool set → madge/knip used as the plan's sanctioned fallback.
