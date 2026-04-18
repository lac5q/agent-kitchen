# Phase 24: Security + Audit - Research

**Researched:** 2026-04-18
**Domain:** Content scanning, SQLite audit logging, Next.js App Router API routes, React dashboard component
**Confidence:** HIGH

---

## Summary

Phase 24 adds two orthogonal capabilities: (1) a regex-based outbound content scanner that intercepts agent-generated text before it reaches the dashboard or external channels, blocking matches and flagging events; and (2) a SQLite audit log that records every significant agent action with actor, action, target, and timestamp, displayed in the dashboard as a last-20-entries panel.

The existing architecture already provides everything needed: `better-sqlite3` singleton via `getDb()`, `initSchema()` additive migration pattern, API route conventions from `/api/hive` and `/api/memory-stats`, component patterns from `HiveFeed` and `MemoryIntelligencePanel`, and `api-client.ts` hooks via TanStack Query. No new packages are required.

The scanner must be a pure utility module (`src/lib/content-scanner.ts`), not Next.js middleware. Next.js Edge middleware cannot import `better-sqlite3` or any Node.js-only module. The scanner is called explicitly inside the API route handlers that produce outbound agent content.

**Primary recommendation:** Implement the scanner as a pure function with a severity-tiered approach (HIGH-confidence patterns block, MEDIUM patterns flag but pass), call it in `POST /api/hive`, write results to the new `audit_log` SQLite table, and surface the last 20 entries in a new `AuditLogPanel` on the Kitchen Floor page alongside `HiveFeed`.

---

## Project Constraints (from CLAUDE.md)

- No `execSync`/`exec` — use `execFileSync` or pure `fs/promises` only [VERIFIED: CLAUDE.md]
- No recursive `readdir` on Obsidian vault [VERIFIED: CLAUDE.md]
- Production: `npm start` on port 3002, never `npm run dev` [VERIFIED: CLAUDE.md]
- All vector/semantic search via Qdrant Cloud — `qmd embed` FORBIDDEN [VERIFIED: STATE.md]
- mem0 writes only via `POST http://localhost:3201/memory/add` [VERIFIED: STATE.md]
- Single shared SQLite DB — all tables in `data/conversations.db` [VERIFIED: STATE.md]
- Tech stack: Next.js App Router, TypeScript, Tailwind, Vitest [VERIFIED: PROJECT.md]
- Test pattern: in-memory SQLite with `vi.mock`, TDD red-green [VERIFIED: 20-01-SUMMARY.md, 23-01-SUMMARY.md]

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^12.9.0 | SQLite read/write | Already installed; used by all Phase 19-23 data layers [VERIFIED: package.json ref in 19-VERIFICATION.md] |
| TypeScript | project standard | Type safety | Project-wide standard [VERIFIED: PROJECT.md] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query | project standard | Client-side data fetching hooks | All dashboard hooks already use it [VERIFIED: api-client.ts] |
| vitest | project standard | Unit tests | All phases use vitest with in-memory SQLite [VERIFIED: multiple SUMMARY.md files] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure regex scanner | Third-party DLP library | Regex is zero-dep, auditable, fast; third-party adds npm dep and may over-block [ASSUMED] |
| API-route interception | Next.js middleware | Middleware runs Edge runtime — cannot use better-sqlite3 or any Node.js-only module; API routes run Node.js runtime [VERIFIED: next.config.ts serverExternalPackages pattern] |

**Installation:**
```bash
# No new packages required — better-sqlite3 and @tanstack/react-query already installed
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   └── content-scanner.ts       # Pure scanner utility — no DB dependency
├── app/api/
│   ├── hive/route.ts            # MODIFIED: call scanner on POST body before DB write
│   └── audit-log/              # NEW
│       ├── route.ts             # GET /api/audit-log?limit=20
│       └── __tests__/
│           └── route.test.ts
├── components/
│   └── kitchen/
│       └── audit-log-panel.tsx  # NEW — mirrors HiveFeed pattern
└── lib/
    ├── db-schema.ts             # MODIFIED: additive audit_log table
    └── api-client.ts            # MODIFIED: useAuditLog() hook appended
```

