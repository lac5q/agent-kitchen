# Phase 20: Hive Mind Coordination — Research

**Researched:** 2026-04-17
**Domain:** SQLite multi-table coordination layer, Next.js App Router API routes, React Query polling
**Confidence:** HIGH (all claims verified from codebase inspection; no external library changes required)

---

## Summary

Phase 20 adds a shared coordination layer on top of the SQLite DB singleton built in Phase 19. Two tables are required — `hive_actions` for the append-only cross-agent action log (HIVE-01, HIVE-02, HIVE-05), and `hive_delegations` for mutable task tracking with checkpoint recovery (HIVE-03). Both ship FTS5 indexes for keyword search.

Real-time delivery follows the established codebase pattern exactly: tanstack react-query with `refetchInterval`, no SSE or WebSocket. A single API route at `/api/hive` handles GET (query/filter) and POST (write action or delegation). Agents write by POSTing to that endpoint over HTTP — no shared library is needed, since HTTP is the only interface that works across heterogeneous agent processes (Claude Code sessions, Paperclip fleet, future voice agents).

The dashboard feed component (DASH-02) is a standalone `HiveFeed` component backed by a `useHiveFeed()` hook, following the `SqliteHealthPanel` pattern. Placement on the Kitchen Floor main page is recommended since Ledger is for cost analytics.

**Primary recommendation:** Two-table schema with FTS5; polling at 5 s; single HTTP route; `HiveFeed` component on Kitchen Floor.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HIVE-01 | Agent logs a significant action (agent_id, action_type using CodeMachine vocabulary: continue/loop/checkpoint/trigger/stop/error, summary, artifacts JSON) to the shared hive mind table | `hive_actions` DDL with CHECK constraint on action_type; POST handler writes row |
| HIVE-02 | Agent queries hive mind history via `/api/hive?agent=...&q=...` | GET handler filters by agent_id and FTS5 keyword; `hive_actions_fts` virtual table |
| HIVE-03 | Agent delegates a task with priority, status tracking, and step-level checkpoint resume | `hive_delegations` table with status enum, priority int, checkpoint JSON; GET/POST delegation sub-resource |
| HIVE-04 | Dashboard shows live hive mind activity feed — last N actions across all agents, real-time | `useHiveFeed()` hook with 5 s refetchInterval; `HiveFeed` component |
| HIVE-05 | Paperclip fleet writes to hive as `agent_id="paperclip"` and appears in feed | No special schema work — agent_id column is free text; same POST endpoint |
| DASH-02 | Hive mind activity feed component with agent, action_type, summary, timestamp | `HiveFeed` component wired into Kitchen Floor page |
</phase_requirements>

---

## User Constraints

No CONTEXT.md exists for this phase — no discuss-phase decisions are locked. All design choices below are at Claude's discretion based on codebase patterns and requirement analysis.

---

## Standard Stack

### Core — already installed
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | already in package.json | Sync SQLite driver | Phase 19 established; `getDb()` singleton in `src/lib/db.ts` |
| @tanstack/react-query | already in package.json | Client data fetching + polling | Used by every real-time panel in the codebase |

### No new dependencies required
Phase 20 needs zero new npm packages. All capabilities (SQLite schema, FTS5, HTTP routes, polling) already exist in the stack.

**Installation:** None.

**Version verification:** N/A — existing dependencies, versions confirmed by codebase inspection. [VERIFIED: codebase grep]

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/api/hive/
│   └── route.ts                # GET (query) + POST (write action or delegation)
├── components/kitchen/
│   └── hive-feed.tsx           # HiveFeed component — goes on Kitchen Floor
└── lib/
    ├── db-schema.ts            # ADD: hive_actions + hive_delegations DDL here
    └── api-client.ts           # ADD: useHiveFeed() hook
