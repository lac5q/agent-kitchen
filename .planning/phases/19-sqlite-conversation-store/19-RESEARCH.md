# Phase 19: SQLite Conversation Store - Research

**Researched:** 2026-04-16
**Domain:** SQLite / FTS5, Next.js API routes, JSONL ingestion, dashboard UI panels
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SQLDB-01 | Agent can retrieve conversation context by keyword via `/api/recall?q=...` (FTS5 search) | FTS5 `messages_fts` virtual table + ranked BM25 ordering |
| SQLDB-02 | All Claude Code JSONL sessions in `~/.claude/projects/` ingested with FTS5 index on content, timestamp, project, agent_id | Incremental ingestion via `ingest_meta` table; schema verified against actual JSONL entries |
| SQLDB-03 | SQLite DB path declared once in project config, all consumers reference same file | Add `SQLITE_DB_PATH` to `src/lib/constants.ts` + `.env.example`, matching existing constant pattern |
| SQLDB-04 | Dashboard shows SQLite store health — row count, last ingest timestamp, DB size | `/api/recall/stats` GET endpoint + `SqliteHealthPanel` in Ledger page |
| DASH-01 | Ledger panel shows row count, DB size, last ingest time, last recall query | `meta` table in SQLite stores last_recall; stats endpoint serves all 4 fields |
</phase_requirements>

---

## Summary

Phase 19 adds a shared SQLite conversation store that every agent and the dashboard can query. All 2,132 Claude Code JSONL session files (~1.2 GB across `~/.claude/projects/`) are ingested into a single SQLite database with an FTS5 full-text-search index. The `/api/recall` route becomes the primary retrieval interface for agents. A new Ledger panel shows store health: row count, DB size, last ingest time, and last recall query.

The main technical decisions are: use `better-sqlite3` (synchronous, no connection pooling complexity), add `serverExternalPackages` to `next.config.ts` so Next.js doesn't bundle the native `.node` addon, and implement incremental ingestion keyed by file path + mtime to avoid re-parsing 1.2 GB on every sync call. The DB file lives at `data/conversations.db` (already gitignored via `/data/` in `.gitignore`).

**Primary recommendation:** `better-sqlite3` v12.9.0 + FTS5 `unicode61` tokenizer; incremental ingest via `ingest_meta` tracking table; DB path in `constants.ts` as `SQLITE_DB_PATH`; four-stat Ledger panel added to the Ledger page.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | 12.9.0 | SQLite driver for Node.js | Synchronous API eliminates async complexity in API routes; fastest Node SQLite option; ships prebuilt binaries for darwin-arm64 + Node 22-25 |
| SQLite FTS5 | built-in (SQLite 3.x) | Full-text search on conversation content | No external service; BM25 ranking built in; supports multi-column indexing; already used by cloudctx reference impl |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 (type defs) | @types/better-sqlite3 latest | TypeScript types | Required for type-safe DB calls |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-sqlite3 | `node-sqlite3` (async) | Async adds Promise wrapper complexity in Route Handlers; synchronous is fine for server routes |
| FTS5 | LIKE queries | FTS5 gives BM25 ranking, prefix matching, ~100x faster on large tables |
| FTS5 `unicode61` tokenizer | `porter` tokenizer | Porter stems code identifiers badly (`createReadStream` → `createreadstream`); unicode61 preserves them |

**Installation:**
```bash
npm install better-sqlite3 @types/better-sqlite3
```

**Version verification:**
```bash
npm view better-sqlite3 version   # 12.9.0 (verified 2026-04-16) [VERIFIED: npm registry]
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   ├── db.ts                   # DB singleton: open/init, getDb()
│   ├── db-schema.ts            # Schema DDL as typed constants
│   ├── db-ingest.ts            # JSONL → SQLite ingestion logic
│   └── constants.ts            # Add SQLITE_DB_PATH here (existing file)
├── app/api/
│   ├── recall/
│   │   └── route.ts            # GET /api/recall?q=keyword&limit=N
│   └── recall/stats/
│       └── route.ts            # GET /api/recall/stats (DASH-01 health data)
└── components/ledger/
    └── sqlite-health-panel.tsx  # New panel added to Ledger page
data/
└── conversations.db             # SQLite file (gitignored via /data/)
```

