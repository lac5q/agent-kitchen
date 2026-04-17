---
phase: 19-sqlite-conversation-store
plan: 01
subsystem: database
tags: [sqlite, better-sqlite3, fts5, next.js, vitest, tdd]

requires: []
provides:
  - better-sqlite3 installed and excluded from Next.js webpack bundling
  - SQLITE_DB_PATH constant exported from src/lib/constants.ts
  - getDb() singleton returning WAL-mode SQLite Database with full schema
  - initSchema() creating messages, messages_fts FTS5, ingest_meta, meta tables
  - closeDb() for test teardown
affects:
  - 19-02 (recall API depends on getDb())
  - 19-03 (ingest route depends on getDb(), ingest_meta table)
  - 19-04 (ledger dashboard depends on recall/stats endpoint)
  - 20-hive-mind (hive_mind table will be added to same DB file)

tech-stack:
  added:
    - better-sqlite3 12.9.0 (synchronous SQLite driver with FTS5)
    - "@types/better-sqlite3 (TypeScript types)"
  patterns:
    - DB singleton via module-level variable + lazy init in getDb()
    - FTS5 external-content table (messages_fts) backed by messages table
    - AFTER INSERT trigger to keep FTS index in sync
    - Plain string SQLITE_DB_PATH in constants.ts (no path import — safe for client bundle)
    - path.resolve(process.cwd(), SQLITE_DB_PATH) resolution in db.ts only

key-files:
  created:
    - src/lib/db.ts
    - src/lib/db-schema.ts
    - src/lib/__tests__/db.test.ts
  modified:
    - next.config.ts
    - src/lib/constants.ts
    - package.json

key-decisions:
  - "SQLITE_DB_PATH stored as plain string in constants.ts (not path.join) — file is also client-imported; path resolution happens in db.ts only"
  - "serverExternalPackages (not experimental.serverComponentsExternalPackages) — confirmed from local Next.js 16 docs"
  - "better-sqlite3 synchronous API chosen over node-sqlite3 async — fits Next.js Route Handlers without Promise chain complexity"
  - "FTS5 external-content table (content=messages) avoids duplicating large text in FTS index"
  - "unicode61 tokenizer chosen over porter — porter stems code identifiers badly"
  - "WAL + NORMAL sync pragma set immediately after DB open for concurrent reader support"

patterns-established:
  - "Pattern: DB singleton — call getDb() everywhere server-side; never open Database() directly"
  - "Pattern: closeDb() for test teardown only — never call in production paths"
  - "Pattern: initSchema() idempotent via CREATE IF NOT EXISTS — safe to call on every startup"

requirements-completed:
  - SQLDB-03

duration: 18min
completed: 2026-04-16
---

# Phase 19 Plan 01: SQLite Foundation Summary

**better-sqlite3 DB layer with WAL mode, FTS5 external-content table (messages_fts), incremental ingest tracking table (ingest_meta), and meta key-value table — all initialized via singleton getDb()**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-16T23:38:00Z
- **Completed:** 2026-04-16T23:56:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- better-sqlite3 12.9.0 installed and excluded from Next.js webpack bundling via `serverExternalPackages`
- DB singleton (`getDb()`) opens WAL-mode SQLite at configured path, creates all 4 tables + FTS5 virtual table + trigger on first call
- SQLITE_DB_PATH constant exported from constants.ts as plain string (client-safe); path resolution happens in db.ts
- 6 unit tests cover singleton behavior, WAL mode, table presence, and column schema — all passing

## Task Commits

1. **Task 1: Install better-sqlite3 and configure Next.js** - `8aba208` (feat)
2. **Task 2 RED: Failing tests for DB singleton and schema** - `1ddb831` (test)
3. **Task 2 GREEN: DB singleton, schema, and SQLITE_DB_PATH constant** - `642aea5` (feat)

## Files Created/Modified

- `next.config.ts` - added `serverExternalPackages: ['better-sqlite3']`
- `src/lib/constants.ts` - appended `SQLITE_DB_PATH` export (plain string, client-safe)
- `src/lib/db.ts` - `getDb()` singleton with WAL pragma + schema init; `closeDb()` for tests
- `src/lib/db-schema.ts` - `initSchema()` DDL for messages, messages_fts FTS5, ingest_meta, meta tables + AFTER INSERT trigger
- `src/lib/__tests__/db.test.ts` - 6 unit tests with `@vitest-environment node`, isolated temp dir
- `package.json` / `package-lock.json` - better-sqlite3 + @types/better-sqlite3 added

## Decisions Made

- **SQLITE_DB_PATH as plain string:** constants.ts is imported client-side. Using `path.join()` would require importing `path`, which fails in the browser bundle. Plain string `'data/conversations.db'` is resolved to absolute path in `db.ts` via `path.resolve(process.cwd(), SQLITE_DB_PATH)`.
- **`@vitest-environment node` directive:** Global vitest config uses jsdom environment. better-sqlite3 is a native Node module that cannot load in jsdom. The directive overrides per-file.
- **FTS5 external content:** `messages_fts` uses `content=messages, content_rowid=id` so text is not duplicated in the FTS index. AFTER INSERT trigger keeps them in sync. DELETE is handled by INSERT OR IGNORE dedup strategy (Plan 02).

## Deviations from Plan

None - plan executed exactly as written. The `@vitest-environment node` directive was noted by advisor pre-execution and applied proactively (not a deviation, just correct implementation).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. DB file created automatically at `data/conversations.db` on first `getDb()` call.

## Next Phase Readiness

- Plan 02 (recall API + ingest route) can import `getDb()` directly from `src/lib/db`
- `ingest_meta` table ready for incremental JSONL ingestion tracking
- `messages_fts` FTS5 table + trigger ready for keyword recall queries
- `meta` table ready for `last_ingest_ts` and `last_recall_query` storage

---
*Phase: 19-sqlite-conversation-store*
*Completed: 2026-04-16*