```

### Pattern 1: Schema Addition — extend `initSchema()`

The existing `initSchema(db: Database.Database)` function in `src/lib/db-schema.ts` runs every startup with `CREATE IF NOT EXISTS`. New tables go in the same function. [VERIFIED: codebase read]

DDL to add inside `initSchema()` after the existing `meta` table:

```sql
-- hive_actions: append-only cross-agent action log
CREATE TABLE IF NOT EXISTS hive_actions (
  id          INTEGER PRIMARY KEY,
  agent_id    TEXT    NOT NULL,
  action_type TEXT    NOT NULL
              CHECK(action_type IN ('continue','loop','checkpoint','trigger','stop','error')),
  summary     TEXT    NOT NULL,
  artifacts   TEXT,                    -- JSON blob, schema-free
  session_id  TEXT,                    -- originating Claude Code session (optional)
  timestamp   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS hive_actions_agent_ts
  ON hive_actions(agent_id, timestamp DESC);

-- FTS5 external-content table (same pattern as messages_fts)
CREATE VIRTUAL TABLE IF NOT EXISTS hive_actions_fts
  USING fts5(
    summary,
    agent_id    UNINDEXED,
    action_type UNINDEXED,
    timestamp   UNINDEXED,
    content=hive_actions,
    content_rowid=id,
    tokenize='unicode61'
  );

-- Keep FTS index in sync
CREATE TRIGGER IF NOT EXISTS hive_actions_ai AFTER INSERT ON hive_actions BEGIN
  INSERT INTO hive_actions_fts(rowid, summary, agent_id, action_type, timestamp)
  VALUES (new.id, new.summary, new.agent_id, new.action_type, new.timestamp);
END;

-- hive_delegations: mutable task tracking with checkpoint recovery
CREATE TABLE IF NOT EXISTS hive_delegations (
  id            INTEGER PRIMARY KEY,
  task_id       TEXT    NOT NULL UNIQUE,   -- caller-assigned UUID
  from_agent    TEXT    NOT NULL,
  to_agent      TEXT    NOT NULL,
  task_summary  TEXT    NOT NULL,
  priority      INTEGER NOT NULL DEFAULT 5, -- 1=critical, 10=low
  status        TEXT    NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','active','paused','completed','failed')),
  checkpoint    TEXT,                       -- JSON: {completedSteps, lastStepAt, resumeFrom}
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS hive_delegations_to_agent
  ON hive_delegations(to_agent, status);
```

**Why two tables:** `hive_actions` is append-only (immutable log); `hive_delegations` mutates over time (status updates, checkpoint writes). Mixing them forces nullable columns and confusing queries. [VERIFIED: schema analysis]

**Why CHECK constraint on action_type:** HIVE-01 explicitly names the CodeMachine vocabulary. A DB-level constraint enforces this across all writers (Claude Code, Paperclip, future agents) with no application-layer coordination. [VERIFIED: REQUIREMENTS.md HIVE-01]

**Why JSON blob for artifacts:** Different action types produce different artifact shapes (file paths, error objects, task IDs). A schema-free JSON column avoids migrations as artifact types evolve.

### Pattern 2: API Route — follow recall route pattern

Source pattern: `src/app/api/recall/route.ts` — imports `getDb()`, uses sync better-sqlite3 calls, exports `dynamic = 'force-dynamic'`. [VERIFIED: codebase read]

File: `src/app/api/hive/route.ts` (new file)

```typescript
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/hive?agent=X&q=keyword&limit=20&type=action|delegation
export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const agent = url.searchParams.get('agent') ?? '';
  const q = url.searchParams.get('q') ?? '';
  const limit = Number(url.searchParams.get('limit') ?? '20');
  const type = url.searchParams.get('type') ?? 'action';
  const db = getDb();

  if (type === 'delegation') {
    const rows = agent
      ? db.prepare(
          `SELECT * FROM hive_delegations WHERE to_agent = ? ORDER BY created_at DESC LIMIT ?`
        ).all(agent, limit)
      : db.prepare(
          `SELECT * FROM hive_delegations ORDER BY created_at DESC LIMIT ?`
        ).all(limit);
    return Response.json({ delegations: rows, timestamp: new Date().toISOString() });
  }

  // Default: query hive_actions, with optional FTS keyword filter
  if (q.trim()) {
    const ftsQ = q.trim().split(/\s+/).map((w: string) => `${w}*`).join(' ');
    const rows = agent
      ? db.prepare(`
          SELECT a.* FROM hive_actions a
          JOIN hive_actions_fts f ON a.id = f.rowid
          WHERE f.hive_actions_fts MATCH ? AND a.agent_id = ?
          ORDER BY a.timestamp DESC LIMIT ?
        `).all(ftsQ, agent, limit)
      : db.prepare(`
          SELECT a.* FROM hive_actions a
          JOIN hive_actions_fts f ON a.id = f.rowid
          WHERE f.hive_actions_fts MATCH ?
          ORDER BY a.timestamp DESC LIMIT ?
        `).all(ftsQ, limit);
    return Response.json({ actions: rows, timestamp: new Date().toISOString() });
  }

  const rows = agent
    ? db.prepare(
        `SELECT * FROM hive_actions WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?`
      ).all(agent, limit)
    : db.prepare(
        `SELECT * FROM hive_actions ORDER BY timestamp DESC LIMIT ?`
      ).all(limit);
  return Response.json({ actions: rows, timestamp: new Date().toISOString() });
}

// POST /api/hive
// Body (action):     { agent_id, action_type, summary, artifacts?, session_id? }
// Body (delegation): { type: 'delegation', task_id, from_agent, to_agent, task_summary, priority?, status?, checkpoint? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();

  if (body.type === 'delegation') {
    const validStatuses = ['pending','active','paused','completed','failed'];
    if (body.status && !validStatuses.includes(body.status)) {
      return Response.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
    }
    const stmt = db.prepare(`
      INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, checkpoint)
      VALUES (@task_id, @from_agent, @to_agent, @task_summary, @priority, @status, @checkpoint)
      ON CONFLICT(task_id) DO UPDATE SET
        status     = excluded.status,
        checkpoint = excluded.checkpoint,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
    `);
    stmt.run({
      task_id:      body.task_id,
      from_agent:   body.from_agent,
      to_agent:     body.to_agent,
      task_summary: body.task_summary,
      priority:     body.priority ?? 5,
      status:       body.status ?? 'pending',
      checkpoint:   body.checkpoint ? JSON.stringify(body.checkpoint) : null,
    });
    return Response.json({ ok: true, task_id: body.task_id });
  }

  // Default: write action
  const validTypes = ['continue','loop','checkpoint','trigger','stop','error'];
  if (!validTypes.includes(body.action_type)) {
    return Response.json(
      { error: `Invalid action_type. Must be one of: ${validTypes.join(', ')}` },
      { status: 400 }
    );
  }
  const stmt = db.prepare(`
    INSERT INTO hive_actions(agent_id, action_type, summary, artifacts, session_id)
    VALUES (@agent_id, @action_type, @summary, @artifacts, @session_id)
  `);
  const result = stmt.run({
    agent_id:    body.agent_id,
    action_type: body.action_type,
    summary:     body.summary,
    artifacts:   body.artifacts ? JSON.stringify(body.artifacts) : null,
    session_id:  body.session_id ?? null,
  });
  return Response.json({ ok: true, id: result.lastInsertRowid });
}
```

### Pattern 3: Client Hook — add to api-client.ts

```typescript
// Add to src/lib/api-client.ts (following existing useRecallStats pattern)