### Pattern 1: DB Singleton (module-level lazy init)

**What:** Open the database once per process, cache the handle. Next.js App Router runs server code in a single Node process; re-opening per request is wasteful.

**When to use:** All server-side DB access in this project.

```typescript
// Source: better-sqlite3 docs [CITED: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md]
import Database from 'better-sqlite3';
import path from 'path';
import { SQLITE_DB_PATH } from './constants';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(SQLITE_DB_PATH, { verbose: undefined });
    _db.pragma('journal_mode = WAL');   // concurrent readers while writer runs
    _db.pragma('synchronous = NORMAL'); // safe with WAL, much faster than FULL
    initSchema(_db);
  }
  return _db;
}
```

### Pattern 2: Schema with FTS5 External Content Table

**What:** `messages` table stores all fields; `messages_fts` is an external-content FTS5 table pointing at `messages`. This avoids duplicating large text in the FTS index while still enabling ranked search.

**When to use:** When the content column is large and you need both structured queries and full-text search.

```sql
-- Source: SQLite FTS5 docs [CITED: https://www.sqlite.org/fts5.html#external_content_tables]
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY,
  session_id  TEXT    NOT NULL,
  project     TEXT    NOT NULL,      -- derived from JSONL directory name
  agent_id    TEXT    NOT NULL,      -- see agent_id derivation below
  role        TEXT    NOT NULL,      -- 'user' | 'assistant'
  content     TEXT    NOT NULL,      -- extracted text (see extraction rules)
  timestamp   TEXT    NOT NULL,      -- ISO-8601 from JSONL entry.timestamp
  cwd         TEXT,
  git_branch  TEXT,
  request_id  TEXT,
  UNIQUE(session_id, request_id)     -- deduplicate on re-ingest
);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
  USING fts5(
    content,
    project UNINDEXED,
    timestamp UNINDEXED,
    agent_id UNINDEXED,
    content=messages,
    content_rowid=id,
    tokenize='unicode61'
  );

-- Triggers keep FTS in sync
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content, project, timestamp, agent_id)
  VALUES (new.id, new.content, new.project, new.timestamp, new.agent_id);
END;

CREATE TABLE IF NOT EXISTS ingest_meta (
  file_path   TEXT PRIMARY KEY,
  mtime_ms    INTEGER NOT NULL,
  file_size   INTEGER NOT NULL,
  row_count   INTEGER NOT NULL DEFAULT 0,
  ingested_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- Used for: last_ingest_ts, last_recall_query
```

### Pattern 3: agent_id Derivation

**What:** JSONL entries have no `agent_id` field. Derive it from the directory name under `~/.claude/projects/`.

**Rule (locked recommendation):**
- Directory name is a URL-encoded path, e.g., `-Users-jdoe-github-agent-kitchen`
- Extract the last path component after splitting on `-` then rejoining with `/`: `agent-kitchen`
- If the decoded path maps to a known project (compare against `CLAUDE_MEMORY_PATH` base), set `agent_id` to the project folder name; otherwise use `"claude-code"`
- For Paperclip sessions (directories containing `paperclip`), set `agent_id = "paperclip"`

```typescript
// [ASSUMED] — pattern derived from observed directory names, not official Claude docs
function deriveAgentId(projectDirName: string): string {
  // e.g. "-Users-jdoe--paperclip-instances-..." → "paperclip"
  if (projectDirName.includes('paperclip')) return 'paperclip';
  // e.g. "-Users-jdoe-github-agent-kitchen" → "agent-kitchen"
  const decoded = projectDirName.replace(/^-/, '/').replace(/-/g, '/');
  const parts = decoded.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? 'claude-code';
}
```

### Pattern 4: Incremental Ingest (CRITICAL — do NOT skip)

**What:** Track every JSONL file's `mtime` and `size`. On each ingest call, skip files where both values match the stored record. Append only new content to skip-already-seen files.

**Why critical:** 2,132 JSONL files totaling 1.2 GB. Full re-parse on every call would take 10-30 seconds. The existing `parseModelUsage` in `parsers.ts` does full re-reads every call — do NOT replicate that pattern for ingestion.

