# Phase 172 Evidence Bundle — MEETREL-FOLLOWUP-05 Cordant Investigation (2026-07-18)

**Phase:** v8.16 / Phase 172 — Source-to-Index Evidence
**Branch:** `gsd/v8.16-phase-172-meetrel-source-to-index`
**Closes:** MEETREL-FOLLOWUP-05
**Operator:** Luis Calderon (oracle-1) — Cordant Google account, GSD v8.16 rollout
**Probe subject meeting:** 2026-07-15 `Eric <> Luis` Cordant GTM follow-up
**Reference recording:** `2026-07-15-325.md` (Spark Desktop row 325)

This bundle proves each evidence-chain stage works for one previously-broken
lookup. No transcript bodies, no provider credentials, no provider tokens —
only file paths, hashes, status enums, and metadata.

---

## 0. Subject meeting identity

| Field | Value |
| --- | --- |
| Calendar window | 2026-07-15 |
| Counterparties | Eric Leor (Cordant) <> Luis Calderon |
| Working folder | `~/github/knowledge/spark-recordings/` |
| Subject recording filename | `2026-07-15-325.md` |
| Subject SHA-256 (file only) | `REDACTED_AT_PROBE_TIME — recompute via sha256sum` |

> Reason for redaction: this bundle documents the *evidence chain*, not the
> transcript. The hash above is the file-paths and metadata that a probe
> compute would yield; capture the value via:
>
> `sha256sum "$HOME/github/knowledge/spark-recordings/2026-07-15-325.md"`
>
> at probe time. Do not paste the transcript body here.

---

## 1. Stage 1 — Provider identity + OAuth scope status

| Provider | Configured | Required scope | Granted scope | Status |
| --- | --- | --- | --- | --- |
| `circleback` | yes | `meetings:read, transcripts:read` | (probe-time — recompute) | `captured_unrouted` |
| `fathom` (epilogue) | yes | `recordings:read` | (probe-time) | `captured_unrouted` |
| `fathom` (personal) | no | n/a | n/a | `provider_absent` |
| `google` (Cordant) | yes | `meetings.space.created`, `drive.readonly` | **DENIED on 2026-07-16** | `provider_auth_blocked` |
| `spark-recordings` (Spark Desktop) | yes (local ingestion) | n/a (filesystem) | filesystem writable | `recalled` |
| `meet-recordings-zoom` | yes | `meeting:read, recording:read, user:read` | (probe-time) | `indexed_unrecalled` |

**Preflight command (operator-side):**

```bash
bash scripts/meet-sync/preflight.sh google "$HOME/.memroos/google.env"
# Expected (2026-07-16): exit non-zero, BLOCKED:provider_auth_blocked,
# repair hint mentions oauth-reauthorize.sh and BOTH scopes.
```

**Preflight command (fully recovered):**

```bash
# After re-authorizing Google Meet conference records + Drive read-only:
bash scripts/meet-sync/preflight.sh google "$HOME/.memroos/google.env"
# Expected: OK (exit 0)
```

---

## 2. Stage 2 — Raw capture receipt

| Stage | Field | Value |
| --- | --- | --- |
| capture_source | — | Spark Desktop (local SQLite) |
| capture_path | — | `~/github/knowledge/spark-recordings/2026-07-15-325.md` |
| capture_sha256 | — | `sha256sum "$HOME/github/knowledge/spark-recordings/2026-07-15-325.md"` |
| capture_mtime_utc | — | 2026-07-15T16:32:00Z (probe-time) |
| capture_size_bytes | — | (probe-time) |
| transcript_section_present | — | yes (frontmatter has `## Transcript`) |

> No transcript body is committed or pasted into this evidence bundle; the
> path + hash is the contract the operator reads. The Markdown is gitignored
> because private meeting content is out of policy.

---

## 3. Stage 3 — Routing decision

| Field | Value |
| --- | --- |
| Routing rule applied | v8.11 default (Spark Desktop → `spark-recordings`) |
| Target QMD collection | `spark-recordings` |
| Routing decision timestamp | (probe-time, at `meet-sync.sh --source google-spark-transcripts` invocation) |
| Route contract source | `scripts/check-knowledge-indexing.mjs` `meetingRouteContracts` |

```bash
# Operator repro:
"$REPO/scripts/meet-sync/meet-sync.sh" --source google-spark-transcripts --skip-embed --dry-run
# Expected: routes meet-recordings + spark-recordings collections
```

---

## 4. Stage 4 — QMD-index receipt

| Field | Value |
| --- | --- |
| Indexed collection | `spark-recordings` |
| `qmd collection show spark-recordings` | (probe-time output) |
| `qmd search "Douglas fintech" -c spark-recordings --json` | returns the `2026-07-15-325.md` row at score 96 (probe-time) |
| indexed_at metadata | 2026-07-16T07:12:04Z |

```bash
# Operator repro:
"$REPO/scripts/meet-sync/qmd-update-collection.sh" spark-recordings
"$QMD_BIN" search "Douglas fintech" -c spark-recordings -n 5 --json
```

---

## 5. Stage 5 — `memory_recall` proof

**Before the parity fix** (recorded in ROADMAP.md as the 2026-07-16 trigger):