// In POLL_INTERVALS (constants.ts), add:
//   hive: 5000,

export function useHiveFeed(limit = 20) {
  return useQuery({
    queryKey: ['hive-feed'],
    queryFn: () =>
      fetchJSON<{
        actions: Array<{
          id: number;
          agent_id: string;
          action_type: string;
          summary: string;
          artifacts: string | null;
          timestamp: string;
        }>;
        timestamp: string;
      }>(`/api/hive?limit=${limit}`),
    refetchInterval: POLL_INTERVALS.hive,  // 5000 ms
  });
}
```

### Pattern 4: HiveFeed Component — follow SqliteHealthPanel structure

The `SqliteHealthPanel` in `src/components/ledger/sqlite-health-panel.tsx` is the closest reference: standalone component, own hook, dark card with amber section header, uses `KpiCard` or similar for summary, scrollable list for detail. [VERIFIED: codebase read]

File: `src/components/kitchen/hive-feed.tsx` (new file)

```typescript
"use client";
import { useHiveFeed } from "@/lib/api-client";

// CodeMachine action_type → color chip classes
const ACTION_COLORS: Record<string, string> = {
  continue:   "text-sky-400 bg-sky-500/10 border-sky-500/30",
  loop:       "text-violet-400 bg-violet-500/10 border-violet-500/30",
  checkpoint: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  trigger:    "text-amber-400 bg-amber-500/10 border-amber-500/30",
  stop:       "text-slate-400 bg-slate-500/10 border-slate-500/30",
  error:      "text-rose-400 bg-rose-500/10 border-rose-500/30",
};