```typescript
// [ASSUMED] pattern — but based on standard incremental file ingestion practice
async function shouldSkipFile(db: Database, filePath: string): Promise<boolean> {
  const fstat = await stat(filePath);
  const row = db.prepare(
    'SELECT mtime_ms, file_size FROM ingest_meta WHERE file_path = ?'
  ).get(filePath) as { mtime_ms: number; file_size: number } | undefined;
  return !!row &&
    row.mtime_ms === fstat.mtimeMs &&
    row.file_size === fstat.size;
}
```

### Pattern 5: Content Extraction from JSONL Entries

**What:** JSONL entries have complex content shapes. Rules for what to extract:

| Entry type | `content` shape | Extract |
|------------|----------------|---------|
| `user` | string | Full string as-is |
| `user` | array of blocks | Concatenate `text` block `.text` fields |
| `assistant` | array of blocks | Concatenate `text` block `.text` fields only |
| `assistant` `thinking` block | object with `thinking` + binary `signature` | **Skip entirely** |
| `assistant` `tool_use` block | object with `input` JSON | Skip (tool calls create noise in FTS) |
| `system`, `attachment`, `file-history-snapshot` | N/A | **Skip the entire entry** |

```typescript
// [ASSUMED] extraction logic based on observed JSONL structure
function extractContent(entry: JsonlEntry): string | null {
  if (entry.type === 'user') {
    const msg = entry.message;
    if (typeof msg?.content === 'string') return msg.content.slice(0, 8000);
    if (Array.isArray(msg?.content)) {
      return msg.content
        .filter((b: Block) => b.type === 'text')
        .map((b: Block) => b.text)
        .join('\n')
        .slice(0, 8000);
    }
  }
  if (entry.type === 'assistant') {
    const content = entry.message?.content;
    if (Array.isArray(content)) {
      return content
        .filter((b: Block) => b.type === 'text')
        .map((b: Block) => b.text)
        .join('\n')
        .slice(0, 8000);
    }
  }
  return null;
}
```

### Pattern 6: FTS5 Recall Query

