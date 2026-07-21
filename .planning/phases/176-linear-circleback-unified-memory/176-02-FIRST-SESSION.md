# Phase 176 First-Session Plan: CONNMEM-02 + -04 Prep Landed

**Phase ID:** 176 / v8.20 Connected Work Memory (first session)
**Branch:** `install-repro-connmem-bridge`
**Date:** 2026-07-21
**Status:** PARTIAL CLOSURE — schemas + Linear SDL landed; adapter implementations deferred to CONNMEM-LIVE-DEFER

## Goal

Land the architecturally-scoped CONNMEM-02 (canonical envelope + sync
ledger schemas) with frozen contract tests, vendored Linear GraphQL SDL
with provenance-tagged fixtures, and the GSD siblings (CONNMEM-LIVE-DEFER
ticket + Notion sibling-phase stub).

NOT in scope this session: Circleback extension to project through the
envelope (call this out specifically — separate commit, deferred to keep
the session within Fable's prior 6-8 commit guidance), memory_recall
wiring switch, and full Linear adapter implementation.

## Sub-IDs landed this session

- **CONNMEM-02** — canonical envelope + sync ledger schemas
  - `services/connmem/canonical_envelope.py` — frozen 16-field dataclass
  - `services/connmem/sync_ledger.py` — SQLite-backed ledger mirroring
    the memory_recall six-state enum
  - 26/26 contract tests green

- **CONNMEM-04-prep** — Linear vendor + provenance
  - `references/linear/SCHEMA-PROVENANCE.md` — provenance vocabulary
  - `references/linear/SDL-STUBS.graphql` — doc-derived SDL stub
  - `scripts/connmem/fixtures/linear/__init__.py` — `PROVENANCE_TAG='doc-derived'`
    fixture with Linear issue shape + expected canonical projection

## Sub-IDs deferred

- **CONNMEM-03** (Circleback adapter extension) — next session, ~30 LOC
- **CONNMEM-04** (Linear adapter, multi-workspace) — Session 2
- **CONNMEM-05..07** (Linear webhooks, reconciliation, comprehensive ledger)
  — Session 2+
- **CONNMEM-03** (Circleback adapter extension to envelope + dedupe) —
  Session 2
- **CONNMEM-04** (Linear adapter implementation, multi-workspace) —
  Session 2 against live SDL
- **CONNMEM-05..09** (reconciliation, operator surfaces, recall tests) —
  Session 2+
- **CONNMEM-10** (release gate live reconciliation) — CONNMEM-LIVE-DEFER
- **NOTION-01** (Phase 178 research) — sibling phase stub gates this
  (Notion is OUT of Phase 176 scope; Notion keys are NOT a Phase 176
  blocker per the sibling-phase pattern of `.planning/phases/178-.../SIBLING-STUB.md`)

## Verifier pass

Run `bin/beast-validator` on the diff vs origin/main. The current validator
is codex gpt-5.6-terra HIGH (substituting for claude-fable-5, Anthropic API
credits exhausted; see `.beastmode/learnings/2026-07-21-fable-credits-depleted.md`).

Acceptance:
- verifier returns PASS on schema correctness, fixture provenance tagging,
  GSD sibling structure, scope discipline (no Notion adapter code)
- no regressions on existing install-regression --fast (9/9 still green)
- vitest fast on apps/memroos still 3373/3373 (no app-code changes this session)

## Cross-refs

- 176-01-PLAN.md — the original 10-CONNMEM plan
- PROVIDER-COVERAGE-RESEARCH.md — Linear/Circleback research (NOTION-01
  will mirror this in Phase 178)
- tickets/CONNMEM-LIVE-DEFER.md — debt for live backfill
- ../178-notion-provider-coverage/SIBLING-STUB.md — sibling phase stub
