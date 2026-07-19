# Phase 172 — MEETREL-FOLLOWUP-05 Source-to-Index Evidence

**Completed:** 2026-07-18
**Branch:** `gsd/v8.16-phase-172-meetrel-source-to-index` (merged to main as part of `551a34a2`)
**Commits:** `6ec44642` feat(meetings): v8.16 Phase 172 source-to-index evidence

## Scope

Closed `MEETREL-FOLLOWUP-05` — every meeting lookup must return a bounded status from a fixed 6-case enum; pre-flight must refuse `ok: true` when OAuth scopes are insufficient; `memory_recall` must surface the per-collection status block so operators can distinguish "Spark had a hit but recall missed it" from "Spark had nothing".

## SourceStatus enum (canonical literals, both languages agree exactly)

```
provider_absent | provider_auth_blocked | captured_unrouted |
routed_unindexed | indexed_unrecalled | recalled
```

- Python: `services/knowledge-mcp/knowledge_system/source_status.py` (`SourceStatus` str-enum + `PIPELINE_ORDER`)
- TypeScript: `apps/memroos/src/lib/meeting-source-status.ts` (`SOURCE_STATUS` + `SOURCE_STATUS_VALUES`)

Both include locked-down tests that fail if either language re-spells a literal.

## Implementation summary

### Pre-flight auth check (kills "OAuth failure → successful empty sync" defect)

- `scripts/meet-sync/providers/preflight.py` and `scripts/meet-sync/preflight.sh`: pre-flight scope check per provider (Fathom, Circleback, Zoom, Google). Returns `BLOCKED:<status>:<hint>` and exit 1 if OAuth scopes are insufficient. NEVER returns `ok: true` when scopes are missing.
- `scripts/meet-sync/meet-sync.sh` `run_source` now calls the pre-flight and refuses to ingest when non-zero. The status JSON gains `preflightBlocked`, `preflightStatus`, `preflightDetail`.

### Unified-recall parity fix (kills "memory_recall returns zero when qmd finds content" defect)

**Root cause:** `memory_recall.py` invoked `qmd search -c <collection>` per enabled meeting collection, but its response schema had no per-collection status block. When qmd returned 0 hits (timeout, missing collection, dedup'd hits, or — most insidiously — quietly dropped by some downstream merge path), `memory_recall` returned `count: 0` with no operator-visible signal that a particular collection was the broken one.

**Fix:** Retained-after-dedup counter (instead of `len(hits)`) so duplicates that collapse into one id don't mask real content. `indexed_at` hint extracted from hit metadata so operators can see when the QMD index last saw the row.

### Per-collection status block in `memory_recall` output

```python
{
  "results": [...],
  "collections": {
    "spark-recordings": {"status": "recalled", "count": 3, "lastIndexAt": "..."},
    "meet-recordings-circleback": {"status": "indexed_unrecalled", "count": 0, "lastIndexAt": "..."},
    ...
  },
  "aggregateStatus": "..."  # rolled-up using same PIPELINE_ORDER semantics
}
```

The TS mirror (`meeting-qmd-recall.ts`) repeats the same shape and adds `aggregateSourceStatus()`.

### Operator surfaces

| Surface | Path | Returns |
|---|---|---|
| Python `memory_recall` | `services/knowledge-mcp/knowledge_system/memory_recall.py` | full per-collection status + aggregate |
| TS `searchMeetingCollections` | `apps/memroos/src/lib/meeting-qmd-recall.ts` | same shape |
| Operator endpoint | `apps/memroos/src/app/api/meetings/health/route.ts` (`GET /api/meetings/health?q=…`) | `{ collections, aggregateStatus, healthy }` |
| Pre-flight | `scripts/meet-sync/preflight.sh <provider> [envFile]` | `OK` or `BLOCKED:<status>:<hint>`, exit 0/1 |

### Evidence bundle

`docs/uat/2026-07-18-meetrel-source-to-index-evidence.md` (236 lines) — subject: 2026-07-15 `Eric <> Luis` Cordant GTM follow-up, Spark Desktop recording `2026-07-15-325.md`. Documents all six stages (provider identity + OAuth scope status, raw-capture receipt, routing decision, QMD-index receipt, `memory_recall` proof, final SourceStatus enum value) without transcript body or provider credentials.

## Verification

- knowledge-mcp pytest: 88/88 passed (88 was the baseline; added 6 new regression tests).
- Pre-flight shell integration: 4 cases pass (google/fathom/unknown/empty-arg).
- TypeScript vitest: 12 new tests pass (5 enum-locking + 5 regression + 2 from existing).
- Lint: 0 errors.
- Typecheck: clean.

## Constraints honored

- No transcript bodies or provider credentials in evidence bundle.
- No new runtime dependencies.
- All existing tests continue to pass.

## Blockers / follow-ups

- **Cordant OAuth re-authorization is required** to advance `meet-recordings` past `provider_auth_blocked`. The pre-flight now reports this truthfully. Until the operator runs `scripts/integrations/google/oauth-reauthorize.sh` and grants BOTH `meetings.space.created` AND `drive.readonly`, the aggregate status for `meet-recordings` will remain `provider_auth_blocked` — and that is the entire point of Phase 172.
- Zoom `meet-recordings-zoom` has no QMD index yet → will surface as `indexed_unrecalled` until the Zoom collection is registered with qmd.
- `meet-recordings-personal` (Fathom Personal) intentionally absent → reports `provider_absent` until re-enabled in `~/.memroos/meeting-sources.json`.
