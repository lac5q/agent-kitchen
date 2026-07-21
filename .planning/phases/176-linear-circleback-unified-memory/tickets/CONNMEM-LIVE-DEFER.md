# CONNMEM-LIVE-DEFER — Tracked ticket for live CONNMEM backfill

**Ticket ID:** CONNMEM-LIVE-DEFER
**Type:** acceptance-deferral
**Phase:** 176 / v8.20
**Created:** 2026-07-21 (beastmode consolidated session)
**Owner:** Luis / whoever holds the live-backfill credentials
**Status:** OPEN
**Target:** CONNMEM-10 release gate (NOT CONNMEM-08 — the gate is the
final sub-ID per the canonical plan; CONNMEM-08 is authorization /
privacy / retention / deletion. The earlier draft of this ticket
incorrectly named CONNMEM-08; corrected by this commit per validator
feedback.)

## What this ticket defers

Phase 176 release gate (**CONNMEM-10**, per the plan file
`176-01-PLAN.md` line 129) requires live provider-total
reconciliation: the operator must be able to say "entire company
indexed" only when the ledger reconciles provider totals against
fetched/unique/filtered/failed/tombstoned/indexed counts for every
approved provider.

The Phase 176 first session that landed on `install-repro-connmem-bridge`
shipped **CONNMEM-02** (canonical envelope + sync ledger schemas) and
**CONNMEM-04-prep** (Linear GraphQL SDL stub with doc-derived provenance).
It did NOT ship:

- **CONNMEM-03** — Circleback adapter extension to project through the
  envelope; current `circleback_ingest.py` writes idempotent markdown
  directly into `meet-recordings-circleback` but does NOT route through
  the canonical envelope yet (no path at
  `services/connmem/circleback_adapter.py`)
- **CONNMEM-04** — Linear adapter implementation (multi-workspace
  GraphQL, capability discovery, signed webhook handling)
- **CONNMEM-05..07** — Linear reconciliation + operator surfaces +
  recall tests + comprehensive ledger integration (Circleback flows
  feed the same surfaces; Notion is OUT of Phase 176 — see Phase 178)
- **CONNMEM-08** — Authorization, privacy, retention, deletion
  (NOT the release gate — that's CONNMEM-10)
- **CONNMEM-09** — Operator controls and observability
- **CONNMEM-10** — Tests, backfill proof, release gate (the gate this
  ticket defers)

The blockers for completing the above are:

- **Circleback CLI not installed** on cordant-hermes-01 (`circleback:
  command not found`).
- **No API keys** on cordant-hermes-01's `.env`: no `CIRCLEBACK_*`,
  no `LINEAR_*`.
  - (Notion's keys are NOT a Phase 176 blocker — Notion is the
    Phase 178 sibling phase and is correctly fenced out of this
    ticket.)
- **Circleback tenant-visibility unproven** — the SDK CLI may only see
  meetings shared with the authenticated user, not the whole
  workspace. Until capability-discovery runs, the release gate is
  not decidable.
- **Linear introspection requires a personal API key or OAuth token.**
  Vendored SDL is doc-derived; live introspection is queued for
  Session 2.

Phase 176 first session deliverables already shipped on
`install-repro-connmem-bridge`:
- canonical envelope + sync ledger schemas (tests: 33/33 GREEN,
  including 7 new tests for cursor/retry/tombstone booleans)
- Linear doc-derived SDL stub at `references/linear/SDL-STUBS.graphql`
- doc-derived Linear fixture at
  `scripts/connmem/fixtures/linear/__init__.py`

File paths of the NOT-YET-BUILT modules (Session 2 build targets):
- `services/connmem/circleback_adapter.py` — CONNMEM-03
- `services/connmem/linear_adapter.py` — CONNMEM-04
- `services/connmem/release_gate.py` — CONNMEM-10

The doc-derived fixture has known limitations flagged by the verifier
that must be reconciled when CONNMEM-04 lands:
- doc-derived SDL fields/nullability can drift from live introspection
- `workspace_id` mapped to Linear team key; live may need organization/workspace
  scope instead
- fixture's expected canonical payload uses `null` content_hash and
  captured_at values, which are NOT valid CanonicalRecord until the
  adapter's projection step fills them in

## What's required to close this ticket

Either (a) run the destructive live backfill, OR (b) get the deferred
items signed off by the operator as accepted residual.

### Path (a) — live backfill

1. Provide:
   - `CIRCLEBACK_API_TOKEN` or install the Circleback CLI auth on
     cordant-hermes-01.
   - `LINEAR_API_KEY` (personal) OR `LINEAR_OAUTH_*` (company-managed).
2. Run `services/connmem/circleback_adapter.py ingest --since 2024-01-01`
   (Session 3).
3. Run `services/connmem/linear_adapter.py ingest --orgid <linear_org>`
   (Session 3, after the Linear adapter is built against live SDL).
4. For each provider, capture a capability manifest and reconcile the
   ledger.
5. Re-run `services/connmem/release_gate.py --strict` and verify the
   CONNMEM-10 release gate transitions from `unknown-provider-capability`
   to `green`. (The operator UI must say "entire company indexed" only
   when this is green per the CONNMEM-10 acceptance criteria.)

### Path (b) — accepted-residual

1. Document each accepted gap (e.g., "Circleback tenant visibility
   unclear; deferred to admin/team API engagement").
2. Sign-off from the operator that the gaps don't block the current
   use case.
3. Update ROADMAP to mark the gate as `accepted-residual` rather
   than `green`.

## Sub-IDs dependent on this ticket

- **CONNMEM-10 release gate** — blocked until both paths close.
- **Phase 176 final closure** (currently `planned — highest priority`)
  — moves to `partial closure` or `complete` based on chosen path.

## Why this is acceptable as a tracked deferral

The schemas, fixtures, and SDL vendoring (this session's deliverables)
are deployable and testable without secrets. The adapter code paths are
correctly stubbed where live keys would go. The release-gate live
reconciliation is genuinely the last step of Phase 176 and remains
gated by an env constraint (no keys), not by a code defect.

## Cross-references

- `.planning/phases/176-linear-circleback-unified-memory/176-01-PLAN.md` — canonical ID map (CONNMEM-01..10)
- `.planning/phases/176-linear-circleback-unified-memory/176-02-FIRST-SESSION.md` — first-session companion plan
- `.planning/phases/178-notion-provider-coverage/SIBLING-STUB.md` — sibling phase, NOTION-01 research is the gate for any Notion work