### Pattern 1: Pure Scanner Utility

**What:** A standalone TypeScript module exporting `scanContent(text: string): ScanResult`. No imports from `@/lib/db` or `@/lib/constants`. No side effects. Returns `{ blocked: boolean; matches: ScanMatch[] }`.

**When to use:** Called at the top of every API route handler that accepts agent-generated content before any DB write.

**Why pure:** Testable without DB setup, reusable across all routes, composable with different severity thresholds.

```typescript
// Source: [ASSUMED — design based on project patterns]
export interface ScanMatch {
  patternName: string;
  severity: 'HIGH' | 'MEDIUM';
  redacted: string;   // matched substring replaced with [REDACTED]
}

export interface ScanResult {
  blocked: boolean;   // true if any HIGH-severity match found
  matches: ScanMatch[];
  cleanContent: string; // content with HIGH matches redacted
}

export function scanContent(text: string): ScanResult {
  const matches: ScanMatch[] = [];
  let cleanContent = text;

  for (const { name, pattern, severity } of PATTERNS) {
    const found = pattern.exec(text);
    if (found) {
      matches.push({ patternName: name, severity, redacted: found[0].slice(0, 8) + '...' });
      if (severity === 'HIGH') {
        cleanContent = cleanContent.replace(pattern, '[REDACTED]');
      }
    }
  }

  return {
    blocked: matches.some(m => m.severity === 'HIGH'),
    matches,
    cleanContent,
  };
}
```

### Pattern 2: Audit Log Write Helper

**What:** A small helper `writeAuditLog(db, entry)` called after scanning or after significant actions. Inserts one row into `audit_log`. Not a class; not a scheduler.

**When to use:** Called in each API route that performs a significant action. Fire-and-forget with try/catch so audit log failure never breaks the primary action.

```typescript
// Source: [ASSUMED — mirrors hive_actions insert pattern from route.ts]
export function writeAuditLog(
  db: Database.Database,
  entry: { actor: string; action: string; target: string; detail?: string; severity?: string }
): void {
  try {
    db.prepare(
      `INSERT INTO audit_log(actor, action, target, detail, severity)
       VALUES (@actor, @action, @target, @detail, @severity)`
    ).run({
      actor: entry.actor,
      action: entry.action,
      target: entry.target,
      detail: entry.detail ?? null,
      severity: entry.severity ?? 'info',
    });
  } catch {
    // Audit log failure must never break the primary action
    console.error('[audit] write failed:', entry);
  }
}
```

### Pattern 3: API Route Integration (POST /api/hive modified)

**What:** Before writing any hive action to DB, call `scanContent(body.summary)`. If blocked, write a `content_blocked` audit log entry and return 403. If flagged only, write `content_flagged` audit entry and proceed with clean content.

```typescript
// Source: [ASSUMED — design based on existing POST /api/hive pattern]
export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();

  // SEC-01: Scan outbound content before DB write
  const scan = scanContent(body.summary ?? '');
  const auditAction = scan.blocked
    ? 'content_blocked'
    : scan.matches.length > 0
      ? 'content_flagged'
      : 'hive_action_write';

  writeAuditLog(db, {
    actor: body.agent_id ?? 'unknown',
    action: auditAction,
    target: 'hive_actions',
    detail: scan.matches.length > 0
      ? JSON.stringify(scan.matches.map(m => m.patternName))
      : null,
    severity: scan.blocked ? 'high' : scan.matches.length > 0 ? 'medium' : 'info',
  });

  if (scan.blocked) {
    return Response.json({ error: 'Content blocked by security scanner' }, { status: 403 });
  }

  // ... rest of existing POST handler using scan.cleanContent instead of body.summary
}
```

### Anti-Patterns to Avoid

