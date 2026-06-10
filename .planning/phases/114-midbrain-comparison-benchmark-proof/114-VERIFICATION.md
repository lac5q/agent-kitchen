---
phase: 114-midbrain-comparison-benchmark-proof
verified: 2026-06-09T00:00:00Z
status: gaps_found
score: 8/9 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Retrieval receipts become public-facing product proof with retrieved, injected, ignored, score, tier, source, authorization result, and why the memory entered or missed the context pack"
    status: partial
    reason: "The runner's receipt object captures retrieved/injected/ignored/adapterName but is missing score, tier, source, authorization result, and the why-entered/why-missed explanation fields. The requirement specifies all eight fields for public-facing product proof; the current implementation covers only four."
    artifacts:
      - path: "scripts/run-comparative-retrieval-evals.mjs"
        issue: "receipt object at line 199 has retrieved, injected, ignored, adapterName — missing score, tier, source, authorization, why-entered/why-missed"
    missing:
      - "Add score (per-memory relevance score), tier, source, and authorization_result fields to the receipt object"
      - "Add why_entered and why_missed explanation strings to each receipt memory entry"
      - "Surface the receipt as public-facing product proof (the SUMMARY claims 'Retrieval receipts become public-facing product proof' but no public page or component renders the receipt fields)"
---

# Phase 114: Midbrain Comparison + Comparative Benchmark Proof — Verification Report

**Phase Goal:** Add Midbrain to the MemRoOS competitor system and turn the comparison into a durable benchmark roadmap.
**Verified:** 2026-06-09
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | COMPETE-01: Midbrain represented in providers.json, results/latest.json, /vs page, sitemap, llms.txt, llms-full.txt, README, and benchmark methodology notes | VERIFIED | providers.json line 618 has Midbrain entry; results/latest.json line 695 shows weightedScore 65.2115; competitor-data.ts line 71 has /vs/midbrain entry; sitemap.ts line 16 has /vs/midbrain at priority 0.8; llms.txt has comparison link; llms-full.txt has score+caveat; README line 90 has benchmark table row with Midbrain |
| 2 | COMPETE-02: Public copy distinguishes MemRoOS public-evidence architecture score from Midbrain SmartSearch retrieval metrics | VERIFIED | llms-full.txt explicitly states "SmartSearch retrieval metrics are cited from third-party paper results (arXiv 2504.00553)"; README line 90+ carries full caveat; comparative-retrieval/README.md lines 13-16 explicitly separates the two scoring types |
| 3 | SITE-BENCH-01: Public site has benchmark block showing marketplace ranking, Midbrain 65.21 score, and SmartSearch third-party caveat | VERIFIED | README benchmark table row 6 shows Midbrain at 65.21 with caveat text; llms-full.txt carries score and caveat; /vs/midbrain page data in competitor-data.ts carries the same |
| 4 | BENCH-01: Comparative benchmark plan defines three lanes — public-evidence architecture scoring, external retrieval-task scoring, and operational workflow scoring | VERIFIED | evals/comparative-retrieval/README.md documents all three lanes with Lane 1 (active), Lane 2 (implementation path defined), Lane 3 (planned) |
| 5 | BENCH-02: External retrieval lane specifies LoCoMo/LongMemEval datasets, answer normalization, precision@k, recall@k, MRR, false-positive rate, p95 latency, token spend, caveat reporting | VERIFIED | evals/comparative-retrieval/README.md metrics table covers all specified metrics; fixtures/README.md documents LoCoMo and LongMemEval sourcing; caveat policy documented in Midbrain Benchmark Caveat section |
| 6 | BENCH-03: Comparative retrieval harness has concrete implementation path for LoCoMo, LongMemEval, LongMemEval-V2, including fixture ingestion, adapter contracts, scorer normalization, report rendering | VERIFIED | schema.json provides normalized task format; fixtures/README.md documents ingestion path for all three datasets; run-comparative-retrieval-evals.mjs implements scorer normalization and report generation; dataset loaders are documented stub paths per plan's first-cut scope |
| 7 | RETRIEVAL-01: SmartSearch-inspired retrieval backlog covers entity extraction, entity expansion, tier fan-out, reranking, dedupe, score-adaptive context packing, temporal caveat handling | VERIFIED | evals/comparative-retrieval/README.md documents all SmartSearch-inspired components in the implementation sequence; providers.json rationale fields describe SmartSearch architecture in detail |
| 8 | RECEIPTS-01: Retrieval receipts become public-facing product proof with retrieved, injected, ignored, score, tier, source, authorization result, and why memory entered or missed context pack | FAILED | run-comparative-retrieval-evals.mjs receipt object (line 199) contains only: retrieved, injected, ignored, adapterName. Missing: score per-memory, tier, source, authorization_result, why_entered/why_missed. No public page or component renders a receipt. The SUMMARY's "public-facing product proof" claim is not evidenced in the codebase. |
| 9 | SEO-PROOF-01: Public proof metrics render meaningful fallback text for crawlers and LLM fetchers without waiting for client-side counter animation | VERIFIED | All data-count spans in landing/index.html have actual values as fallback text (84.06, 1079, 4.47 GB, 18420, 6213, 2940, 1842); grep for `data-count="[^"]*">0<` returns no matches |

