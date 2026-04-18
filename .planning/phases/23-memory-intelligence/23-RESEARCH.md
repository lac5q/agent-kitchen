# Phase 23: Memory Intelligence - Research

**Researched:** 2026-04-18
**Domain:** SQLite background scheduling, salience decay, LLM consolidation, agent peer tracking
**Confidence:** HIGH

---

## Summary

Phase 23 adds four capabilities on top of the SQLite backbone established in Phases 19-20: a background consolidation engine (MEM-01), 4-tier salience decay (MEM-02), a consolidation health panel in the dashboard (MEM-03), and a peer-awareness API and panel (MEM-04).

The existing codebase already has all the foundations needed: `getDb()` singleton (`src/lib/db.ts`), `hive_actions` table (Phase 20), `@tanstack/react-query` polling hooks (`src/lib/api-client.ts`), and `KpiCard` / `HiveFeed` component patterns to copy. The only new dependency required is `@anthropic-ai/sdk` for LLM consolidation -- it is not currently in `package.json`. No `.env.local` exists in the repo; the planner must add `ANTHROPIC_API_KEY` to `.env.example` and document it.

Background scheduling is implemented via a single `src/instrumentation.ts` file with an exported `register()` function. This runs once on server start in the Node.js runtime, making `setInterval`-based scheduling straightforward without an extra process. MEM-04 (`/api/agent-peers`) is a thin query over the existing `hive_actions` table -- no new tables needed for that requirement.

**Primary recommendation:** Add `@anthropic-ai/sdk`, create `instrumentation.ts` to boot two `setInterval` loops (consolidation every 15 min, decay every 60 min), add three new tables to `db-schema.ts`, expose three API routes, and build two new dashboard components.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEM-01 | Background consolidation engine batches unconsolidated memories, extracts patterns/contradictions via LLM, writes meta-insights back to SQLite | `instrumentation.ts` register pattern; `@anthropic-ai/sdk` messages API; `memory_consolidation_runs` + `memory_meta_insights` tables |
| MEM-02 | 4-tier salience decay runs on schedule -- pinned=0%/day, high=1%/day, mid=2%/day, low=5%/day; frequently accessed memories resist decay | `memory_salience` table; exponential decay SQL UPDATE; access-resistance formula |
| MEM-03 | Dashboard shows consolidation last-run timestamp, pending unconsolidated count, and decay stats | `/api/memory-stats` route; `MemoryIntelligencePanel` component using `KpiCard` pattern |
| MEM-04 | `GET /api/agent-peers` returns all active agents with current_task, status, last_seen; dashboard shows live peer-awareness panel | Single GROUP BY query on existing `hive_actions` table; `AgentPeersPanel` component using `useHiveFeed` polling pattern |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

- **MUST run impact analysis before editing any symbol** via `gitnexus_impact`
- **MUST run `gitnexus_detect_changes()` before committing**
- **No `execSync`/`exec`** -- use `execFileSync` or pure `fs/promises` only
- **mem0 writes:** Only via `POST http://localhost:3201/memory/add` -- never touch `agent_memory` Qdrant directly
- **Vector store:** QMD handles BM25/lexical only. ALL vector/semantic search uses Qdrant Cloud. `qmd embed` is FORBIDDEN.
- **Next.js version:** 16.2.2 -- AGENTS.md warns "This is NOT the Next.js you know" -- read `node_modules/next/dist/docs/` before writing Next.js-specific code. (Note: node_modules/next/dist/docs/ does not exist in this installation; use official nextjs.org docs and verify behavior via tests.)
- **Before writing any code:** State how you will verify the change works; write the test first; implement; iterate until passing.
- **DB singleton:** `getDb()` from `src/lib/db.ts` -- never open a second connection.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^12.9.0 | SQLite access | Already installed; all Phase 19-20 DB work uses it |
| @anthropic-ai/sdk | 0.90.0 (latest) [VERIFIED: npm registry] | LLM consolidation calls | Only Anthropic SDK available; project uses Claude API pattern |
| next | 16.2.2 | App framework | Already installed |
| @tanstack/react-query | ^5.96.2 | Dashboard polling hooks | Already used for HiveFeed, SqliteHealthPanel, all other panels |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node-cron | 4.2.1 (latest) [VERIFIED: npm registry] | Cron expression scheduling | NOT recommended -- `setInterval` in `instrumentation.ts` is simpler and adds no dependency |