- **Scanning in Next.js middleware:** Edge runtime cannot import better-sqlite3 or any Node.js-only module. All scanning must happen in API routes (Node.js runtime).
- **Blocking on regex-keyword false positives:** The word "password" or "API key" in a legitimate summary should not block. Use high-confidence patterns (structural patterns like `AKIA[0-9A-Z]{16}`) for blocking; use keyword heuristics only for flagging.
- **Synchronous full-text scan without length guard:** Wrap regex execution with try/catch in case of catastrophic backtracking. Use non-greedy quantifiers and avoid unbounded `.*` on long strings. Set a content length cap before running patterns.
- **Storing raw matched secrets in audit_log:** Store only the pattern name and a truncated redacted preview, never the full matched value.
- **Making audit log write block on the critical path:** Wrap in try/catch; a failed audit write must never cause the primary route handler to error.

---

## Regex Patterns — Required 15+

All patterns tagged [ASSUMED] (standard security pattern library from training knowledge). Severity: HIGH = block and redact; MEDIUM = flag only.

| # | Name | Severity | Rationale |
|---|------|---------|-----------|
| 1 | `aws_access_key` | HIGH | Matches `AKIA` prefix + 16 alphanumeric chars — highly specific AWS IAM key format [ASSUMED] |
| 2 | `aws_secret_key` | HIGH | Matches `aws` near `secret` near a 40-char base64 string in quotes [ASSUMED] |
| 3 | `github_token_pat` | HIGH | Matches `ghp_` prefix + 36 alphanumeric chars — GitHub personal access token [ASSUMED] |
| 4 | `github_token_oauth` | HIGH | Matches `gho_` prefix — GitHub OAuth token [ASSUMED] |
| 5 | `github_token_server` | HIGH | Matches `ghs_` prefix — GitHub server-to-server token [ASSUMED] |
| 6 | `pem_private_key` | HIGH | Matches PEM private key header (`-----BEGIN ... PRIVATE KEY-----`) — unambiguous [ASSUMED] |
| 7 | `jwt_token` | HIGH | Matches three base64url segments separated by dots — JWT structure [ASSUMED] |
| 8 | `credit_card` | HIGH | Matches Visa/MC/Amex/Discover card number formats using standard BIN ranges [ASSUMED] |
| 9 | `ssn_us` | HIGH | Matches `DDD-DD-DDDD` hyphenated US Social Security Number format [ASSUMED] |
| 10 | `password_in_url` | HIGH | Matches `scheme://user:pass@host` — credential-bearing URLs [ASSUMED] |
| 11 | `slack_webhook` | HIGH | Matches full Slack incoming webhook URL pattern [ASSUMED] |
| 12 | `xss_script_tag` | HIGH | Matches opening `<script` tag — XSS injection vector [ASSUMED] |
| 13 | `shell_injection` | HIGH | Matches semicolon-prefixed shell commands or backtick execution in content [ASSUMED] |
| 14 | `email_address` | MEDIUM | Standard email format — PII but agents legitimately discuss emails [ASSUMED] |
| 15 | `phone_us` | MEDIUM | US phone number in common formats including international prefix [ASSUMED] |
| 16 | `generic_secret_assign` | MEDIUM | Key-value pairs where key contains password/secret/api_key/token and value is 8+ chars in quotes [ASSUMED] |
| 17 | `generic_long_token` | MEDIUM | Generic 40+ alphanumeric char token/key blob — many false positives expected; flag only [ASSUMED] |
| 18 | `sql_injection_union` | MEDIUM | Classic SQL injection keywords: UNION SELECT, DROP TABLE, etc. [ASSUMED] |

**Total: 18 patterns** (exceeds 15 requirement).

**Implementation note:** Mount all patterns in a single exported `PATTERNS` array as `{ name: string, pattern: RegExp, severity: 'HIGH' | 'MEDIUM' }`. Use `pattern.test()` for quick detection, then `pattern.exec()` for match capture. If any pattern uses the `g` flag (global), reset `lastIndex = 0` after each call to prevent stateful regex bugs.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Content length check before scan | Custom buffer logic | Simple `if (text.length > MAX_SCAN_LEN) return { blocked: false, matches: [] }` | Hard limit prevents ReDoS on unbounded input [ASSUMED] |
| Relative timestamps in AuditLogPanel | New formatter | Copy `formatRelativeTime()` from `hive-feed.tsx` | Already exists and tested; consistent UI [VERIFIED: hive-feed.tsx lines 51-66] |
| Polling hook in api-client.ts | New fetch abstraction | `useQuery` via `fetchJSON` — same pattern as `useHiveFeed()` | Established pattern; zero friction [VERIFIED: api-client.ts] |
| Parameterized DB writes | String interpolation | `db.prepare(...).run({ ... })` — existing pattern | Prevents SQL injection; matches all existing routes [VERIFIED: hive/route.ts] |