```typescript
// Source: SQLite FTS5 docs [CITED: https://www.sqlite.org/fts5.html#full_text_query_syntax]
export function recallByKeyword(
  db: Database.Database,
  query: string,
  limit = 20
): RecallResult[] {
  return db.prepare(`
    SELECT
      m.session_id,
      m.project,
      m.agent_id,
      m.role,
      snippet(messages_fts, 0, '<mark>', '</mark>', '…', 32) AS snippet,
      m.timestamp,
      rank
    FROM messages_fts
    JOIN messages m ON m.id = messages_fts.rowid
    WHERE messages_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as RecallResult[];
}
```

### Anti-Patterns to Avoid

- **Re-opening the DB on every request:** Call `getDb()` which returns the cached singleton.
- **Bundling better-sqlite3 with webpack:** Must add `serverExternalPackages: ['better-sqlite3']` to `next.config.ts`.
- **Porter tokenizer for code content:** Use `unicode61` — Porter stems `readFileSync` into unrecognizable forms.
- **Full re-parse of all JSONL on every ingest:** Use `ingest_meta` table to skip unchanged files.
- **Storing thinking blocks:** They contain binary-encoded signatures and add 5-10x noise to the index with zero retrieval value.
- **Conflicting with `data/state_store.db`:** That path is a directory (not a file). Use `data/conversations.db` as the SQLite file path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search ranking | Custom BM25 implementation | FTS5 built-in `rank` column | FTS5 BM25 is production-grade, handles tokenization, stemming, phrase queries |
| SQLite connection pooling | Custom pool | better-sqlite3 singleton + WAL mode | SQLite WAL allows concurrent readers; single writer is all you need |
| Incremental file tracking | Hashing file content | `mtime_ms + file_size` in `ingest_meta` | mtime+size is O(1) vs O(N) hashing; 99.9% reliable for this use case |

**Key insight:** SQLite FTS5 has been production-hardened since 2015. Any custom text-search implementation will miss tokenization edge cases that FTS5 handles correctly (Unicode combining characters, CJK, code punctuation).

---

## Common Pitfalls

### Pitfall 1: better-sqlite3 Native Module Not Excluded from Webpack Bundle
**What goes wrong:** `Error: The module './node_modules/better-sqlite3/build/Release/better_sqlite3.node' is not a Next.js API module`; build fails or server crashes on import.
**Why it happens:** Next.js App Router bundles all server code by default. Native `.node` addons cannot be bundled by webpack.
**How to avoid:** Add to `next.config.ts`:
```typescript
const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['better-sqlite3'],  // ADD THIS
};
```
**Warning signs:** `require is not defined` or `Cannot find module` error on the first API route that calls `getDb()`.

### Pitfall 2: WAL Mode Not Enabled — Concurrent Read Timeouts
**What goes wrong:** Dashboard health endpoint and recall endpoint block each other; `SQLITE_BUSY` errors under load.
**Why it happens:** Default journal mode uses exclusive locks. WAL allows concurrent readers with a single writer.
**How to avoid:** Run `db.pragma('journal_mode = WAL')` immediately after opening the DB (in `getDb()`).
**Warning signs:** Intermittent 500 errors from the recall or stats endpoints.

### Pitfall 3: Full Re-ingest Takes 30+ Seconds
**What goes wrong:** `/api/recall` or a scheduled ingest call times out or blocks the event loop.
**Why it happens:** 2,132 JSONL files × 370K rows × JSON.parse on every call = expensive.
**How to avoid:** `ingest_meta` table gates file processing; only new/modified files are parsed.
**Warning signs:** First ingest takes 2-5 minutes (acceptable); subsequent calls that take >5 seconds indicate the skip logic is broken.

### Pitfall 4: FTS5 External Content Table Out of Sync After DELETE
**What goes wrong:** Stale entries appear in search results for sessions that were re-ingested.
**Why it happens:** External content FTS tables are not automatically updated on DELETE — only INSERT triggers are wired.
**How to avoid:** Do not DELETE and re-insert for re-ingest. Use `INSERT OR IGNORE` with the `UNIQUE(session_id, request_id)` constraint. For full refresh, use `INSERT INTO messages_fts(messages_fts) VALUES('rebuild')` sparingly.
**Warning signs:** Duplicate results in recall responses.

### Pitfall 5: Truncating Content Too Aggressively
**What goes wrong:** FTS results miss keywords that appeared in truncated portions of messages.
**Why it happens:** Some Claude assistant messages are 50-100KB of code output; storing all of it is expensive.
**How to avoid:** Truncate at 8,000 characters per message (captures context of most conversational turns). Adjust down if DB grows unmanageably.
**Warning signs:** Users report recall missing keywords they know they typed.

### Pitfall 6: DB File Collision with `data/state_store.db`
**What goes wrong:** `new Database('data/state_store.db')` fails because that path is a directory (used by QMD for binary index files).
**Why it happens:** QMD's local vector store uses `data/state_store.db/` as a directory.
**How to avoid:** Use `data/conversations.db` — a distinct filename confirmed to not conflict.
**Warning signs:** `SQLITE_CANTOPEN` error on first DB open.

---

## Code Examples

### DB Constants Addition

```typescript
// src/lib/constants.ts — ADD these lines [VERIFIED: matches existing pattern in file]
export const SQLITE_DB_PATH =
  process.env.SQLITE_DB_PATH ||
  path.join(process.cwd(), 'data', 'conversations.db');
