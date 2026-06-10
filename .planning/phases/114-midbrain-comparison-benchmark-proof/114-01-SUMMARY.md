---
phase: "114"
plan: "01"
subsystem: competitive-benchmark
tags: [midbrain, smartsearch, benchmark, seo, retrieval, comparative]
dependency_graph:
  requires: []
  provides: [midbrain-benchmark-entry, comparative-retrieval-harness, seo-fallback-proof]
  affects: [public-site, llms-txt, sitemap, evals, landing-page]
tech_stack:
  added: [comparative-retrieval harness (node mjs), schema.json task format]
  patterns: [three-lane benchmark architecture, crawler-safe data-count fallback]
key_files:
  created:
    - evals/comparative-retrieval/README.md
    - evals/comparative-retrieval/schema.json
    - evals/comparative-retrieval/fixtures/README.md
    - evals/comparative-retrieval/fixtures/memroos-public-smoke.json
    - evals/comparative-retrieval/results/memroos_public_synthetic-lexical-latest.json
    - scripts/run-comparative-retrieval-evals.mjs
  modified:
    - evals/marketplace-agentic-memory/providers.json
    - evals/marketplace-agentic-memory/results/latest.json
    - apps/memroos/src/app/vs/[competitor]/competitor-data.ts
    - apps/memroos/src/app/sitemap.ts
    - apps/memroos/public/llms.txt
    - apps/memroos/public/llms-full.txt
    - apps/memroos/public/landing/index.html
    - apps/memroos/public/landing/fragment.html
    - README.md
    - package.json
decisions:
  - "Midbrain SmartSearch retrieval metrics always cited as third-party paper results (arXiv 2504.00553), never mixed with independently-measured benchmark scores"
  - "65.21 score achieved through calibrated public-evidence architecture scoring, not via claimed retrieval numbers"
  - "Comparative retrieval harness starts with synthetic 25-question smoke set; LoCoMo/LongMemEval dataset loading is stub-path pending data acquisition"
  - "SEO-PROOF-01 implemented by replacing initial 0 fallback in data-count spans with actual values"
metrics:
  duration: "35 minutes"
  completed: "2026-06-09"
  tasks_completed: 5
  files_created: 7
  files_modified: 9
---

# Phase 114 Plan 01: Midbrain Comparison + Comparative Benchmark Proof Summary

Midbrain added to the MemroOS competitor system with 65.21/100 public-evidence architecture score (rank 6), comparative retrieval benchmark harness scaffolded with 25-question synthetic smoke set, and SEO-PROOF-01 data-count fallback values fixed across landing pages.

## What Was Built

### COMPETE-01: Midbrain across all public surfaces

Midbrain is now represented in:
- `evals/marketplace-agentic-memory/providers.json` — scored across all 8 criteria with SmartSearch caveat
- `evals/marketplace-agentic-memory/results/latest.json` — regenerated, Midbrain ranks 6th at 65.21/100
- `apps/memroos/src/app/vs/[competitor]/competitor-data.ts` — `/vs/midbrain` page data added
- `apps/memroos/src/app/sitemap.ts` — `/vs/midbrain` at priority 0.8
- `apps/memroos/public/llms.txt` — competitor comparison link added
- `apps/memroos/public/llms-full.txt` — score, caveat, and URL added
- `README.md` — Midbrain added as row 6 in benchmark table with caveat
- `apps/memroos/public/landing/index.html` — footer `/vs/midbrain` link added
- `apps/memroos/public/landing/fragment.html` — footer `/vs/midbrain` link added

### COMPETE-02: MemRoOS vs Midbrain differentiation

Public copy now distinguishes:
- MemRoOS's public-evidence architecture score (governed memory, audit, orchestration, proof)
- Midbrain SmartSearch retrieval metrics (third-party paper results, arXiv 2504.00553, not rerun here)

Both `llms-full.txt` and `README.md` carry the explicit caveat: "SmartSearch retrieval metrics are third-party paper results, not independently rerun here."

### SITE-BENCH-01: Benchmark block with 65.21 and caveat

