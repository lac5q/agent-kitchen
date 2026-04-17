---
phase: 19-sqlite-conversation-store
plan: 02
subsystem: recall-api
tags: [sqlite, fts5, jsonl, ingestion, api-routes, tdd, vitest]

requires:
  - 19-01 (getDb() singleton, messages/messages_fts/ingest_meta/meta tables)

provides:
  - ingestAllSessions() incremental JSONL scan with mtime+size skip logic
  - recallByKeyword() FTS5 phrase match with plain fallback, limit capped at 100
  - deriveAgentId() decodes Claude project directory names to human-readable IDs
  - extractContent() extracts text blocks only, skips thinking/tool_use blocks
  - GET /api/recall?q=keyword&limit=N — FTS5 recall endpoint
  - POST /api/recall/ingest — triggers incremental ingestion, returns stats
  - GET /api/recall/stats — rowCount, lastIngest, lastRecallQuery, dbSizeBytes

affects:
  - 19-03 (Ledger UI panel calls /api/recall/stats and POST /api/recall/ingest)
  - 19-04 (any agent integration consuming /api/recall?q=)

tech-stack:
  added: []
  patterns:
    - "FTS5 phrase match with plain-query fallback (T-19-03 mitigation)"
    - "limit capped at 100 server-side (T-19-04 DoS mitigation)"
    - "mtime_ms + file_size incremental skip (avoids 1.2 GB re-parse)"
    - "INSERT OR IGNORE for dedup via UNIQUE(session_id, request_id)"
    - "All ingest I/O uses synchronous fs (better-sqlite3 sync pattern)"

key-files:
  created:
    - src/lib/db-ingest.ts
    - src/lib/__tests__/db-ingest.test.ts
    - src/app/api/recall/route.ts
    - src/app/api/recall/ingest/route.ts
    - src/app/api/recall/stats/route.ts
    - src/app/api/recall/__tests__/route.test.ts
  modified: []

key-decisions:
  - "deriveAgentId uses -- as literal-dash sentinel and - as separator; path depth 4 assumed for project name extraction (index 3 onward joined with -)"
  - "recallByKeyword wraps query in double quotes for phrase match first; falls back to plain query on zero results (not on error)"
  - "FTS5 syntax errors caught with try/catch on both phrase and plain attempts — return empty array"
  - "Route handler uses req.nextUrl ?? new URL(req.url) for test compatibility (NextRequest.nextUrl absent in plain Request)"
  - "ingestAllSessions is fully synchronous (fs.readFileSync + better-sqlite3 transaction) — no Promise overhead"

requirements-completed:
  - SQLDB-01
  - SQLDB-02

duration: 25min
completed: 2026-04-17
---

# Phase 19 Plan 02: JSONL Ingestion Engine and Recall API Summary

**FTS5-backed JSONL ingestion engine with incremental mtime+size skip logic, phrase-match recall query, and three API routes: GET /api/recall, POST /api/recall/ingest, GET /api/recall/stats**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-04-17
- **Tasks:** 2
- **Files created:** 6
- **Tests:** 21 passing (14 ingestion + 7 route)

## Accomplishments

- `deriveAgentId()` correctly decodes Claude project directory names (e.g., `-Users-jdoe-github-agent-kitchen` → `agent-kitchen`), handles `--` literal-dash encoding and `paperclip` fast-path
- `extractContent()` filters content per type: text blocks only for user/assistant; thinking/tool_use/system blocks all excluded
- `ingestAllSessions()` scans `CLAUDE_MEMORY_PATH`, skips unchanged files via mtime+size comparison, wraps inserts in transactions for performance, updates `last_ingest_ts` in meta table
- `recallByKeyword()` attempts phrase match first, falls back to plain match on zero results; catches FTS5 syntax errors; caps limit at 100
- Three API routes fully wired to the DB singleton and ingestion engine
- 21 tests pass; 14 cover ingestion pipeline behaviors, 7 cover route response shapes

## Task Commits