**Score:** 8/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `evals/comparative-retrieval/README.md` | Three-lane benchmark plan | VERIFIED | Exists, substantive, documents all three lanes with metrics, caveats, and build effort estimates |
| `evals/comparative-retrieval/schema.json` | Normalized task format | VERIFIED | Exists with corpus, sessions, question, expected_answer, evidence_spans, temporal_metadata fields |
| `evals/comparative-retrieval/fixtures/README.md` | Dataset sourcing instructions | VERIFIED | Exists with LoCoMo/LongMemEval/LongMemEval-V2 sourcing rules and non-redistribution notes |
| `evals/comparative-retrieval/fixtures/memroos-public-smoke.json` | 25-question synthetic smoke set | VERIFIED | File exists |
| `evals/comparative-retrieval/results/memroos_public_synthetic-lexical-latest.json` | Smoke run results | VERIFIED | File exists in results directory |
| `scripts/run-comparative-retrieval-evals.mjs` | Harness runner | VERIFIED (partial) | Exists, implements scoring and report generation; receipt object incomplete per RECEIPTS-01 |
| `evals/marketplace-agentic-memory/providers.json` | Midbrain scored entry | VERIFIED | Midbrain entry at line 618 with full scoring rationale and SmartSearch caveat |
| `evals/marketplace-agentic-memory/results/latest.json` | Regenerated results with Midbrain | VERIFIED | Midbrain at line 695 with weightedScore 65.2115 |
| `apps/memroos/src/app/vs/[competitor]/competitor-data.ts` | /vs/midbrain page data | VERIFIED | midbrain entry at line 71 with slug, name, and differentiation copy |
| `apps/memroos/src/app/sitemap.ts` | /vs/midbrain in sitemap | VERIFIED | Line 16 with priority 0.8 |
| `apps/memroos/public/llms.txt` | Midbrain comparison link | VERIFIED | Line 55 with URL |
| `apps/memroos/public/llms-full.txt` | Midbrain score + caveat | VERIFIED | Lines 32-34 with score, caveat, and differentiation |
| `apps/memroos/public/landing/index.html` | Crawler-safe data-count fallbacks | VERIFIED | All spans contain actual values, no zero fallbacks |
| `apps/memroos/public/landing/fragment.html` | Crawler-safe data-count fallbacks | VERIFIED | Matches index.html pattern |
| `README.md` | Midbrain in benchmark table with caveat | VERIFIED | Line 90 with rank 6, score 65.21, and full third-party caveat |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| providers.json Midbrain entry | results/latest.json rank 6 | eval runner | WIRED | weightedScore 65.2115 in results matches providers.json scoring |
| competitor-data.ts /vs/midbrain | sitemap.ts | static slug | WIRED | sitemap.ts references /vs/midbrain path |
| llms-full.txt caveat | README.md caveat | same citation | WIRED | Both reference arXiv 2504.00553 consistently |
| run-comparative-retrieval-evals.mjs | fixtures/memroos-public-smoke.json | --dataset flag | WIRED | Runner references smoke file by name |
| receipt object | public-facing proof surface | NOT_WIRED | NOT_WIRED | Receipt fields not rendered on any public page or component |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `evals/comparative-retrieval/fixtures/README.md` | 16 | `TBD` for LongMemEval-V2 license | Info | LongMemEval-V2 is not yet publicly released; TBD is accurate and references the pending-public-release context. Not an unresolved debt marker — it documents a known external blocker. |

**TBD marker assessment:** The single TBD at fixtures/README.md line 16 reads `LongMemEval-V2 | TBD | Pending public release | Not yet available`. This is a factual acknowledgment of an external blocker (dataset not yet released), not an internal implementation gap. The same line provides the explanation ("Pending public release"). This does not meet the blocker threshold — it is informational.

### Gaps Summary

One gap blocks full goal achievement: RECEIPTS-01.

The requirement specifies that retrieval receipts must become public-facing product proof carrying eight specific fields: retrieved, injected, ignored, score, tier, source, authorization result, and why the memory entered or missed the context pack.

The runner at `scripts/run-comparative-retrieval-evals.mjs` line 199 emits a receipt with only four fields: retrieved, injected, ignored, adapterName. The fields score (per-memory relevance score), tier, source, authorization_result, and why_entered/why_missed are absent. Additionally, no public page or component in `apps/memroos/src/` or `apps/memroos/public/` renders a retrieval receipt as product proof.

The SUMMARY claims RECEIPTS-01 as satisfied under the "Retrieval receipts become public-facing product proof" heading but provides no evidence of public rendering — only the harness runner's internal receipt output.

All other eight requirements are fully verified with direct codebase evidence.

---

_Verified: 2026-06-09_
_Verifier: Claude (gsd-verifier)_