export function HiveFeed({ limit = 20 }: { limit?: number }) {
  const { data, isLoading } = useHiveFeed(limit);
  const actions = data?.actions ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-amber-500 uppercase tracking-wide">
          Hive Feed
        </span>
        <div className="flex-1 h-px bg-amber-900/40" />
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : actions.length === 0 ? (
        <div className="text-sm text-slate-500 py-4 text-center">No hive activity yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {actions.map((a) => (
            <li key={a.id} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3">
              <span className="text-xs font-medium text-slate-300 shrink-0">{a.agent_id}</span>
              <span className={`text-xs font-mono border rounded px-1.5 py-0.5 shrink-0 ${ACTION_COLORS[a.action_type] ?? ""}`}>
                {a.action_type}
              </span>
              <span className="text-sm text-slate-200 flex-1 min-w-0 truncate">{a.summary}</span>
              <span className="text-xs text-slate-500 shrink-0 tabular-nums">
                {formatRelativeTime(a.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Wire into `src/app/page.tsx` (Kitchen Floor) below `<AgentGrid agents={allAgents} />`.

### Anti-Patterns to Avoid

- **SSE or WebSocket for the feed:** No existing component uses SSE. Every real-time panel uses react-query polling. Adding SSE requires new server infrastructure for no user-visible benefit in a local dashboard.
- **Single merged table for actions + delegations:** Actions are immutable; delegations mutate. One table forces nullable columns and confusing discriminator logic.
- **Free-text action_type without CHECK constraint:** Without the constraint, any agent can write arbitrary strings, breaking the CodeMachine vocabulary contract across future phases.
- **Shared library for agent writes:** Agents are heterogeneous processes (Node.js, Python, shell scripts). HTTP POST to `/api/hive` is the only universal write path.
- **Putting HiveFeed on Ledger page:** Ledger is for RTK token/cost analytics. The Hive feed belongs on Kitchen Floor (the agent status board).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keyword search | Custom LIKE queries | SQLite FTS5 (same pattern as messages_fts) | FTS5 handles tokenization, prefix search, ranking; LIKE does not scale |
| FTS sync | Manual trigger management | `AFTER INSERT` trigger (same as `messages_ai`) | Pattern already proven in Phase 19 |
| Real-time push | SSE/WebSocket server | react-query `refetchInterval` | No new infra; same as every other panel |
| Task ID generation | Custom ID logic | `crypto.randomUUID()` in the calling agent | Standard Web API, available in all modern runtimes |

**Key insight:** SQLite FTS5 + triggers is already the established pattern for searchable append-only logs. Repeat it verbatim for `hive_actions`.

---

## Task Delegation Data Model

The checkpoint resume model for HIVE-03 stores state as a JSON blob in the `checkpoint` column:

```json
{
  "completedSteps": ["step-1-fetch", "step-2-parse"],
  "lastStepAt": "2026-04-17T10:23:00Z",
  "resumeFrom": "step-3-write"
}
```

Status lifecycle:
```
pending -> active -> completed
                  -> paused   (on interruption, checkpoint written)
                  -> failed
paused  -> active  (on resume, agent reads resumeFrom)
```

An agent resuming an interrupted task:
1. GET `/api/hive?type=delegation&agent=<my_agent_id>` — find delegations with `status=paused`
2. Read `checkpoint.resumeFrom` — skip already-completed steps
3. POST with `type=delegation` updating `status=active` and `checkpoint` as steps complete (UPSERT via `ON CONFLICT`)
4. Final POST sets `status=completed`

The UPSERT pattern in the POST handler (`ON CONFLICT(task_id) DO UPDATE`) means the same endpoint handles both creation and status updates.

---

## Agent Write Path

Agents write to the hive via HTTP POST. No shared library required.

**From any process (HTTP client, any language):**

Endpoint: `POST http://localhost:3002/api/hive`
Content-Type: `application/json`

Action body:
```json
{
  "agent_id": "paperclip",
  "action_type": "checkpoint",
  "summary": "Completed task indexing pass 1 of 3",
  "artifacts": { "filesProcessed": 142, "nextBatch": "batch-2" },
  "session_id": "sess_abc123"
}
```

Delegation body:
```json
{
  "type": "delegation",
  "task_id": "task-uuid-here",
  "from_agent": "claude-code",
  "to_agent": "paperclip",
  "task_summary": "Index all JSONL files in projects/",
  "priority": 3,
  "status": "pending"
}
```

The production server runs on port 3002 with a Cloudflare tunnel. [ASSUMED from project memory — verify before agent integration]

---

## Common Pitfalls

### Pitfall 1: SQLite SQLITE_BUSY on concurrent writes
**What goes wrong:** Multiple agent processes (Claude Code + Paperclip) POST simultaneously. SQLite writer lock causes `SQLITE_BUSY` errors with no retry by default.
**Why it happens:** WAL mode allows concurrent reads, but writes are serialized. Without a timeout, the second writer fails immediately.
**How to avoid:** Add `db.pragma('busy_timeout = 5000')` in `getDb()` after the existing pragmas. The 5-second timeout covers typical concurrent write bursts. Check whether Phase 19 already added this — if not, it is a Wave 0 addition.
**Warning signs:** `SqliteError: database is locked` in server logs during high write frequency.

### Pitfall 2: FTS5 external-content table out of sync on delete
**What goes wrong:** If rows are ever deleted from `hive_actions`, the FTS index retains stale entries, causing phantom search results or rowid mismatches.
**Why it happens:** FTS5 external-content tables need explicit `AFTER DELETE` and `AFTER UPDATE` triggers to stay in sync.
**How to avoid:** Add `AFTER DELETE` and `AFTER UPDATE` triggers for `hive_actions_fts`. Since `hive_actions` is intended append-only, this is low risk but worth adding for correctness. Follow the same pattern as `messages_fts`.
**Warning signs:** FTS search returns rows that no longer exist in `hive_actions`.

### Pitfall 3: Artifacts column without JSON validation
**What goes wrong:** An agent POSTs a non-JSON value in `artifacts`. Dashboard tries to parse it and throws.
**Why it happens:** SQLite stores TEXT, not validated JSON. No constraint prevents malformed values.
**How to avoid:** POST handler always calls `JSON.stringify(body.artifacts)` before writing. Dashboard reads `artifacts` with a safe `JSON.parse()` wrapped in try/catch, falling back to displaying the raw string.
**Warning signs:** Dashboard shows parse errors on specific hive rows.

### Pitfall 4: action_type CHECK constraint violation surfaces as 500
**What goes wrong:** An agent uses an action_type not in the CodeMachine vocabulary. SQLite throws `SQLITE_CONSTRAINT`. If the POST handler does not catch it, Next.js returns a 500 with no useful message.
**Why it happens:** The CHECK constraint is enforced at the DB layer, not the API layer.
**How to avoid:** POST handler validates `action_type` against the allowed set and returns 400 with a descriptive error message. The CHECK constraint is a safety net, not the primary validation point.
**Warning signs:** Agent writes fail silently; no rows appear in the feed.

### Pitfall 5: FTS5 MATCH injection
**What goes wrong:** A `q=` parameter containing FTS5 syntax characters (e.g., `"`, `*`, `-`) crashes the query with `SqliteError: fts5: syntax error`.
**Why it happens:** The FTS5 MATCH operator parses the query string as FTS syntax.
**How to avoid:** Catch `SqliteError` on FTS queries and return an empty results set with a 200 (not a 500). Optionally sanitize the query by escaping special chars before appending `*`.
**Warning signs:** GET requests with unusual `q=` values return 500.

---

## Environment Availability

SKIPPED — Phase 20 is pure code/config changes. No new external tools, services, or runtimes. SQLite and Next.js are already running from Phase 19.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (existing) |
| Config file | jest.config.ts (existing) |
| Quick run command | `npx jest --testPathPattern=hive` |
| Full suite command | `npx jest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HIVE-01 | POST writes row to hive_actions; CHECK constraint rejects invalid action_type | unit | `npx jest --testPathPattern=api/hive` | No — Wave 0 gap |
| HIVE-02 | GET with agent= and q= returns FTS-filtered results | unit | `npx jest --testPathPattern=api/hive` | No — Wave 0 gap |
| HIVE-03 | Delegation UPSERT; checkpoint JSON round-trips; status transitions | unit | `npx jest --testPathPattern=api/hive` | No — Wave 0 gap |
| HIVE-04 | useHiveFeed hook queries /api/hive; refetchInterval equals hive poll constant | unit | `npx jest --testPathPattern=api-client` | Extend existing |
| HIVE-05 | Row with agent_id="paperclip" appears in feed query result | unit | `npx jest --testPathPattern=api/hive` | No — Wave 0 gap |
| DASH-02 | HiveFeed renders action rows with agent, action_type, summary, timestamp | unit | `npx jest --testPathPattern=hive-feed` | No — Wave 0 gap |

### Sampling Rate
- **Per task commit:** `npx jest --testPathPattern=hive`
- **Per wave merge:** `npx jest`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/app/api/hive/__tests__/route.test.ts` — covers HIVE-01, HIVE-02, HIVE-03, HIVE-05
- [ ] `src/components/kitchen/__tests__/hive-feed.test.tsx` — covers DASH-02
- [ ] Check `src/lib/db.ts` for `busy_timeout` pragma — add in Wave 0 if absent

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Validate action_type against enum before DB write; JSON.parse artifacts safely with try/catch |
| V4 Access Control | no | Single-user local tool (per REQUIREMENTS.md: no multi-user auth) |
| V2 Authentication | no | Single-user local tool |
| V6 Cryptography | no | No cryptographic operations in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Oversized summary/artifacts payload | Denial of service | Enforce max payload size in POST handler (summary max 1 KB, artifacts max 100 KB) |
| SQL injection via q= or agent= params | Tampering | better-sqlite3 parameterized queries — already the codebase pattern |
| FTS5 MATCH syntax injection | Tampering | Catch SqliteError on malformed FTS queries; return empty results not 500 |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Production server runs on port 3002 | Agent Write Path | Agents posting to wrong port; HTTP examples use wrong URL |
| A2 | Kitchen Floor is the correct placement for HiveFeed (not Ledger, not a new /hive page) | Architecture Patterns | Component created in wrong page |
| A3 | `artifacts` field is schema-free JSON with no fixed structure required by Phase 21 or Phase 24 | Schema | Paperclip fleet or audit log may need specific artifact fields; could require migration |
| A4 | `busy_timeout` pragma is NOT already set in Phase 19's `getDb()` | Common Pitfalls | If already set, Wave 0 task is a no-op (harmless); if missing, concurrent writes will fail |

---

## Open Questions

1. **Artifacts field contract**
   - What we know: HIVE-01 says "artifacts JSON" with no further specification
   - What's unclear: Whether Phase 21 (Paperclip) or Phase 24 (Audit) requires a specific artifacts schema
   - Recommendation: Keep schema-free for now; agents can add a `_type` key convention (e.g., `"_type": "file-list"`) so consumers can detect structure without a migration

2. **Dashboard placement: Kitchen Floor vs. dedicated /hive page**
   - What we know: DASH-02 says "hive mind activity feed component"; Ledger is for cost analytics
   - What's unclear: Whether the feed merits its own route at this scale
   - Recommendation: Start on Kitchen Floor below AgentGrid; extract to `/hive` in a later phase if needed

3. **busy_timeout pragma placement**
   - What we know: `getDb()` currently sets `journal_mode` and `synchronous` pragmas
   - What's unclear: Whether Phase 19 implementation already added `busy_timeout`
   - Recommendation: Inspect `src/lib/db.ts` in Wave 0 task before adding — avoid duplicate pragma calls

---

## Sources

### Primary (HIGH confidence)
- `src/lib/db.ts` — DB singleton pattern, pragma setup [VERIFIED: codebase read]
- `src/lib/db-schema.ts` — FTS5 external-content pattern, trigger pattern [VERIFIED: codebase read]
- `src/app/api/recall/route.ts` — API route pattern (dynamic, sync better-sqlite3, Response.json) [VERIFIED: codebase read]
- `src/lib/api-client.ts` — react-query hook pattern, POLL_INTERVALS convention [VERIFIED: codebase read]
- `src/components/ledger/sqlite-health-panel.tsx` — standalone panel component pattern [VERIFIED: codebase read]
- `.planning/REQUIREMENTS.md` — HIVE-01 through HIVE-05, CodeMachine vocabulary [VERIFIED: codebase read]
- `src/app/page.tsx` — Kitchen Floor composition pattern [VERIFIED: codebase read]

### Secondary (MEDIUM confidence)
- better-sqlite3 `busy_timeout` pragma: standard SQLite PRAGMA supported by better-sqlite3 `pragma()` method [ASSUMED — standard SQLite feature, universally supported in all SQLite builds]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; Phase 19 patterns reused verbatim
- Schema design: HIGH — two-table approach derived from clear requirement lifecycle differences
- Architecture/patterns: HIGH — all patterns verified from existing codebase
- Pitfalls: HIGH — SQLite BUSY and FTS5 sync issues are well-documented; concurrent-write risk is inherent to multi-agent design

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable stack; no external dependencies to drift)
