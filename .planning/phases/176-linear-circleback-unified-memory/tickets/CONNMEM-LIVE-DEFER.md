# CONNMEM-LIVE-DEFER — Tracked ticket for live CONNMEM backfill

**Ticket ID:** CONNMEM-LIVE-DEFER
**Type:** acceptance-deferral
**Phase:** 176 / v8.20
**Created:** 2026-07-21 (beastmode consolidated session)
**Owner:** Luis / whoever holds the live-backfill credentials
**Status:** OPEN

## What this ticket defers

Phase 176 release gate (CONNMEM-08) requires live provider-total
reconciliation: the operator must be able to say "entire company
indexed" only when the ledger reconciles provider totals against
fetched/unique/filtered/failed/tombstoned/indexed counts for every
approved provider. The session that landed CONNMEM-02 + 03 + 04
(schemas, Circleback extension, Linear SDL vendoring) did NOT run
live backfill because:

- **Circleback CLI not installed** on cordant-hermes-01 (`circleback: command not found`).
- **No API keys** on cordant-hermes-01's `.env`: no `CIRCLEBACK_*`,
  no `LINEAR_*`, no `NOTION_*`.
- **Circleback tenant-visibility unproven** — the SDK CLI may only see
  meetings shared with the authenticated user, not the whole
  workspace. Until capability-discovery runs, the release gate is
  not decidable.
- **Linear introspection requires a personal API key or OAuth token.**
  Vendored SDL is doc-derived; live introspection is queued for
  Session 2.
- **Notion sibling phase** is scaffolded only (see
  `.planning/phases/178-notion-provider-coverage/SIBLING-STUB.md`).
- **Phase 176 first session deliverables already shipped** on
  `install-repro-connmem-bridge`:
  - canonical envelope + sync ledger schemas (tests: 26/26 GREEN)
  - Linear doc-derived SDL stub at `references/linear/SDL-STUBS.graphql`
  - doc-derived Linear fixture at
    `scripts/connmem/fixtures/linear/__init__.py`

## What's required to close this ticket

Either (a) run the destructive live backfill, OR (b) get the deferred
items signed off by the operator as accepted residual.

### Path (a) — live backfill

1. Provide:
   - `CIRCLEBACK_API_TOKEN` or install the Circleback CLI auth on
     cordant-hermes-01.
   - `LINEAR_API_KEY` (personal) OR `LINEAR_OAUTH_*` (company-managed).
   - `NOTION_API_KEY` for Notion ingestion (separate sibling phase).
2. Run `services/connmem/circleback_adapter.py ingest --since 2024-01-01`
   (Session 3).
3. Run `services/connmem/linear_adapter.py ingest --orgid <linear_org>`
   (Session 3, after the Linear adapter is built against live SDL).
4. For each provider, capture a capability manifest and reconcile the
   ledger.
5. Re-run `services/connmem/release_gate.py --strict` and verify "entire
   company indexed" transitions from `unknown-provider-capability` to
   `green`.

### Path (b) — accepted-residual

1. Document each accepted gap (e.g., "Circleback tenant visibility
   unclear; deferred to admin/team API engagement").
2. Sign-off from the operator that the gaps don't block the current
   use case.
3. Update ROADMAP to mark the gate as `accepted-residual` rather
   than `green`.

## Sub-IDs dependent on this ticket

- **CONNMEM-08 release gate** — blocked until both paths close.
- **Phase 176 final closure** (currently `planned — highest priority`)
  — moves to `partial closure` or `complete` based on chosen path.

## Why this is acceptable as a tracked deferral

The schemas, fixtures, and SDL vendoring (this session's deliverables)
are deployable and testable without secrets. The adapter code paths are
correctly stubbed where live keys would go. The release-gate live
reconciliation is genuinely the last step of Phase 176 and remains
gated by an env constraint (no keys), not by a code defect.
