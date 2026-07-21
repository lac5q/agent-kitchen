# Phase 178: Notion Provider Coverage — SIBLING STUB

**Phase ID:** 178
**Milestone:** v8.20 Connected Work Memory (sibling phase; opens alongside Phase 176)
**Created:** 2026-07-21
**Status:** STUB — first requirement only; zero adapter code this run
**Author:** Beastmode consolidated session (miniMAX-M3, codex-validator)

## Why a sibling phase (not an amendment to Phase 176)

Per the Fable validator's Round-3 verdict on the Phase 176 / Notion
recommendation (see
`.beastmode/worker-runs/20260721T212216Z-fable-connmem-rec/output.json`):

> "Amending Phase 176 fails on three grounds:
>  1. zero provider research vs Linear/Circleback which each have
>     PROVIDER-COVERAGE-RESEARCH.md;
>  2. no requirement IDs means no traceability into the release gate;
>  3. Phase 176 is marked highest priority and inflating it with an
>     unresearched third provider is exactly how highest-priority
>     phases slip."

So Notion gets its own phase stub now, with the FIRST requirement
being provider-coverage research mirroring the existing
`.planning/phases/176-linear-circleback-unified-memory/PROVIDER-COVERAGE-RESEARCH.md`
pattern.

## Notion requirements (one for now)

### NOTION-01 — Provider coverage research (mirrors provider research doc)

- Produce `.planning/phases/178-notion-provider-coverage/PROVIDER-COVERAGE-RESEARCH.md`
  with the same shape as the Linear/Circleback research doc:
  - Notion data model (databases, pages, blocks, comments)
  - Notion API authentication (internal integration token vs OAuth user
    token) and what each can enumerate (workspace-public vs private)
  - Block-level pagination semantics (cursor-based, nested children)
  - Permission model: which object families are visible to which token
    type, archived/historical page access, deletion propagation
  - Webhook/deletion feed availability (Notion's public surface mentions
    webhooks; document the contract including request verification)
  - Multi-workspace enumeration: can one integration token see every
    workspace it's added to, or only the workspace where it was created
  - Propose CONNMEM-shape readiness: which Notion object families map
    cleanly to the canonical envelope (database ≈ workspace_id; page
    ≈ object_type=page; block ≈ object_type=block)

This mirrors Line 73-78 of the existing Phase 176 plan: research
first, then CONNMEM-IDs, then implementation — and gates Phase 178 on
the research landing.

## Out of scope until NOTION-01 lands

- Notion MCP server wiring (we already configured it as an MCP server
  at `~/.config/mcp/mcp.json` for the universal search tool, but
  CONNMEM ingestion is a separate adapter and waits on the research)
- Notion → canonical envelope adapter code
- Notion → sync ledger projection
- Notion → memory_recall wiring

## Status markers

- `planned` — stub exists, no requirements met
- `in-progress` — NOTION-01 in flight
- `partial-closure` — research done, adapter in flight
- `closed` — Notion end-to-end ingestion with capability manifest

## Cross-refs

- `.planning/ROADMAP.md` — top-level status row for v8.20 (sibling)
- `.planning/phases/176-linear-circleback-unified-memory/176-01-PLAN.md` — sibling plan
- `.planning/phases/176-linear-circleback-unified-memory/PROVIDER-COVERAGE-RESEARCH.md` — pattern to mirror
- `services/connmem/canonical_envelope.py` — the schema Notion will project into