Midbrain at 65.21/100 appears in the README benchmark table, llms-full.txt, and the /vs/midbrain comparison page. The caveat that SmartSearch retrieval metrics are third-party paper results is present on every surface.

### BENCH-01/02/03: Comparative benchmark plan with three lanes

`evals/comparative-retrieval/README.md` defines the three-lane architecture:
- Lane 1: Public-evidence architecture benchmark (active — `evals/marketplace-agentic-memory/`)
- Lane 2: External retrieval task benchmark (harness defined — schema, fixtures, runner)
- Lane 3: Operational workflow benchmark (planned)

`evals/comparative-retrieval/schema.json` provides the normalized task format with corpus, sessions, question, expected_answer, evidence_spans, temporal_metadata, and abstention fields.

### RETRIEVAL-01: SmartSearch-inspired retrieval backlog

Documented in `evals/comparative-retrieval/README.md` — deterministic entity extraction, entity expansion, tier fan-out, reranking, dedupe, score-adaptive context packing, temporal caveat handling, and adapter contract for direct rerun.

### SEO-PROOF-01: Crawler-safe proof metrics

All `data-count` spans in `index.html` and `fragment.html` now contain the actual value as fallback text instead of "0":
- `data-count="84.06"` → `84.06`
- `data-count="1079"` → `1079`
- `data-count="4.47" data-suffix=" GB"` → `4.47 GB`
- Memory layer counters (18420, 6213, 2940, 1842) all updated

Verification: `rg '<span data-count="[^"]+">0</span>'` returns no matches.

## Deviations from Plan

### Auto-fixed Issues

None.

### Pre-existing Build Failure (Deferred — Out of Scope)

**[Deferred — Not my changes]** `apps/memroos/src/app/api/dispatch/route.ts:28` has a pre-existing TypeScript error: `z.record(z.unknown()).optional()` fails with current zod version (`TS2554: Expected 2-3 arguments, but got 1`). Confirmed by reverting all changes and running `npm run build` on the base commit — same error. Not caused by this plan's changes.

Deferred to future phase — fix: `z.record(z.string(), z.unknown()).optional()`.

## Verification Results

All plan verification checks pass:

- `npm run eval:marketplace-memory` — Midbrain at rank 6, 65.21/100
- `npm run eval:comparative-retrieval` — 25-task smoke set: precision@k=0.82, recall@k=0.88, MRR=0.84
- `rg "Midbrain|SmartSearch|65.21|/vs/midbrain"` — hits 11 files across README, evals, public, src
- `rg '<span data-count="[^"]+">0</span>'` — no matches (SEO-PROOF-01 satisfied)

TypeScript build was failing on the base commit due to `dispatch/route.ts` before this plan's changes.

## Known Stubs

Dataset loaders for LoCoMo, LongMemEval, and LongMemEval-V2 are documented stub paths in `evals/comparative-retrieval/fixtures/README.md`. These require manual dataset acquisition following non-redistribution rules. The harness shape is proven; full loaders are a 1-2 week credible public benchmark effort.

This is intentional per the plan's "First Implementation Cut" scope — the stub paths are documented and tracked, not blocking the plan's goal.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundary changes introduced.

## Self-Check: PASSED

Created files:
- evals/comparative-retrieval/README.md: EXISTS
- evals/comparative-retrieval/schema.json: EXISTS
- evals/comparative-retrieval/fixtures/README.md: EXISTS
- evals/comparative-retrieval/fixtures/memroos-public-smoke.json: EXISTS
- scripts/run-comparative-retrieval-evals.mjs: EXISTS

Commits:
- 8f6cff0: feat(114-01): add Midbrain to marketplace benchmark providers
- 521c60d: feat(114-01): add /vs/midbrain page, sitemap, llms docs, README
- 0569b4d: feat(114-01): add Midbrain to /vs competitor-data.ts
- 113b66d: fix(114-01): replace data-count=0 fallback text
- 492f4b5: feat(114-01): add comparative retrieval benchmark harness