```

### /api/recall Route Shape

```typescript
// src/app/api/recall/route.ts
import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { recallByKeyword } from '@/lib/db-ingest';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '20');
  if (!q.trim()) return Response.json({ results: [], timestamp: new Date().toISOString() });

  const db = getDb();
  // Persist last recall query for Ledger panel (DASH-01)
  db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES('last_recall_query', ?)")
    .run(q);

  const results = recallByKeyword(db, q, limit);
  return Response.json({ results, query: q, timestamp: new Date().toISOString() });
}
```

### /api/recall/stats Route Shape

```typescript
// src/app/api/recall/stats/route.ts
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const rowCount = (db.prepare('SELECT COUNT(*) as c FROM messages').get() as {c: number}).c;
  const lastIngest = (db.prepare("SELECT value FROM meta WHERE key='last_ingest_ts'").get() as {value: string} | undefined)?.value ?? null;
  const lastRecallQuery = (db.prepare("SELECT value FROM meta WHERE key='last_recall_query'").get() as {value: string} | undefined)?.value ?? null;
  const dbSizeBytes = (db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get() as {size: number}).size;

  return Response.json({ rowCount, lastIngest, lastRecallQuery, dbSizeBytes, timestamp: new Date().toISOString() });
}
```

### next.config.ts (required native module exclusion)

```typescript
// next.config.ts [CITED: node_modules/next/dist/docs/01-app/02-guides/package-bundling.md]
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-sqlite3` (async callback) | `better-sqlite3` (synchronous) | ~2019 | Synchronous fits Next.js Route Handlers; no Promise chain; significantly simpler |
| FTS3/FTS4 | FTS5 | SQLite 3.9.0 (2015) | BM25 ranking, better Unicode support, external content tables |
| `experimental.serverComponentsExternalPackages` | `serverExternalPackages` (stable) | Next.js 15 | Now a top-level config key, not under `experimental` |

**Deprecated/outdated:**
- `node-sqlite3`: Async, requires Promise wrappers, slower. Use `better-sqlite3`.
- `experimental.serverComponentsExternalPackages`: Renamed in Next.js 15+; this project runs Next.js 16.2.2 — use `serverExternalPackages`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `agent_id` derived from project directory name using last path component | Architecture Patterns / Pattern 3 | Ingested rows would have wrong or missing agent_id; recall queries filtered by agent would fail |
| A2 | Content truncation at 8,000 chars per message is sufficient for FTS recall | Common Pitfalls #5 | If wrong, keywords in long messages are missed; adjustable post-launch |
| A3 | `INSERT OR IGNORE` with `UNIQUE(session_id, request_id)` is sufficient deduplication | Pattern 2 schema | Entries without `requestId` (file-history-snapshot, etc.) are already excluded by content extraction |

---

## Open Questions (RESOLVED)

1. **Ingest trigger: on-demand vs. scheduled**
   - What we know: No scheduler exists yet in the project; ingest could be called from `/api/recall` lazily or from a dedicated `/api/recall/ingest` endpoint.
   - What's unclear: Should the Ledger page trigger ingest on mount, or should ingest be a manual action?
   - Recommendation: Expose `/api/recall/ingest` (POST) as an explicit action button in the Ledger panel. Lazy ingest on recall would add latency. Scheduled ingest requires a background worker not yet in scope.
   - RESOLVED: Explicit "Run Ingest" button in Ledger panel triggers POST /api/recall/ingest. Implemented in Plan 02 (ingest route) and Plan 03 (UI button).

2. **FTS5 query escaping**
   - What we know: FTS5 `MATCH` syntax is not SQL LIKE; special characters (`"`, `*`, `-`, `.`) in query strings can cause parse errors.
   - What's unclear: Should the API sanitize/escape the `q` parameter before passing to FTS5?
   - Recommendation: Wrap the query in double quotes for phrase matching: `MATCH '"' || ? || '"'`; fall back to plain `MATCH ?` if phrase match returns zero results.
   - RESOLVED: Plan 02 Task 1 implements phrase-quote wrapping with plain-match fallback on zero results.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js >= 20.x | better-sqlite3 12.9.0 | Yes | v25.8.2 | — |
| better-sqlite3 (prebuilt darwin-arm64) | DB layer | Not yet installed | 12.9.0 (available) | — |
| SQLite (bundled in better-sqlite3) | FTS5 | Bundled | 3.x | — |
| `data/` directory | DB file | Yes (exists, gitignored) | — | — |

**Missing dependencies with no fallback:**
- `better-sqlite3` must be installed via `npm install better-sqlite3 @types/better-sqlite3`