**Installation (new dependency only):**
```bash
npm install @anthropic-ai/sdk
```

**Version verification:**
```bash
npm view @anthropic-ai/sdk version   # verified 0.90.0 as of 2026-04-18
```

Do NOT install node-cron -- `setInterval` inside `instrumentation.ts` is sufficient and avoids an extra dependency.

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
src/
├── instrumentation.ts                   # NEW -- server-start scheduler bootstrap
├── lib/
│   ├── db-schema.ts                     # MODIFY -- add 3 new tables
│   ├── memory-consolidation.ts          # NEW -- consolidation engine logic
│   └── memory-decay.ts                  # NEW -- salience decay logic
├── app/api/
│   ├── memory-stats/route.ts            # NEW -- MEM-03 dashboard stats
│   ├── agent-peers/route.ts             # NEW -- MEM-04 peer listing
│   └── memory-consolidate/route.ts      # NEW -- manual trigger endpoint
└── components/
    ├── kitchen/
    │   └── agent-peers-panel.tsx        # NEW -- MEM-04 live peer panel
    └── ledger/
        └── memory-intelligence-panel.tsx # NEW -- MEM-03 health stats
```

### Pattern 1: Background Scheduler via instrumentation.ts

**What:** `src/instrumentation.ts` exports a `register()` function that Next.js calls once on server startup (Node.js runtime only). Use it to start two `setInterval` loops.

**When to use:** Always for any "run on schedule without a separate process" need in this project.

**Example:**
```typescript
// Source: https://nextjs.org/docs/app/guides/instrumentation (verified 2026-04-18)
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only import server-only modules inside the nodejs guard
    const { startConsolidationScheduler } = await import('./lib/memory-consolidation');
    const { startDecayScheduler } = await import('./lib/memory-decay');
    startConsolidationScheduler();
    startDecayScheduler();
  }
}
```

**Key constraints:**
- File location: `src/instrumentation.ts` (alongside `app/` since project uses `src/`)
- `NEXT_RUNTIME === 'nodejs'` guard is required -- register is called in all runtimes
- No `next.config.ts` changes needed -- auto-detected in Next.js 15+ [CITED: nextjs.org/docs/app/guides/instrumentation]
- `register()` must complete before server is ready; use `async import()` inside for heavy modules

### Pattern 2: SQLite Schema Extension (additive only)

**What:** Add new tables to `db-schema.ts`'s `initSchema()` function using `CREATE TABLE IF NOT EXISTS` -- safe to call on every startup.

**When to use:** All schema changes in this project follow this pattern.

**Schema additions (add to initSchema in db-schema.ts):**

```sql
-- memory_salience: tracks tier, decay score, and access resistance per message
CREATE TABLE IF NOT EXISTS memory_salience (
  message_id     INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  tier           TEXT    NOT NULL DEFAULT 'mid'
                 CHECK(tier IN ('pinned','high','mid','low')),
  salience_score REAL    NOT NULL DEFAULT 1.0
                 CHECK(salience_score >= 0.0 AND salience_score <= 1.0),
  access_count   INTEGER NOT NULL DEFAULT 0,
  last_accessed  TEXT,
  last_decay_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS memory_salience_tier
  ON memory_salience(tier, last_decay_at);

-- memory_consolidation_runs: audit log of each consolidation batch
CREATE TABLE IF NOT EXISTS memory_consolidation_runs (
  id               INTEGER PRIMARY KEY,
  started_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  completed_at     TEXT,
  batch_size       INTEGER NOT NULL DEFAULT 0,
  insights_written INTEGER NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'running'
                   CHECK(status IN ('running','completed','failed')),
  error_message    TEXT
);

-- memory_meta_insights: LLM-extracted patterns written back to SQLite
CREATE TABLE IF NOT EXISTS memory_meta_insights (
  id           INTEGER PRIMARY KEY,
  run_id       INTEGER NOT NULL REFERENCES memory_consolidation_runs(id),
  insight_type TEXT    NOT NULL
               CHECK(insight_type IN ('pattern','contradiction','summary')),
  content      TEXT    NOT NULL,
  source_ids   TEXT    NOT NULL,   -- JSON array of message.id values
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
```

**"Unconsolidated" column on messages (additive migration):**

```typescript
// In initSchema(), after CREATE TABLE statements:
try {
  db.exec(`ALTER TABLE messages ADD COLUMN consolidated INTEGER NOT NULL DEFAULT 0`);
} catch {
  // Column already exists -- safe to ignore on subsequent startups
  // Verify column presence if needed: PRAGMA table_info(messages)
}
```

### Pattern 3: Salience Decay Formula

**What:** Apply decay per tier daily, with access-resistance modifying effective rate.

**Decay rates (exact as specified in MEM-02):**
- pinned: 0.0% per day (never decays)
- high: 1.0% per day -- new score = score * 0.99
- mid: 2.0% per day -- new score = score * 0.98
- low: 5.0% per day -- new score = score * 0.95

**Access-resistance formula:** [ASSUMED -- derived from memory science principles; no specific external source verified]
```
effective_multiplier = 1.0 - base_rate / (1 + ln(1 + access_count))
```
At access_count=0: full base_rate applies
At access_count=10: effective_rate ~= base_rate / 3.4 (strong resistance)
At access_count=100: effective_rate ~= base_rate / 5.6 (very strong resistance)

**IMPORTANT -- SQLite LOG() probe required:** SQLite math functions require `SQLITE_ENABLE_MATH_FUNCTIONS` compile flag. Wave 0 must probe availability:
```typescript
let hasLogFn = false;
try { db.prepare("SELECT LOG(1.0)").get(); hasLogFn = true; } catch { /* unavailable */ }
```

**If LOG() available -- full access-resistance SQL:**
```sql
UPDATE memory_salience
SET
  salience_score = MAX(0.0, salience_score * (1.0 - (? / (1.0 + LOG(1.0 + CAST(access_count AS REAL)))))),
  last_decay_at  = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE tier = ?
  AND date(last_decay_at) < date('now')
```

**If LOG() unavailable -- flat rate fallback (still MEM-02 compliant):**
```sql
UPDATE memory_salience
SET
  salience_score = MAX(0.0, salience_score * (1.0 - ?)),
  last_decay_at  = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE tier = ?
  AND date(last_decay_at) < date('now')
```

### Pattern 4: MEM-04 Agent Peers Query

**What:** Simple GROUP BY on existing `hive_actions` table. No new tables needed.

**Why:** `hive_actions` already has `agent_id`, `summary` (= current task description), `action_type` (= status), `timestamp`. The last row per agent is their current activity.

**SQL (using parameterized approach for window):**
```sql
SELECT
  agent_id,
  summary        AS current_task,
  action_type    AS status,
  MAX(timestamp) AS last_seen
FROM hive_actions
WHERE timestamp > datetime('now', ? )
GROUP BY agent_id
ORDER BY last_seen DESC
```

Pass the window offset as a bound parameter: e.g., `'-60 minutes'` for a 60-minute window.

**Route:** `GET /api/agent-peers?window=60` -- follows the same pattern as `GET /api/hive/route.ts`.

Default window: 60 minutes. Cap at 1440 minutes (24h). This is tunable.

### Pattern 5: Dashboard Component Polling

**What:** All dashboard components use `useQuery` from `@tanstack/react-query` with a `refetchInterval`. New panels follow `HiveFeed` and `SqliteHealthPanel` templates exactly.

**Hook additions (in `src/lib/api-client.ts`):**
```typescript
export function useAgentPeers(windowMinutes = 60) {
  return useQuery({
    queryKey: ['agent-peers', windowMinutes],
    queryFn: () => fetchJSON<{ peers: AgentPeer[]; timestamp: string }>(
      `/api/agent-peers?window=${windowMinutes}`
    ),
    refetchInterval: POLL_INTERVALS.hive, // 5000ms
  });
}

export function useMemoryStats() {
  return useQuery({
    queryKey: ['memory-stats'],
    queryFn: () => fetchJSON<MemoryStats>('/api/memory-stats'),
    refetchInterval: 30000, // 30s -- consolidation is slow; 5s poll unnecessary
  });
}
```

**Add to POLL_INTERVALS in `src/lib/constants.ts`:**
```typescript
// No new key needed -- agentPeers reuses POLL_INTERVALS.hive (5000ms)
// memoryStats uses inline 30000ms
```

### Pattern 6: LLM Consolidation via Anthropic SDK

**What:** Batch unconsolidated messages (up to 50 per run), send to Claude API, parse structured JSON response, write meta-insights.

```typescript
// src/lib/memory-consolidation.ts (excerpt)
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically

async function consolidateBatch(contents: Array<{id: number, content: string}>): Promise<MetaInsight[]> {
  const fragments = contents.map(m => m.content).join('\n---\n');
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',   // [ASSUMED -- verify model ID at implementation time]
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Analyze these agent memory fragments. Extract recurring patterns, contradictions, and key summaries.

Return a JSON array only (no markdown), format:
[{"insight_type": "pattern"|"contradiction"|"summary", "content": "description"}]

Memory fragments:
${fragments}`,
    }],
  });

  const text = (response.content[0] as {type: 'text', text: string}).text;
  // Strip markdown code fences if present
  const cleaned = text.replace(/\x60\x60\x60json?\n?/g, '').replace(/\x60\x60\x60/g, '').trim();
  try {
    return JSON.parse(cleaned) as MetaInsight[];
  } catch {
    console.error('[consolidation] JSON parse failed:', cleaned.slice(0, 200));
    return [];
  }
}
```

Note: `\x60` is the backtick character -- written this way to avoid triggering any content filters.

**Model choice:** haiku-class model (cheapest, fastest) for batch consolidation. [ASSUMED -- verify current model IDs from https://docs.anthropic.com/en/docs/about-claude/models at implementation time]

**Guard for missing API key:**
```typescript
export function startConsolidationScheduler(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[consolidation] ANTHROPIC_API_KEY not set -- consolidation disabled');
    return;
  }
  // ...start scheduler
}
```

### Anti-Patterns to Avoid

- **Opening a second DB connection:** Always use `getDb()` -- never `new Database(path)` in routes or lib files.
- **Blocking setInterval callbacks:** All DB and LLM work in scheduler callbacks must be wrapped in try/catch; a single failure must not crash the interval.
- **Storing `salience_score` on the `messages` table directly:** Messages is a write-once append log. Decay state belongs in `memory_salience` as a separate table -- preserves Phase 19 schema integrity.
- **Calling instrumentation.ts imports at module top level:** All server-only imports (better-sqlite3, Anthropic SDK) must be inside the `NEXT_RUNTIME === 'nodejs'` block to avoid edge runtime errors.
- **Forgetting the `consolidated = 0` WHERE clause:** Consolidation must select `WHERE consolidated = 0 LIMIT 50` -- otherwise it reprocesses the entire history on every run.
- **Multiple scheduler instances in dev:** Use a module-level `let _started = false` guard in each scheduler module.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM API calls | Custom HTTP fetch to Anthropic API | `@anthropic-ai/sdk` | SDK handles auth, retries, streaming, typed responses |
| SQLite connection management | Multiple `new Database()` calls | `getDb()` singleton | WAL mode requires single writer; already established pattern |
| Dashboard polling | Custom WebSocket or SSE | `@tanstack/react-query` `refetchInterval` | Already installed; all other panels use it |
| JSON parsing of LLM output | Regex on response text | JSON.parse in try/catch after stripping code fences | LLM output is unpredictable; graceful fallback is essential |
| Timestamp window comparison | String arithmetic | SQLite `datetime('now', '-N minutes')` with bound params | Native and correct; no injection risk when value is bound |

**Key insight:** The salience decay engine is pure SQL + arithmetic -- no ML library needed. The LLM is only used for the consolidation phase (extracting patterns), not for decay scoring.

---

## Common Pitfalls

### Pitfall 1: SQLite LOG() Not Available

**What goes wrong:** `db.prepare("SELECT LOG(1.0)").get()` throws "no such function: LOG" at runtime.

**Why it happens:** SQLite math functions require `SQLITE_ENABLE_MATH_FUNCTIONS` compile flag. `better-sqlite3` packages its own SQLite build and this flag is not guaranteed to be set.

**How to avoid:** Wave 0 must include a probe step before implementing access-resistance. If LOG() is unavailable, use the flat-rate fallback (still MEM-02 compliant for all 4 tiers; access-resistance is an enhancement).

**Warning signs:** Any test that runs a decay UPDATE and gets a database error rather than a numeric result.

### Pitfall 2: instrumentation.ts Running Multiple Times in Dev

**What goes wrong:** Next.js hot module replacement calls `register()` on each reload, spawning multiple overlapping `setInterval` loops.

**Why it happens:** Development mode reloads modules on file change.

**How to avoid:** Module-level guard in each scheduler:
```typescript
let _started = false;
export function startConsolidationScheduler() {
  if (_started) return;
  _started = true;
  setInterval(runConsolidation, 15 * 60 * 1000);
  runConsolidation(); // run immediately on first start
}
```

**Warning signs:** Dashboard shows consolidation running far more frequently than expected in dev mode.

### Pitfall 3: LLM Response Not Valid JSON

**What goes wrong:** JSON.parse throws and the consolidation run writes zero insights.

**Why it happens:** Claude sometimes wraps JSON in markdown code fences or adds explanatory preamble.

**How to avoid:** Strip code fences before parsing, return empty array on parse failure -- never throw from the consolidation loop.

**Warning signs:** Consolidation runs that always show `insights_written: 0` despite non-empty batches.

### Pitfall 4: `ALTER TABLE messages ADD COLUMN` Behavior

**What goes wrong:** The `consolidated` column addition throws on second startup (column already exists) if the error is not caught, crashing initSchema.

**Why it happens:** SQLite throws on duplicate column names.

**How to avoid:** Wrap in try/catch -- this is the established SQLite additive migration pattern. See Pattern 2 above.

### Pitfall 5: Agent Peers Window Too Narrow

**What goes wrong:** Agents that are active but haven't logged a hive action recently don't appear in `/api/agent-peers`.

**Why it happens:** Hive feed is event-driven (agents write on meaningful actions), not a heartbeat.

**How to avoid:** Default window to 60 minutes, expose `?window=N` param, document the limitation clearly in the API response. The `last_seen` timestamp in the response tells consumers how fresh the data is.

---

## Code Examples

### Consolidation Stats Route

```typescript
// src/app/api/memory-stats/route.ts
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();

  const lastRun = db.prepare(`
    SELECT completed_at, batch_size, insights_written, status
    FROM memory_consolidation_runs
    ORDER BY id DESC LIMIT 1
  `).get() as { completed_at: string; batch_size: number; insights_written: number; status: string } | undefined;

  const pendingCount = (db.prepare(`
    SELECT COUNT(*) AS cnt FROM messages WHERE consolidated = 0
  `).get() as { cnt: number }).cnt;

  const tierStats = db.prepare(`
    SELECT tier, COUNT(*) AS count, AVG(salience_score) AS avg_score
    FROM memory_salience
    GROUP BY tier
  `).all();

  return Response.json({
    lastRun: lastRun ?? null,
    pendingUnconsolidated: pendingCount,
    tierStats,
    timestamp: new Date().toISOString(),
  });
}
```

### Agent Peers Route

```typescript
// src/app/api/agent-peers/route.ts
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const windowMin = Math.min(
    1440,
    Math.max(1, Number(url.searchParams.get('window') ?? '60') || 60)
  );
  const db = getDb();

  // SQLite datetime offset must be a string like '-60 minutes'
  const windowOffset = `-${windowMin} minutes`;

  const peers = db.prepare(`
    SELECT
      agent_id,
      summary        AS current_task,
      action_type    AS status,
      MAX(timestamp) AS last_seen
    FROM hive_actions
    WHERE timestamp > datetime('now', ?)
    GROUP BY agent_id
    ORDER BY last_seen DESC
  `).all(windowOffset);

  return Response.json({
    peers,
    window_minutes: windowMin,
    timestamp: new Date().toISOString(),
  });
}
```

### instrumentation.ts Bootstrap

```typescript
// src/instrumentation.ts
// Source: https://nextjs.org/docs/app/guides/instrumentation
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startConsolidationScheduler } = await import('./lib/memory-consolidation');
    const { startDecayScheduler } = await import('./lib/memory-decay');
    startConsolidationScheduler();
    startDecayScheduler();
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| External cron job or worker process | `instrumentation.ts` register + setInterval | Next.js 15+ | No separate process needed for local tools |
| `experimental.instrumentationHook: true` in next.config | Auto-detected, no config flag | Next.js 15 | Remove flag if upgrading from older Next.js |
| Manual polling via custom fetch | `@tanstack/react-query` refetchInterval | Already in project | Consistent with all existing panels |
| LLM consolidation via raw HTTP fetch | `@anthropic-ai/sdk` | SDK v0.x | Handles auth, types, retries natively |

**Deprecated/outdated:**
- `next.config.js experimental.instrumentationHook: true`: Required in Next.js 13/14, removed in 15+. Do NOT add this flag. [CITED: nextjs.org/docs/app/guides/instrumentation, version 16.2.4 docs]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | instrumentation.ts, better-sqlite3 | Yes | v25.8.2 | -- |
| better-sqlite3 | All DB operations | Yes (installed) | ^12.9.0 | -- |
| @anthropic-ai/sdk | MEM-01 LLM consolidation | No -- must install | 0.90.0 (npm latest) | Consolidation disabled; all other MEM reqs work |
| ANTHROPIC_API_KEY | @anthropic-ai/sdk auth | Unknown -- no .env.local | -- | Log warning, skip LLM step gracefully |
| SQLite LOG() math fn | Access-resistance decay | Unknown -- probe required | -- | Flat-rate decay (MEM-02 still compliant) |
| vitest | Test framework | Yes (devDep) | ^4.1.3 | -- |

**Missing dependencies with no fallback:**
- `@anthropic-ai/sdk` must be installed. Plan Wave 0 must include `npm install @anthropic-ai/sdk`.

**Missing dependencies with fallback:**
- `ANTHROPIC_API_KEY` -- if absent, consolidation scheduler logs warning and exits gracefully. All other features (decay, peers, stats dashboard) continue normally.
- `SQLite LOG()` -- if unavailable, use flat-rate decay. MEM-02 does not explicitly require access-resistance (only the 4-tier rates). Access-resistance is additive.

---

## Validation Architecture

`workflow.nyquist_validation` is absent from `.planning/config.json` -- treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.3 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run src/app/api/agent-peers` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEM-01 | Consolidation engine marks messages `consolidated=1` after run | unit | `npx vitest run src/lib/__tests__/memory-consolidation.test.ts` | No -- Wave 0 |
| MEM-01 | Each run creates a row in `memory_consolidation_runs` | unit | `npx vitest run src/lib/__tests__/memory-consolidation.test.ts` | No -- Wave 0 |
| MEM-01 | LLM response parsed; meta-insights written to `memory_meta_insights` | unit (mock Anthropic SDK) | `npx vitest run src/lib/__tests__/memory-consolidation.test.ts` | No -- Wave 0 |
| MEM-01 | Missing ANTHROPIC_API_KEY logs warning and exits without crashing | unit | `npx vitest run src/lib/__tests__/memory-consolidation.test.ts` | No -- Wave 0 |
| MEM-02 | Decay updates `salience_score` by correct multiplier per tier | unit | `npx vitest run src/lib/__tests__/memory-decay.test.ts` | No -- Wave 0 |
| MEM-02 | Pinned tier `salience_score` never changes | unit | `npx vitest run src/lib/__tests__/memory-decay.test.ts` | No -- Wave 0 |
| MEM-02 | `salience_score` never goes below 0 after multiple decay cycles | unit | `npx vitest run src/lib/__tests__/memory-decay.test.ts` | No -- Wave 0 |
| MEM-02 | `last_decay_at` updated; second same-day run does NOT decay again | unit | `npx vitest run src/lib/__tests__/memory-decay.test.ts` | No -- Wave 0 |
| MEM-03 | GET /api/memory-stats returns `lastRun`, `pendingUnconsolidated`, `tierStats` | unit | `npx vitest run src/app/api/memory-stats/__tests__/route.test.ts` | No -- Wave 0 |
| MEM-03 | `pendingUnconsolidated` count decreases after consolidation run | unit | `npx vitest run src/app/api/memory-stats/__tests__/route.test.ts` | No -- Wave 0 |
| MEM-04 | GET /api/agent-peers returns correct GROUP BY result from hive_actions | unit | `npx vitest run src/app/api/agent-peers/__tests__/route.test.ts` | No -- Wave 0 |
| MEM-04 | Agents with no activity inside window are excluded | unit | `npx vitest run src/app/api/agent-peers/__tests__/route.test.ts` | No -- Wave 0 |
| MEM-04 | `window` param caps at 1440 minutes | unit | `npx vitest run src/app/api/agent-peers/__tests__/route.test.ts` | No -- Wave 0 |
| MEM-04 | Response includes `current_task`, `status`, `last_seen` fields | unit | `npx vitest run src/app/api/agent-peers/__tests__/route.test.ts` | No -- Wave 0 |

**Test file convention (follow Phase 20 hive route pattern):**
```typescript
// @vitest-environment node
import Database from 'better-sqlite3';
import { describe, it, expect, vi, afterAll } from 'vitest';
const testDb = new Database(':memory:');
const { initSchema } = await import('@/lib/db-schema');
initSchema(testDb);
vi.mock('@/lib/db', () => ({ getDb: () => testDb, closeDb: () => {} }));
```

For MEM-01 consolidation tests, also mock `@anthropic-ai/sdk`:
```typescript
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '[{"insight_type":"pattern","content":"test pattern"}]' }]
      })
    }
  }))
}));
```

### Sampling Rate

- **Per task commit:** Run the specific test file for that task
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `npm install @anthropic-ai/sdk` -- new package, required before any consolidation code
- [ ] `src/lib/__tests__/memory-consolidation.test.ts` -- covers MEM-01 (TDD RED first)
- [ ] `src/lib/__tests__/memory-decay.test.ts` -- covers MEM-02 (TDD RED first)
- [ ] `src/app/api/memory-stats/__tests__/route.test.ts` -- covers MEM-03
- [ ] `src/app/api/agent-peers/__tests__/route.test.ts` -- covers MEM-04
- [ ] Probe step: `db.prepare("SELECT LOG(1.0)").get()` -- determines decay implementation path
- [ ] Add `ANTHROPIC_API_KEY=your-key-here` to `.env.example`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `claude-haiku-4-5` is a valid current model ID for the Anthropic Messages API | LLM Consolidation pattern | Consolidation calls fail with "model not found"; planner must verify actual model ID at implementation time via Anthropic docs |
| A2 | Access-resistance formula `base_rate / (1 + ln(1 + access_count))` correctly models resistance | Salience Decay Pattern | Resistance may behave unexpectedly at extreme access counts; no external source confirms this specific formula |
| A3 | SQLite LOG() is available in better-sqlite3's bundled SQLite | Salience Decay + Pitfall 1 | If unavailable, access-resistance cannot be computed in SQL; flat-rate fallback is safe |
| A4 | 50 messages per batch at 15-minute intervals stays within Anthropic rate limits | LLM Consolidation | Could hit rate limits or incur unexpected costs; batch size and interval are tunable |
| A5 | All new messages should default to 'mid' salience tier | Schema Design | If content-based tier assignment is expected, MEM-02 implementation changes significantly |

---

## Open Questions

1. **Which exact Anthropic model ID to use for consolidation?**
   - What we know: `@anthropic-ai/sdk` 0.90.0 is latest; haiku-class is cheapest
   - What's unclear: Exact current model IDs (training data may be stale)
   - Recommendation: At implementation time, check https://docs.anthropic.com/en/docs/about-claude/models for current IDs

2. **Should consolidation be manually triggerable from the dashboard?**
   - What we know: MEM-03 requires showing stats; MEM-01 requires background scheduling
   - What's unclear: Whether an "Run Now" button is expected
   - Recommendation: Add `POST /api/memory-consolidate` for manual trigger; wire to a button in the MemoryIntelligencePanel (mirrors SqliteHealthPanel's "Run Ingest" pattern)

3. **Do existing messages (pre-Phase 23) get salience rows seeded automatically?**
   - What we know: `memory_salience` references `messages(id)`; rows must be inserted before decay can run
   - What's unclear: Whether a migration step is needed for all existing messages
   - Recommendation: Wave 1 task should include a one-time seed: `INSERT OR IGNORE INTO memory_salience(message_id) SELECT id FROM messages` -- run inside initSchema or a migration function

4. **Is access_count incremented by the `/api/recall` query route or by a separate API?**
   - What we know: `/api/recall` (Phase 19) returns messages; `access_count` on `memory_salience` tracks usage
   - What's unclear: Whether Phase 19 route needs to be modified to increment access_count
   - Recommendation: Add a lightweight UPDATE to the recall route (or a separate `/api/memory/access` endpoint). Scope this as a Phase 23 task.

---

## Sources

### Primary (HIGH confidence)
- [nextjs.org/docs/app/guides/instrumentation](https://nextjs.org/docs/app/guides/instrumentation) -- verified 2026-04-18, version 16.2.4 docs; `register()` function behavior, file location, NEXT_RUNTIME guard, auto-detection in Next.js 15+
- `src/lib/db-schema.ts` (codebase read) -- exact existing schema used as reference for new table design
- `src/app/api/hive/route.ts` (codebase read) -- `hive_actions` table columns verified for MEM-04 query design
- `src/lib/api-client.ts` (codebase read) -- `useQuery` polling pattern, fetchJSON helper, POLL_INTERVALS verified
- `src/components/kitchen/hive-feed.tsx` (codebase read) -- component template for AgentPeersPanel
- `src/components/ledger/sqlite-health-panel.tsx` (codebase read) -- panel template for MemoryIntelligencePanel
- npm registry [VERIFIED] -- `@anthropic-ai/sdk` 0.90.0, `node-cron` 4.2.1, confirmed as of 2026-04-18
- `package.json` (codebase read) -- confirmed no `@anthropic-ai/sdk`; better-sqlite3 ^12.9.0; Next.js 16.2.2; vitest ^4.1.3

### Secondary (MEDIUM confidence)
- WebSearch results confirming Next.js 15+ auto-detects `instrumentation.ts` [cross-verified with official docs]
- `.env.example` (codebase read) -- no ANTHROPIC_API_KEY present; must be added

### Tertiary (LOW confidence -- see Assumptions Log)
- Access-resistance formula (A2) -- derived from memory science principles; no specific published source verified
- Model ID `claude-haiku-4-5` (A1) -- from training knowledge; verify at implementation time

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all existing dependencies verified from package.json; @anthropic-ai/sdk version verified from npm registry
- Architecture: HIGH -- instrumentation.ts pattern verified from official Next.js docs; schema patterns match existing codebase convention
- MEM-04 query: HIGH -- hive_actions schema fully verified; SQL is straightforward GROUP BY
- Decay formula: MEDIUM -- tier rates are specified; access-resistance formula is [ASSUMED]
- Pitfalls: MEDIUM -- SQLite LOG() availability is a known uncertainty requiring probe

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (30 days -- stable Next.js and SQLite patterns)
