# Phase 114 Handoff — Midbrain Comparison + Comparative Benchmark Proof

**Date:** 2026-06-10  
**Handed off by:** Claude Sonnet 4.6 (context exhaustion)  
**Status:** Superseded for repo-local completion — verification and follow-up fixes passed; deploy hold remains active

> 2026-06-27 update: the original handoff status is superseded for repo-local completion. `114-VERIFICATION.md` now records 9/9 must-haves verified with no remaining gaps. CR-01 is covered by the documented confidence-weighted marketplace scoring path, and CR-02 was fixed in `scripts/run-comparative-retrieval-evals.mjs` with `scripts/run-comparative-retrieval-evals.test.mjs` coverage. The public deploy hold below remains separate and still requires Luis approval.

---

## What Was Accomplished

Phase 114 Plan 01 executed and merged. All commits are on `main`:

| Commit | Description |
|--------|-------------|
| `8f6cff0` | feat(114-01): add Midbrain to marketplace benchmark providers and regenerate results |
| `521c60d` | feat(114-01): add /vs/midbrain page, sitemap, llms docs, and README benchmark entry |
| `0569b4d` | feat(114-01): add Midbrain to /vs competitor-data.ts |
| `113b66d` | fix(114-01): replace data-count=0 fallback text with actual values for crawler/LLM visibility |
| `492f4b5` | feat(114-01): add comparative retrieval benchmark harness (Lane 2) |
| `08225e7` | docs(114-01): complete Midbrain comparison + benchmark proof plan |
| `6d9d442` | docs(phase-114): update tracking after wave 1 |
| `2b4eaf7` | docs(114): add code review report |
| `de5c6da` | docs(114): add phase verification report |

## Deploy Hold (Luis Explicit Instruction)

**DO NOT push/deploy to public site** until Luis reviews benchmark numbers and approves.

Luis's exact words: *"Don't deploy to public site until we see the test benchmark results in case they are bad."*

Numbers for Luis to review before approving deploy:
- MemRoOS: **84.06/100** (rank 1)
- Midbrain: **65.21/100** (rank 6) — NOTE: see CR-01 below, this number may need recalculation
- Smoke set retrieval: precision@k=0.82, recall@k=0.88, MRR=0.84 (synthetic, not independent)

**Luis has not yet responded** to the question about whether these numbers are acceptable.

---

## Superseded Repo-Local Closure Items

### 1. Code Review Criticals

**CR-01 — totalScore inconsistency in competitor-data.ts** (CRITICAL)
- File: `apps/memroos/src/app/vs/[competitor]/competitor-data.ts`
- Midbrain `totalScore: 65.21` but average of 8 criteria × 20 = **74.00**
- Any journalist checking the math will catch this inconsistency
- Fix: derive `totalScore` programmatically from criterion scores, or document the weighting formula

**Current status:** resolved by documenting the confidence-weighted scoring formula path in `competitor-data.ts`; `node scripts/run-marketplace-memory-evals.mjs --json --no-write` confirms Midbrain rank 6 with weighted score `65.2115`.

**CR-02 — answerLower.slice(0, 40) truncation in harness** (CRITICAL)
- File: `scripts/run-comparative-retrieval-evals.mjs`
- Short expected answers match irrelevant passages → inflates `answerSupportedRate`
- Fix: use full string or exact match for short answers

**Current status:** resolved by full normalized expected-answer containment and focused regression coverage in `scripts/run-comparative-retrieval-evals.test.mjs`.

Full review: `.planning/phases/114-midbrain-comparison-benchmark-proof/114-REVIEW.md`

### 2. Verification Gap

**RECEIPTS-01 — Retrieval receipts not yet public-facing** (GAP)
- `scripts/run-comparative-retrieval-evals.mjs` emits receipt with only 4 fields
- Missing: `score`, `tier`, `source`, `authorization_result`, `why_entered`, `why_missed`
- No app component renders receipts as product proof
- Gap closure plan: run `/gsd:plan-phase 114 --gaps` to create a gap closure plan

**Current status:** superseded by `114-VERIFICATION.md`, which records 9/9 must-haves verified and no remaining gaps after receipt fields were added to the benchmark evidence.

### 3. Minor Code Review Issues

**WR-01** — `--limit` with no value → NaN → silent zero-task run (`run-comparative-retrieval-evals.mjs`)  
**WR-02** — No JSON parse error handling in `loadFixtures`  
**WR-03** — `llms.txt` missing 4 competitors (`/vs/axme`, `/vs/agenticmemory`, `/vs/worldflow`, `/vs/tytan`)  
**WR-04** — `evidence_spans` absent → `recallAtK` returns 1.0 instead of null  
**WR-05** — `p95LatencyMs` off-by-one for small N  
**IN-03** — `schema.json` lacks `additionalProperties: false`

---

## GSD Workflow State

The next LLM picking this up should run:

```
# Option A: Fix gaps then close phase
/gsd:plan-phase 114 --gaps    # creates gap closure plan for RECEIPTS-01
# Then address CR-01 and CR-02 manually or via /gsd:code-review 114 --fix

# Option B: Skip RECEIPTS-01 gap, close phase manually
# Only if Luis decides receipts are deferred to next phase
```

**STATE.md current position:** Phase 114, executing, 1 plan completed, 1 incomplete (gaps_found)  
**ROADMAP.md:** v7.1 Competitive Retrieval Proof ⏳ in progress

---

## Key Files

| File | Purpose |
|------|---------|
| `.planning/phases/114-midbrain-comparison-benchmark-proof/114-01-PLAN.md` | Original plan |
| `.planning/phases/114-midbrain-comparison-benchmark-proof/114-01-SUMMARY.md` | Execution summary |
| `.planning/phases/114-midbrain-comparison-benchmark-proof/114-REVIEW.md` | Code review (2 criticals) |
| `.planning/phases/114-midbrain-comparison-benchmark-proof/114-VERIFICATION.md` | Verification (8/9 passed) |
| `scripts/run-comparative-retrieval-evals.mjs` | Lane 2 benchmark harness |
| `evals/comparative-retrieval/` | Benchmark fixtures, schema, results |
| `evals/marketplace-agentic-memory/results/latest.json` | Rankings (MemRoOS #1, Midbrain #6) |
| `apps/memroos/src/app/vs/[competitor]/competitor-data.ts` | /vs/midbrain page data |

---

## Pre-existing Issues (Not Phase 114)

- `apps/memroos/src/app/api/dispatch/route.ts:28` — pre-existing TS build error: `z.record(z.unknown()).optional()` should be `z.record(z.string(), z.unknown()).optional()`
- `src/lib/cloud-offload/__tests__/footprint.test.ts` — pre-existing timeout test failure (from Phase 108)

---

## Context for Next LLM

- Project: Memroos — open-source governed agent memory platform
- Working dir: `~/GitHub/memroos` (also `~/github/memroos` — symlinked)
- Run `cat .planning/STATE.md` and `cat .planning/ROADMAP.md` to get current state
- No Turbovec — explicitly prohibited by roadmap notes
- Luis wants to review benchmark numbers before any public deploy
- Benchmark scoring uses public-evidence architecture methodology, not retrieval performance