1. **Task 1: JSONL ingestion engine with TDD** - `4c5bc16` (feat)
2. **Task 2: Recall, ingest, and stats API routes** - `3cc2b43` (feat)

## Files Created

- `src/lib/db-ingest.ts` — exports: `deriveAgentId`, `extractContent`, `ingestFile`, `ingestAllSessions`, `recallByKeyword`, `RecallResult`
- `src/lib/__tests__/db-ingest.test.ts` — 14 tests covering all 12 plan behaviors + 2 error cases
- `src/app/api/recall/route.ts` — GET /api/recall?q=keyword (persists last_recall_query, returns ranked results)
- `src/app/api/recall/ingest/route.ts` — POST /api/recall/ingest (returns filesProcessed/rowsInserted/filesSkipped)
- `src/app/api/recall/stats/route.ts` — GET /api/recall/stats (returns rowCount/lastIngest/lastRecallQuery/dbSizeBytes)
- `src/app/api/recall/__tests__/route.test.ts` — 7 tests covering all three routes

## Decisions Made

- **`deriveAgentId` path depth:** Claude encodes project paths as `--` (literal dash) and `-` (separator). Project name is everything at path depth >= 4 joined with `-`. Paperclip directories fast-path to `"paperclip"`.
- **Phrase match strategy:** `recallByKeyword` wraps query in `"..."` for FTS5 phrase match first; retries plain query if zero results. Both attempts catch FTS5 syntax errors and return `[]`.
- **Route test compatibility:** `NextRequest.nextUrl` is absent when using plain `Request` in Vitest. Routes use `req.nextUrl ?? new URL(req.url)` to support both test and production execution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] npm packages not installed in worktree**
- **Found during:** Task 1 GREEN phase
- **Issue:** `better-sqlite3` was in `package.json` (from Plan 01 commit) but `node_modules` was not populated in this git worktree
- **Fix:** Ran `npm install --prefer-offline` in the worktree directory
- **Files modified:** node_modules/ (populated, not committed)
- **Commit:** n/a (npm install does not produce a git commit for node_modules)

**2. [Rule 1 - Bug] NextRequest.nextUrl unavailable in Vitest plain Request**
- **Found during:** Task 2 GREEN phase
- **Issue:** Test passed `new Request(url)` but route accessed `req.nextUrl.searchParams`, causing `TypeError: Cannot read properties of undefined`
- **Fix:** Changed route to `req.nextUrl ?? new URL(req.url)` — works in both production (NextRequest has nextUrl) and test (falls back to URL constructor)
- **Files modified:** `src/app/api/recall/route.ts`
- **Commit:** included in `3cc2b43`

## Known Stubs

None — all API routes return live data from the SQLite DB.

## Threat Surface

All threat mitigations from the plan's threat model were implemented:

| Threat | Mitigation Applied |
|--------|-------------------|
| T-19-03 FTS5 injection | Query wrapped in `"..."` phrase match; plain fallback; both catch SQLite syntax errors |
| T-19-04 DoS via unbounded limit | `Math.min(limit, 100)` in `recallByKeyword` |
| T-19-05 Path traversal in ingest | `ingestAllSessions` uses `fs.readdirSync(CLAUDE_MEMORY_PATH)` only — no user-supplied paths |
| T-19-06 Large content in responses | Content truncated to 8000 chars at ingest; FTS5 `snippet()` further limits to 32 tokens |

---

## Self-Check: PASSED

Files exist:
- FOUND: src/lib/db-ingest.ts
- FOUND: src/lib/__tests__/db-ingest.test.ts
- FOUND: src/app/api/recall/route.ts
- FOUND: src/app/api/recall/ingest/route.ts
- FOUND: src/app/api/recall/stats/route.ts
- FOUND: src/app/api/recall/__tests__/route.test.ts

Commits exist:
- FOUND: 4c5bc16 (Task 1)
- FOUND: 3cc2b43 (Task 2)

Tests: 21 passing, 0 failing

*Phase: 19-sqlite-conversation-store*
*Completed: 2026-04-17*