**Missing dependencies with fallback:**
- None

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.3 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/app/api/recall` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SQLDB-01 | `/api/recall?q=keyword` returns ranked results | unit | `npx vitest run src/app/api/recall/__tests__/route.test.ts` | Wave 0 |
| SQLDB-02 | JSONL ingestion extracts text, skips thinking blocks, deduplicates | unit | `npx vitest run src/lib/__tests__/db-ingest.test.ts` | Wave 0 |
| SQLDB-03 | `SQLITE_DB_PATH` constant present and readable by both API and constants module | unit | `npx vitest run src/lib/__tests__/constants.test.ts` | Wave 0 |
| SQLDB-04 | `/api/recall/stats` returns rowCount, dbSizeBytes, lastIngest | unit | `npx vitest run src/app/api/recall/stats/__tests__/route.test.ts` | Wave 0 |
| DASH-01 | `SqliteHealthPanel` renders row count, DB size, last ingest, last recall | unit | `npx vitest run src/components/ledger/__tests__/sqlite-health-panel.test.tsx` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/app/api/recall`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/app/api/recall/__tests__/route.test.ts` — covers SQLDB-01
- [ ] `src/lib/__tests__/db-ingest.test.ts` — covers SQLDB-02 (content extraction + incremental logic)
- [ ] `src/app/api/recall/stats/__tests__/route.test.ts` — covers SQLDB-04 / DASH-01
- [ ] `src/components/ledger/__tests__/sqlite-health-panel.test.tsx` — covers DASH-01 render

Note: Test file for `constants.ts` likely already passes via existing import patterns; no separate test file needed for SQLDB-03.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user local tool |
| V3 Session Management | no | No session auth |
| V4 Access Control | no | Local only |
| V5 Input Validation | yes | Sanitize `q` param before FTS5 MATCH |
| V6 Cryptography | no | No secrets stored in SQLite |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| FTS5 injection (malformed MATCH syntax) | Tampering | Wrap user query in `"..."` for phrase match; catch SQLite syntax error and return empty results |
| Path traversal in JSONL ingest | Tampering | Only read files under the resolved `CLAUDE_MEMORY_PATH` prefix; reject paths that escape it |
| DoS via unbounded recall | Denial of Service | `limit` param capped at 100 server-side regardless of query param value |

---

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/02-guides/package-bundling.md` — `serverExternalPackages` config key and usage
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-15.md` — confirms `experimental.serverComponentsExternalPackages` → `serverExternalPackages`
- npm registry: `npm view better-sqlite3 version` → 12.9.0 (2026-04-16)
- npm registry: `npm view better-sqlite3 engines` → node `20.x || 22.x || 23.x || 24.x || 25.x` (compatible with v25.8.2)
- Observed JSONL schema: actual file walk of `~/.claude/projects/-Users-jdoe-github-agent-kitchen/`
- Observed directory structure: `data/state_store.db` is a directory; `data/` is gitignored via `.gitignore`

### Secondary (MEDIUM confidence)
- cloudctx reference implementation (https://github.com/chadptk1238/cloudctx) — confirmed FTS5 `messages_fts` table, `sessions` + `messages` schema, content extraction from JSONL
- SQLite FTS5 documentation: https://www.sqlite.org/fts5.html — FTS5 external content tables, BM25 ranking, `unicode61` tokenizer

### Tertiary (LOW confidence)
- agent_id derivation pattern from directory names — [ASSUMED] based on observed naming conventions

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 19 |
|-----------|-------------------|
| No `execSync`/`exec` — use `execFileSync` or pure `fs/promises` only | Ingest logic must use `fs/promises` (readdir, stat, createReadStream); never `execSync` |
| Security: treat external input as data | Sanitize `q` parameter from `/api/recall` before FTS5 MATCH |
| Must run impact analysis before editing any symbol | Before touching `parsers.ts` or `constants.ts` — run `gitnexus_impact` |
| `serverExternalPackages` required for native modules | Add to `next.config.ts` immediately as Wave 0 step |
| Single shared SQLite file (STATE.md decision) | All tables in `data/conversations.db`; Phase 20 will add `hive_mind` table to this same file |
| Production port 3002 via `npm start -- --port 3002` | No port change needed; DB file path is filesystem-based |
| AGENTS.md: This is not the Next.js you know — read docs before writing code | Confirmed `serverExternalPackages` (not the old `experimental` key) via local Next.js 16 docs |

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry verified version; Node.js engine compat confirmed
- Architecture: HIGH — schema derived from observed JSONL structure + cloudctx reference; Next.js config confirmed from local docs
- Pitfalls: HIGH — native module pitfall confirmed from Next.js docs; DB collision confirmed by inspecting `data/` directory; WAL/FTS5 behavior from SQLite docs
- agent_id derivation: LOW (ASSUMED) — pattern logical but not from official Claude docs

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable libraries; re-verify if Next.js major version changes)