**Key insight:** The scanner is intentionally dependency-free. It must not import `getDb()`, `constants`, or anything from `@/lib`. This keeps it testable as a pure function and prevents circular imports.

---

## SQLite Schema for audit_log

Follows the exact same conventions as `hive_actions` (same file: `src/lib/db-schema.ts`, same `initSchema()` additive append). No FTS5 — queries are by recency only. [VERIFIED: existing schema pattern from db-schema.ts]

```sql
-- Additive append to initSchema() in src/lib/db-schema.ts
-- Source: [ASSUMED — designed to match db-schema.ts conventions]
CREATE TABLE IF NOT EXISTS audit_log (
  id        INTEGER PRIMARY KEY,
  actor     TEXT    NOT NULL,
  action    TEXT    NOT NULL,
  target    TEXT    NOT NULL,
  detail    TEXT,
  severity  TEXT    NOT NULL DEFAULT 'info'
            CHECK(severity IN ('info','medium','high')),
  timestamp TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS audit_log_ts
  ON audit_log(timestamp DESC);
```

**Column semantics:**
- `actor` — agent_id that triggered the action (e.g., `"claude"`, `"paperclip"`, `"system"`)
- `action` — vocabulary string (see Significant Actions section below)
- `target` — what was acted upon (e.g., `"hive_actions"`, `"recall"`, `"consolidation"`)
- `detail` — JSON-serialized supplementary data (matched pattern names, task_id, etc.); nullable
- `severity` — `info` for normal actions, `medium` for flagged content, `high` for blocked content

---

## Significant Actions Vocabulary

Every row written to `audit_log` uses one of these `action` strings. This defines the audit vocabulary for all routes.

| Action | Trigger | Severity | Route |
|--------|---------|---------|-------|
| `hive_action_write` | Successful hive action POST (no scan match) | info | POST /api/hive |
| `hive_delegation_upsert` | Delegation created or updated | info | POST /api/hive (delegation branch) |
| `content_flagged` | Outbound content matched MEDIUM pattern(s) but not blocked | medium | POST /api/hive |
| `content_blocked` | Outbound content matched HIGH pattern(s) — action aborted | high | POST /api/hive |
| `ingest_run` | JSONL ingestion completed | info | POST /api/recall/ingest |
| `consolidation_run` | Memory consolidation completed | info | POST /api/memory-consolidate |

This vocabulary can be extended by future phases. The CHECK constraint on `audit_log.severity` enforces severity values; `action` is intentionally unconstrained to allow extension.

---

## API Route: GET /api/audit-log

**File:** `src/app/api/audit-log/route.ts`

```typescript
// Source: [ASSUMED — mirrors memory-stats/route.ts pattern]
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '20') || 20));
  const db = getDb();

  const rows = db
    .prepare(`SELECT id, actor, action, target, detail, severity, timestamp
              FROM audit_log
              ORDER BY timestamp DESC
              LIMIT ?`)
    .all(limit);

  return Response.json({ entries: rows, timestamp: new Date().toISOString() });
}
```

---

## Dashboard Placement

**Page:** Kitchen Floor (`src/app/page.tsx` or root page — where `HiveFeed` and `AgentPeersPanel` already render)

**Component:** `src/components/kitchen/audit-log-panel.tsx`

**Why Kitchen Floor:** This is the operational page. `HiveFeed` is already here showing cross-agent actions. The audit panel is the security-focused companion feed. Keeping both on the same page lets operators see the full picture without navigation. [VERIFIED: hive-feed.tsx lives in `src/components/kitchen/`]