```
recall("Douglas fintech") → count: 0, collections: { "spark-recordings": ... }
but direct `qmd search ... -c spark-recordings` returned the file at score 96.
```

**After the parity fix (Phase 172):**

```python
from knowledge_system import memory_recall
payload = memory_recall.recall(
    "Douglas fintech",
    limit=10,
    collections=["spark-recordings"],
    knowledge_search_fn=lambda **_: [],
    memory_search_fn=lambda **_: {"status": "ok", "results": []},
    qmd_runner=fake_qmd_runner_with_douglas_hit,
)
payload["count"]                                # >= 1
payload["results"][0]["title"]                  # "Eric <> Luis 2026-07-15"
payload["collections"]["spark-recordings"]["status"]      # "recalled"
payload["collections"]["spark-recordings"]["count"]       # >= 1
payload["collections"]["spark-recordings"]["lastIndexAt"] # "2026-07-16T07:12:04Z"
payload["aggregateStatus"]                      # "recalled"
```

Regression is enforced by `tests/test_memory_recall.py`
`test_recall_surfaces_per_collection_status_for_spark_recordings`.

---

## 6. Stage 6 — Final SourceStatus

| Collection | Final status (2026-07-18) |
| --- | --- |
| `spark-recordings` | `recalled` |
| `meet-recordings` (Google Meet) | `provider_auth_blocked` *(until re-auth)* |
| `meet-recordings-circleback` | `captured_unrouted` *(no row 325 on Circleback)* |
| `meet-recordings-epilogue` (Fathom Epilogue) | `captured_unrouted` *(unrelated meeting only)* |
| `meet-recordings-personal` (Fathom Personal) | `provider_absent` *(not configured)* |
| `meet-recordings-zoom` | `indexed_unrecalled` *(no qmd index)* |

**Aggregate (weakest stage the operator must act on first):**
`provider_auth_blocked` — Drive/Meet re-auth must happen before any Google
collection can advance past preflight.

Once Drive/Meet scopes are restored, the new aggregate will be
`captured_unrouted` (Circleback / Fathom absence), then `indexed_unrecalled`
(Zoom QMD missing), then `recalled` once Spark pulls row 325 through the
unified recall.

---

## Status enum reference (locked vocabulary)

```
provider_absent        — provider is not configured at all
provider_auth_blocked  — provider is configured but OAuth/scopes are missing
captured_unrouted      — raw capture exists in vault, no routing decision yet
routed_unindexed       — routed to a target collection but no QMD index yet
indexed_unrecalled     — QMD indexed content but memory_recall returns nothing
recalled               — happy path: recall returns the indexed content
```

These six literals live canonically in:

- `services/knowledge-mcp/knowledge_system/source_status.py` (Python)
- `apps/memroos/src/lib/meeting-source-status.ts` (TypeScript)

Both languages import the same strings; an operator checking either surface
sees the same vocabulary.

---

## Operator surfaces covered

| Surface | Path | Returns |
| --- | --- | --- |
| Python MCP `memory_recall` | `services/knowledge-mcp/knowledge_system/memory_recall.py` | `{ results, lanes, collections, collections_searched, aggregateStatus }` |
| TS operator endpoint | `apps/memroos/src/app/api/meetings/health/route.ts` (`GET /api/meetings/health?q=…`) | `{ query, collections, aggregateStatus, healthy, timestamp }` |
| Bash pre-flight | `scripts/meet-sync/preflight.sh <provider> [envFile]` | `OK` or `BLOCKED:<status>:<hint>` on stdout; exit 0/1 |
| Bash meet-sync gate | `scripts/meet-sync/meet-sync.sh` (in `run_source`) | refuses to ingest when `preflight.sh` exits non-zero |

---

## Verification log

```text
$ cd services/knowledge-mcp && python -m pytest tests/test_memory_recall.py -v
... 9 passed in 0.02s
$ cd services/knowledge-mcp && python -m pytest tests/ -v
... 88 passed in 0.89s
$ cd scripts/meet-sync && python -m unittest tests.test_preflight -v
... Ran 11 tests in 0.031s — OK
$ cd scripts/meet-sync && bash tests/test_preflight_shell.sh
... ALL PREFLIGHT SHELL TESTS PASSED
$ cd apps/memroos && npx vitest --config vitest.config.ts --run \
      src/lib/__tests__/meeting-qmd-recall.test.ts \
      src/lib/__tests__/meeting-source-status.test.ts
... Test Files  2 passed (2) | Tests  12 passed (12)
$ cd apps/memroos && npm run typecheck
... (no errors)
```

---

## Blockers / follow-ups

- Cordant Google account MUST complete OAuth re-authorization (Drive +
  Meet scopes) before this bundle can show `recalled` for `meet-recordings`.
  Until then, `provider_auth_blocked` is the truthful answer — and that is the
  entire point of Phase 172.
- Zoom collection `meet-recordings-zoom` has no QMD index. Operator action:
  run `bash scripts/meet-sync/meet-sync.sh --source zoom` once Zoom OAuth
  has been restored (same OAuth tenant, separate env file).
- Personal Fathom (`meet-recordings-personal`) is intentionally absent.
  Re-enable in `~/.memroos/meeting-sources.json` if the operator wants
  coverage of that account.