**Component structure:** Mirror `HiveFeed` exactly:
- Same section header pattern (`text-xs font-medium uppercase tracking-wide` with amber divider)
- Same loading/empty/list states
- Same `formatRelativeTime()` helper (copy or import from hive-feed)
- Severity-colored chips: `info`=slate, `medium`=amber, `high`=rose — matching the ACTION_COLORS pattern in hive-feed.tsx [VERIFIED: hive-feed.tsx lines 6-47]

**Hook:** `useAuditLog(limit = 20)` appended to `src/lib/api-client.ts` following `useHiveFeed` pattern with `refetchInterval: POLL_INTERVALS.hive` (5000ms).

```typescript
// Append to src/lib/api-client.ts
// Source: [ASSUMED — mirrors useHiveFeed pattern from api-client.ts lines 240-257]
export function useAuditLog(limit = 20) {
  return useQuery({
    queryKey: ['audit-log', limit],
    queryFn: () =>
      fetchJSON<{
        entries: Array<{
          id: number;
          actor: string;
          action: string;
          target: string;
          detail: string | null;
          severity: string;
          timestamp: string;
        }>;
        timestamp: string;
      }>(`/api/audit-log?limit=${limit}`),
    refetchInterval: POLL_INTERVALS.hive,
  });
}
```

---

## Common Pitfalls

### Pitfall 1: Regex ReDoS on Long Agent Content
**What goes wrong:** Agent summaries can be long (500-2000 chars). Patterns with nested quantifiers will catastrophically backtrack on long non-matching strings.
**Why it happens:** JavaScript regex engine is backtracking-based; certain patterns are O(n²) or worse.
**How to avoid:** (1) Set a max scan length (e.g., 4096 chars) — truncate or skip scanning beyond that. (2) The patterns in the list above are designed to avoid nested quantifiers. (3) Use `try/catch` around each pattern exec call.
**Warning signs:** Slow test runs on large input strings; route handler timeouts exceeding 5000ms.

### Pitfall 2: False Positive Blocking Legitimate Content
**What goes wrong:** An agent summary discussing security patterns gets blocked because the pattern matcher fires on illustrative text.
**Why it happens:** Keyword-based patterns like `generic_secret_assign` match literal examples of the pattern in text.
**How to avoid:** The severity tiering (HIGH=block, MEDIUM=flag) handles this. Only structural, high-specificity patterns (AWS keys, PEM headers, JWTs, credit cards) trigger blocking. Generic keyword patterns are MEDIUM (flagged only). Review the MEDIUM patterns carefully.
**Warning signs:** Dashboard actions not appearing after an agent discusses security concepts.

### Pitfall 3: Audit Log on Critical Path
**What goes wrong:** `writeAuditLog()` throws synchronously, crashing the route handler and losing the primary action.
**Why it happens:** SQLite errors (disk full, lock timeout under high concurrency) are not handled.
**How to avoid:** Wrap all `writeAuditLog()` calls in try/catch. The function itself already has the try/catch (see Pattern 2). Never make audit log writes conditional for the primary action — the primary action must succeed even if audit write fails.
**Warning signs:** Route returning 500 with SQLite error message after long uptime.

### Pitfall 4: `vi.mock` Factory with ES Modules (same trap as Phase 20/23)
**What goes wrong:** `vi.mock('@/lib/db')` inside test file fails because the `@` alias doesn't resolve inside the CJS require context of the hoisted mock factory.
**Why it happens:** Vitest hoists `vi.mock` calls to the top of the file; the `@` alias is a webpack/bundler concept unavailable in the raw CJS mock factory.
**How to avoid:** Follow the Phase 20 pattern: initialize the in-memory DB at module level before `vi.mock`, pass the initialized `testDb` via closure into the mock factory. [VERIFIED: 20-01-SUMMARY.md lines 107-108]
**Warning signs:** "Cannot find module '@/lib/db-schema'" error in tests.

### Pitfall 5: Scanner Called on Non-String Input
**What goes wrong:** `scanContent(undefined)` throws, crashing the route.
**Why it happens:** Agent payloads may omit `summary` field or pass null.
**How to avoid:** Always call `scanContent(body.summary ?? '')` — null-coalesce to empty string before passing to scanner.

### Pitfall 6: Global Regex Flag Statefulness
**What goes wrong:** A regex with the `g` flag retains `lastIndex` between calls. The second invocation on a matching string starts mid-string and misses the match.
**Why it happens:** JavaScript `RegExp` with `g` flag is stateful; `test()` and `exec()` advance `lastIndex`.
**How to avoid:** Either omit the `g` flag on all PATTERNS entries (single-match per call is sufficient for detection), or reset `pattern.lastIndex = 0` after each call.

---

## Runtime State Inventory

Step 2.5: SKIPPED — This is a greenfield addition (new table, new module, new component). No existing data contains the string "audit_log" or "content_scanner". No runtime state migration required.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 24 introduces no external dependencies. `better-sqlite3` is already installed and operational. No new CLIs, services, runtimes, or databases required.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (project standard) |
| Config file | vitest.config.ts (project root) |
| Quick run command | `npx vitest run src/lib/__tests__/content-scanner.test.ts src/app/api/audit-log/__tests__/route.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | 18 patterns scan outbound content; HIGH match -> blocked=true; MEDIUM match -> blocked=false with matches | unit | `npx vitest run src/lib/__tests__/content-scanner.test.ts` | No — Wave 0 |
| SEC-01 | POST /api/hive returns 403 when scan blocks HIGH-severity content | unit | `npx vitest run src/app/api/hive/__tests__/route.test.ts` | Yes (extend existing) |
| SEC-02 | POST /api/hive writes audit_log row with correct actor/action/target/severity | unit | `npx vitest run src/app/api/hive/__tests__/route.test.ts` | Yes (extend existing) |
| SEC-02 | POST /api/recall/ingest writes `ingest_run` audit row | unit | `npx vitest run src/app/api/recall/__tests__/route.test.ts` | Yes (extend existing) |
| SEC-02 | GET /api/audit-log returns last 20 entries ordered by timestamp DESC | unit | `npx vitest run src/app/api/audit-log/__tests__/route.test.ts` | No — Wave 0 |
| SEC-03 | AuditLogPanel renders entries with actor/action/timestamp; shows empty state when no entries | unit | `npx vitest run src/components/kitchen/__tests__/audit-log-panel.test.tsx` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/__tests__/content-scanner.test.ts src/app/api/audit-log/__tests__/route.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/__tests__/content-scanner.test.ts` — covers SEC-01 (all 18 patterns, severity tiering, ReDoS guard, null-coalesce, global flag safety)
- [ ] `src/app/api/audit-log/__tests__/route.test.ts` — covers SEC-02/SEC-03 API surface (limit param, ordering, schema columns)
- [ ] `src/components/kitchen/__tests__/audit-log-panel.test.tsx` — covers SEC-03 component (loading/empty/list states, severity chip colors)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | single-user tool, no auth layer |
| V3 Session Management | no | single-user tool |
| V4 Access Control | no | single-user tool |
| V5 Input Validation | yes | `scanContent()` validates and sanitizes all inbound agent text before persistence |
| V6 Cryptography | no | no new crypto operations |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Agent-generated content containing secrets | Information Disclosure | HIGH-severity regex patterns + redaction + blocking |
| Malicious content injected via agent summary field | Tampering / Elevation | Scanner blocks HTML script tags and injection-adjacent patterns |
| ReDoS via crafted agent content | Denial of Service | Length cap (4096 chars) + non-backtracking pattern design + try/catch per-pattern |
| Audit log bypass (audit write failure silently hiding action) | Repudiation | try/catch logs to console.error; primary action never blocked by audit failure |
| SQL injection via actor/target fields in audit_log write | Tampering | better-sqlite3 parameterized `.run()` — same protection as all existing routes [VERIFIED: 20-01-SUMMARY.md threat T-20-03] |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Middleware-based content filtering | API-route-level scanning | App Router era | Middleware = Edge runtime; cannot use Node.js modules |
| Full DLP library | Targeted regex patterns | Pragmatic choice for single-user tools | Zero deps; auditable; adequate for this threat model |

**Deprecated/outdated:**
- Next.js Pages Router `_middleware.ts`: replaced by App Router `middleware.ts` with Edge runtime constraints; not applicable here.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 18 regex patterns listed cover the required leak categories for this threat model | Regex Patterns | Could under-scan; planner should review and extend if needed |
| A2 | AuditLogPanel belongs on Kitchen Floor (root page) alongside HiveFeed | Dashboard Placement | Minor UX misplacement; easy to move |
| A3 | `writeAuditLog` helper should be a standalone exported function, not a method on a class | Architecture | Style choice; no functional impact |
| A4 | Content length cap of 4096 chars is sufficient | Pitfalls | If agents write very long summaries, scan is skipped; cap may need tuning |
| A5 | Only POST /api/recall/ingest and POST /api/memory-consolidate warrant audit log writes beyond /api/hive | Significant Actions | Other routes may also warrant auditing; planner should review all POST routes |
| A6 | Regex patterns without `g` flag (single-match per call) is the correct mode for this scanner | Regex Patterns | If global flag accidentally included, statefulness bug per Pitfall 6 |

---

## Open Questions

1. **Should scanner run on hive delegation fields (task_summary, checkpoint) in addition to summary?**
   - What we know: POST /api/hive handles both actions (body.summary) and delegations (body.task_summary + body.checkpoint)
   - What's unclear: Delegation checkpoint is agent-controlled JSON blob; may contain secrets
   - Recommendation: Scan `body.task_summary` too; skip `body.checkpoint` (structured JSON would have excessive false positives on base64/token-like values)

2. **Should GET /api/audit-log be protected?**
   - What we know: PROJECT.md says "single-user local tool" — no auth layer on any existing route
   - What's unclear: Whether the Cloudflare tunnel endpoint should restrict this
   - Recommendation: Follow existing pattern — no auth on the route; Cloudflare tunnel provides network-level access control

---

## Sources

### Primary (HIGH confidence)
- `src/lib/db-schema.ts` — existing SQLite schema conventions, table/trigger patterns [VERIFIED]
- `src/lib/db.ts` — DB singleton, WAL/NORMAL/busy_timeout pragmas [VERIFIED]
- `src/app/api/hive/route.ts` — API route structure, validation, parameterized queries [VERIFIED]
- `src/components/kitchen/hive-feed.tsx` — component pattern, color map, relative time helper [VERIFIED]
- `src/lib/api-client.ts` — hook pattern, useQuery, fetchJSON, refetchInterval [VERIFIED]
- `.planning/phases/20-hive-mind-coordination/20-01-SUMMARY.md` — threat mitigations T-20-01 through T-20-03, vi.mock factory pitfall [VERIFIED]
- `.planning/phases/23-memory-intelligence/23-01-SUMMARY.md` — instrumentation pattern, additive migrations [VERIFIED]
- `.planning/STATE.md` — architecture decisions (single DB, Node.js constraints) [VERIFIED]
- `.planning/PROJECT.md` — tech stack, constraints, no-execSync rule [VERIFIED]

### Secondary (MEDIUM confidence)
- Next.js App Router docs — Edge runtime limitations for middleware [ASSUMED based on next.config.ts serverExternalPackages pattern in codebase]

### Tertiary (LOW confidence)
- Regex patterns for PII/secrets — industry-standard patterns [ASSUMED from training knowledge; verify against OWASP ESAPI or Gitleaks rules during implementation]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all patterns verified from codebase
- Architecture: HIGH — scanner placement, schema, component all follow established codebase patterns
- Regex patterns: MEDIUM — standard industry patterns; specific regex correctness requires implementation testing
- Pitfalls: HIGH — drawn from Phase 20 and 23 SUMMARY deviations

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (stable tech stack; regex pattern list may need review against current Gitleaks rules)
