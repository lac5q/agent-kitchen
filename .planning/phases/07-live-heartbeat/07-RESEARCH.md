# Phase 7: Live Heartbeat — Research

**Researched:** 2026-04-12
**Domain:** Next.js API route extension + filesystem signal parsing
**Confidence:** HIGH — all findings from direct codebase inspection

---

## Summary

Phase 7 replaces two hardcoded status returns in `react-flow-canvas.tsx` with live signals derived from filesystem state. The Obsidian node gets its status from whether today's journal file exists in `~/github/knowledge/journals/`. The knowledge-curator node gets its status from parsing `/tmp/knowledge-curator.log` — checking the timestamp of the last "Knowledge Curator complete." line.

The implementation pattern is already in place. `/api/health/route.ts` has a clean `checkService()` abstraction. The `svcMap` in `getStatus()` already routes service names to node IDs. This phase is purely additive: two new `checkService()` entries in the API, two new svcMap entries, two hardcoded lines removed.

Zero new packages. Zero new React state. Zero changes to types (the `HealthStatus` type already supports `"degraded"` for the idle/warning state). The curator log already exists in the format required — the `knowledge-curator.sh` script has already been updated to include Step 6 and logs `"Knowledge Curator complete."` at the end.

**Primary recommendation:** Add Obsidian + Curator as `checkService()` entries returning `"up"/"degraded"/"down"`, add both to `svcMap`, delete lines 163–164 from `getStatus()`.

---

## Project Constraints (from CLAUDE.md and PROJECT.md)

| Constraint | Rule |
|------------|------|
| No execSync/exec | Use `execFileSync` or pure `fs/promises` — security hook enforces this |
| No recursive readdir | Stat 3–5 known vault paths only — 518+ files, 10s poll cycle |
| Server-side checks only | Filesystem is not accessible from browser; all checks in Next.js API route |
| Production = `npm start --port 3002` | Always `npm run build` before `npm start`; dev server breaks CF tunnel |
| 26h window for curator | Cron runs at 2am; at midnight it is 22h stale — 1h window always shows idle |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FLOW-08 | Obsidian node derives status from live vault filesystem signals (today's journal exists → active; >24h → idle; inaccessible → error) — hardcoded status removed | obsidianStatus() checks vault root + today's journal path; svcMap routes "Obsidian" service name to node; hardcoded line 163 removed |
| FLOW-09 | knowledge-curator node derives status from /tmp/knowledge-curator.log (ran <26h + complete → active; ran with warnings → idle; missed cron → error) — hardcoded status removed | curatorStatus() parses last run block for completion sentinel + Warning: lines; 26h mtime window; svcMap routes "Curator" service name to node; hardcoded line 164 removed |
</phase_requirements>

---

## Exact Locations of Code to Change

### Out-of-Scope Clarification: nodeStats Panel

The `nodeStats()` function (lines 187–188 of react-flow-canvas.tsx) has static entries for both nodes:
- `case "knowledge-curator": return { "Schedule": "nightly 2am", "Steps": 5 };`
- `case "obsidian": return { "Type": "Knowledge Vault", "Docs": "3,400+" };`

FLOW-08 and FLOW-09 only require that **node color** (status) derives from live signals. The stats panel content is static and remains unchanged. Do not expand scope to make nodeStats dynamic in this phase.

### Hardcoded Lines to Remove

**File:** `src/components/flow/react-flow-canvas.tsx`

```typescript
// Line 163 — REMOVE this:
if (nodeId === "obsidian") return "active";
// Line 164 — REMOVE this:
if (nodeId === "knowledge-curator") return "idle";
```

[VERIFIED: direct file read, lines 163–164]

### svcMap to Extend

**File:** `src/components/flow/react-flow-canvas.tsx`, line 168

```typescript
// CURRENT (line 168):
const svcMap: Record<string, string> = { gateways: "Agents", manager: "Paperclip", notebooks: "mem0", librarian: "QMD", qdrant: "Qdrant" };

// UPDATED — add two entries:
const svcMap: Record<string, string> = {
  gateways: "Agents",
  manager: "Paperclip",
  notebooks: "mem0",
  librarian: "QMD",
  qdrant: "Qdrant",
  obsidian: "Obsidian",
  "knowledge-curator": "Curator",
};
```

[VERIFIED: direct file read, line 168]

### Status Mapping Behavior

The existing `getStatus()` maps `HealthStatus.status` → node color as follows (lines 170–172):

| HealthStatus.status | Node status returned | Visual color |
|--------------------|---------------------|--------------|
| `"up"` | `"active"` | emerald (#10b981) |
| `"down"` | `"error"` | red (#f43f5e) |
| `"degraded"` | `"idle"` | amber (#f59e0b) — falls through to default |

[VERIFIED: getStatus() logic at lines 169–172]

This means the health route can express all three node states (active/idle/error) using the existing `"up"/"degraded"/"down"` enum. **No type changes needed.**

---

## Current `/api/health/route.ts` Structure

**File:** `src/app/api/health/route.ts`

```typescript
import { execFileSync } from "child_process";
import { stat as fsStat } from "fs/promises";
import { MEM0_URL, AGENT_CONFIGS_PATH } from "@/lib/constants";
import type { HealthStatus } from "@/types";

export const dynamic = "force-dynamic";

async function checkService(
  name: string,
  checkFn: () => Promise<void>
): Promise<HealthStatus> {
  const start = Date.now();
  try {
    await checkFn();
    return { service: name, status: "up", latencyMs: Date.now() - start, lastCheck: new Date().toISOString() };
  } catch {
    return { service: name, status: "down", latencyMs: null, lastCheck: new Date().toISOString() };
  }
}
```

[VERIFIED: direct file read, lines 1–29]

**Critical gap:** `checkService()` only returns `"up"` or `"down"` — it has no way to return `"degraded"`. For the Obsidian idle state (vault accessible, journal stale) and curator idle state (log present, warnings found), we need a different approach.

**Solution:** Do not use `checkService()` directly for these two entries. Instead, write a `checkServiceWithStatus()` helper or compute each status inline and push a `HealthStatus` object directly. See Code Examples section below.

---

## How to Add Obsidian + Curator to the Health API

### Pattern: Inline service result construction

The two new checks cannot use the existing `checkService()` because they need `"degraded"` as a possible return. The correct approach is to build the `HealthStatus` object directly:

```typescript
// In the GET() handler, add alongside the existing Promise.all entries:
checkService("Obsidian", async () => { ... }),   // ← will NOT work for 3-state
```

Instead, add a helper that accepts a status function:

```typescript
async function checkServiceTristate(
  name: string,
  checkFn: () => Promise<"up" | "degraded" | "down">
): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const status = await checkFn();
    return {
      service: name,
      status,
      latencyMs: Date.now() - start,
      lastCheck: new Date().toISOString(),
    };
  } catch {
    return { service: name, status: "down", latencyMs: null, lastCheck: new Date().toISOString() };
  }
}
```

Add `checkServiceTristate("Obsidian", ...)` and `checkServiceTristate("Curator", ...)` to the `Promise.all` array.

[VERIFIED: existing checkService pattern is binary; HealthStatus type has 3 states; types/index.ts line 58]

---

## Obsidian Filesystem Check Logic

**Primary signal:** `fsStat` on `~/github/knowledge/journals/YYYY-MM-DD.md`
**Secondary signal:** `fsStat` on `~/github/knowledge/` (vault root accessibility)

**Logic:**

```typescript
import { stat as fsStat } from "fs/promises";

async function obsidianStatus(): Promise<"up" | "degraded" | "down"> {
  const vaultRoot = `${process.env.HOME}/github/knowledge`;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const journalPath = `${vaultRoot}/journals/${today}.md`;

  // Check vault root first
  try {
    await fsStat(vaultRoot);
  } catch {
    return "down"; // vault inaccessible → error
  }

  // Check today's journal
  try {
    await fsStat(journalPath);
    return "up"; // vault accessible + today's journal exists → active
  } catch {
    return "degraded"; // vault accessible but no today's journal → idle
  }
}
```

**State mapping:**
| Condition | HealthStatus | Node color |
|-----------|-------------|-----------|
| Vault inaccessible | `"down"` | red |
| Vault OK, today's journal missing | `"degraded"` | amber |
| Vault OK, today's journal exists | `"up"` | green |

[VERIFIED: vault path `~/github/knowledge/journals/` confirmed; today's journal `2026-04-12.md` confirmed present at stat inspection]

**Performance:** Two `fsStat` calls per 10s poll. No directory listing. No recursion. Complies with "stat 3–5 known paths only" constraint.

---

## Curator Log Parsing Logic

**Log file:** `/tmp/knowledge-curator.log`
**Log format** (from `knowledge-curator.sh` inspection):

```
[2026-04-12 02:00:03] Starting Knowledge Curator...
[2026-04-12 02:00:04] [1/5] GitNexus analyze...
[2026-04-12 02:00:07]   Warning: gitnexus-index failed (non-fatal)
[2026-04-12 02:00:09] [2/5] llm-wiki raw processing check...
[2026-04-12 02:00:12] [3/5] mem0 highlights export...
[2026-04-12 02:00:15] [4/5] QMD update + Qdrant indexing...
[2026-04-12 02:00:20] [5/6] Personal transcript ingestion...
[2026-04-12 02:00:25] [6/6] Obsidian → mem0 journal sync...
[2026-04-12 02:00:28] Knowledge Curator complete.
```

[VERIFIED: knowledge-curator.sh direct read — log() prefix pattern confirmed]

**Key log facts:**
- Start sentinel: `"Starting Knowledge Curator..."` — timestamp on this line = run start time
- End sentinel: `"Knowledge Curator complete."` — presence confirms run finished
- Warning pattern: `"  Warning:"` — indicates a step failed non-fatally
- The log file is appended (not overwritten) on each run; multiple runs accumulate
- Log file is `/tmp/knowledge-curator.log` — may not exist if cron has never run

**Parse algorithm:**

```typescript
import { readFile, stat as fsStat } from "fs/promises";

async function curatorStatus(): Promise<"up" | "degraded" | "down"> {
  const logPath = process.env.CURATOR_LOG_PATH || "/tmp/knowledge-curator.log";
  const WINDOW_MS = 26 * 60 * 60 * 1000; // 26 hours

  // Check if log exists and is fresh
  let logStats: Awaited<ReturnType<typeof fsStat>>;
  try {
    logStats = await fsStat(logPath);
  } catch {
    return "down"; // log missing → cron never ran or log was cleared
  }

  const ageMs = Date.now() - logStats.mtimeMs;
  if (ageMs > WINDOW_MS) {
    return "down"; // log not modified in 26h → missed cron run
  }

  // Log is fresh — read content to check completion + warnings
  let content: string;
  try {
    content = await readFile(logPath, "utf8");
  } catch {
    return "down";
  }

  const lines = content.split("\n");

  // Find the last "Starting Knowledge Curator..." line — most recent run block
  let lastRunStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes("Starting Knowledge Curator...")) {
      lastRunStart = i;
      break;
    }
  }

  if (lastRunStart === -1) {
    return "down"; // no valid run block found
  }

  // Look at lines from lastRunStart to end
  const runLines = lines.slice(lastRunStart);
  const completed = runLines.some(l => l.includes("Knowledge Curator complete."));
  const hasWarnings = runLines.some(l => l.includes("Warning:"));

  if (!completed) return "down";   // run started but did not finish
  if (hasWarnings) return "degraded"; // ran with step failures → idle/amber
  return "up"; // clean run
}
```

**State mapping:**
| Condition | HealthStatus | Node color |
|-----------|-------------|-----------|
| Log missing | `"down"` | red |
| Log mtime > 26h | `"down"` | red |
| Log fresh, run incomplete | `"down"` | red |
| Log fresh, run complete with warnings | `"degraded"` | amber |
| Log fresh, run complete, no warnings | `"up"` | green |

[VERIFIED: log format from knowledge-curator.sh; 26h window from SUMMARY.md and KICKOFF.md; log absence confirmed (never run in this session)]

**Performance note:** `readFile` on a log file. The log accumulates across runs — after months of daily runs at ~10 lines/run, this is ~3,650 lines/year. Still a fast read. No size issue.

---

## Environment Variables to Add

**File:** `src/lib/constants.ts`

Add after the existing path constants (line 41):

```typescript
export const OBSIDIAN_VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || `${process.env.HOME}/github/knowledge`;
export const CURATOR_LOG_PATH = process.env.CURATOR_LOG_PATH || "/tmp/knowledge-curator.log";
```

Use `OBSIDIAN_VAULT_PATH` in the health route for vault root and journal path construction.
Use `CURATOR_LOG_PATH` in the health route for the log file path.

[VERIFIED: existing pattern from constants.ts lines 37–40; SUMMARY.md confirms these two env var names]

---

## Build Order

1. **Add constants** (`src/lib/constants.ts`) — `OBSIDIAN_VAULT_PATH`, `CURATOR_LOG_PATH`
2. **Extend health API** (`src/app/api/health/route.ts`):
   - Add `checkServiceTristate()` helper
   - Import `readFile` from `fs/promises` (alongside existing `stat`)
   - Import new constants
   - Add `checkServiceTristate("Obsidian", obsidianStatus)` to `Promise.all`
   - Add `checkServiceTristate("Curator", curatorStatus)` to `Promise.all`
3. **Update canvas** (`src/components/flow/react-flow-canvas.tsx`):
   - Remove line 163: `if (nodeId === "obsidian") return "active";`
   - Remove line 164: `if (nodeId === "knowledge-curator") return "idle";`
   - Add `obsidian: "Obsidian"` and `"knowledge-curator": "Curator"` to `svcMap`
4. **Verify** — hit `/api/health` directly, confirm `"Obsidian"` and `"Curator"` service entries appear; confirm Flow diagram shows correct node colors

**Why API first:** The canvas reads from `services` prop which comes from `useHealth()`. Without the API returning the new service entries, the canvas will have no data to work with — removing the hardcoded lines before the API is ready would make both nodes show `"idle"` (the fallback) rather than error state.

---

## Common Pitfalls

### Pitfall 1: Using `checkService()` for 3-state checks
**What goes wrong:** `checkService()` only returns `"up"` or `"down"` — it catches any error and returns down. Calling `throw new Error("degraded")` inside the check function will incorrectly map to `"down"` (error/red) not `"degraded"` (idle/amber).
**How to avoid:** Use a separate `checkServiceTristate()` helper that accepts a status-returning function. The existing `checkService()` is not modified.

### Pitfall 2: Checking log file mtime alone
**What goes wrong:** mtime is updated when the cron runs, but if the cron is killed mid-run (power outage, OOM), the file will have a fresh mtime but no completion sentinel. The node would show green when the pipeline actually failed.
**How to avoid:** Always check mtime AND the presence of "Knowledge Curator complete." in the most recent run block.

### Pitfall 3: Scanning entire log for "complete." instead of last run only
**What goes wrong:** If the previous run completed but the current run is still in progress (or failed), scanning all lines finds the old completion line and returns green incorrectly.
**How to avoid:** Find the last "Starting Knowledge Curator..." line index, slice from there, check only the most recent run block.

### Pitfall 4: Hardcoding today's date with `new Date()` without UTC normalization
**What goes wrong:** `new Date().toISOString()` returns UTC. If the machine is in a timezone where UTC is a different day than local time, the journal check will look for tomorrow's file at 11pm local time.
**How to avoid:** Use `new Date().toLocaleDateString('en-CA')` (produces YYYY-MM-DD in local time) or compute the date in local time explicitly.

### Pitfall 5: Journal file path as a security signal
**What goes wrong:** If the vault path or journal path is manipulated via `OBSIDIAN_VAULT_PATH` env var to an attacker-controlled path, arbitrary file existence can be probed.
**How to avoid:** The dashboard is local-only (no public auth surface). This is acceptable risk given deployment context. Still: validate the constructed path starts with `$HOME`.

### Pitfall 6: `import { stat }` already imported as `fsStat` — duplicate import
**What goes wrong:** `src/app/api/health/route.ts` already does `import { stat as fsStat } from "fs/promises"`. Adding `import { readFile, stat } from "fs/promises"` creates a conflict.
**How to avoid:** Add `readFile` to the existing import: `import { stat as fsStat, readFile } from "fs/promises"`.

---

## Code Examples

### Complete health route additions

```typescript
// src/app/api/health/route.ts

import { execFileSync } from "child_process";
import { stat as fsStat, readFile } from "fs/promises";  // ← add readFile
import { MEM0_URL, AGENT_CONFIGS_PATH, OBSIDIAN_VAULT_PATH, CURATOR_LOG_PATH } from "@/lib/constants";  // ← add new constants
import type { HealthStatus } from "@/types";

export const dynamic = "force-dynamic";

async function checkService(
  name: string,
  checkFn: () => Promise<void>
): Promise<HealthStatus> {
  const start = Date.now();
  try {
    await checkFn();
    return { service: name, status: "up", latencyMs: Date.now() - start, lastCheck: new Date().toISOString() };
  } catch {
    return { service: name, status: "down", latencyMs: null, lastCheck: new Date().toISOString() };
  }
}

// NEW helper for 3-state checks
async function checkServiceTristate(
  name: string,
  checkFn: () => Promise<"up" | "degraded" | "down">
): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const status = await checkFn();
    return { service: name, status, latencyMs: Date.now() - start, lastCheck: new Date().toISOString() };
  } catch {
    return { service: name, status: "down", latencyMs: null, lastCheck: new Date().toISOString() };
  }
}

async function obsidianStatus(): Promise<"up" | "degraded" | "down"> {
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
  const journalPath = `${OBSIDIAN_VAULT_PATH}/journals/${today}.md`;

  try { await fsStat(OBSIDIAN_VAULT_PATH); } catch { return "down"; }
  try { await fsStat(journalPath); return "up"; } catch { return "degraded"; }
}

async function curatorStatus(): Promise<"up" | "degraded" | "down"> {
  const WINDOW_MS = 26 * 60 * 60 * 1000;
  try {
    const s = await fsStat(CURATOR_LOG_PATH);
    if (Date.now() - s.mtimeMs > WINDOW_MS) return "down";
  } catch { return "down"; }

  let content: string;
  try { content = await readFile(CURATOR_LOG_PATH, "utf8"); } catch { return "down"; }

  const lines = content.split("\n");
  let lastRunStart = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes("Starting Knowledge Curator...")) { lastRunStart = i; break; }
  }
  if (lastRunStart === -1) return "down";

  const runLines = lines.slice(lastRunStart);
  const completed = runLines.some(l => l.includes("Knowledge Curator complete."));
  const hasWarnings = runLines.some(l => l.includes("Warning:"));

  if (!completed) return "down";
  if (hasWarnings) return "degraded";
  return "up";
}

export async function GET() {
  const services = await Promise.all([
    checkService("RTK", async () => { execFileSync("rtk", ["--version"], { timeout: 2000 }); }),
    checkService("mem0", async () => { await fetch(`${MEM0_URL}/health`, { signal: AbortSignal.timeout(2000) }); }),
    checkService("QMD", async () => { execFileSync("which", ["qmd"], { timeout: 2000 }); }),
    checkService("Agents", async () => { await fsStat(AGENT_CONFIGS_PATH); }),
    checkService("APO", async () => { const { stat } = await import("fs/promises"); await stat(`${process.env.HOME}/.openclaw/skills/proposals`); }),
    checkServiceTristate("Obsidian", obsidianStatus),   // ← NEW
    checkServiceTristate("Curator", curatorStatus),     // ← NEW
  ]);

  return Response.json({ services, timestamp: new Date().toISOString() });
}
```

### svcMap update in react-flow-canvas.tsx

```typescript
// src/components/flow/react-flow-canvas.tsx — getStatus() function

function getStatus(nodeId: string, agentStatus?: string): "active" | "idle" | "dormant" | "error" {
  if (agentStatus) return agentStatus === "active" ? "active" : "dormant";
  // REMOVE: if (nodeId === "obsidian") return "active";
  // REMOVE: if (nodeId === "knowledge-curator") return "idle";
  const minsAgo = nodeActivity[nodeId];
  if (minsAgo !== undefined && minsAgo < 5) return "active";
  if (minsAgo !== undefined && minsAgo < 60) return "idle";
  const svcMap: Record<string, string> = {
    gateways: "Agents",
    manager: "Paperclip",
    notebooks: "mem0",
    librarian: "QMD",
    qdrant: "Qdrant",
    obsidian: "Obsidian",           // ← NEW
    "knowledge-curator": "Curator", // ← NEW
  };
  const svc = services.find(s => s.service === svcMap[nodeId]);
  if (svc?.status === "up") return "active";
  if (svc?.status === "down") return "error";
  return "idle"; // "degraded" falls here → amber, which is correct for idle/warning
}
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.ts` (or package.json) |
| Quick run command | `npm test` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FLOW-08 | Obsidian: today's journal → active, no journal → idle, no vault → error | unit | `npm test -- obsidian` | No — Wave 0 |
| FLOW-09 | Curator: fresh+complete → active, warnings → idle, stale/missing → error | unit | `npm test -- curator` | No — Wave 0 |

### Wave 0 Gaps
- [ ] `src/app/api/health/__tests__/obsidian-status.test.ts` — unit tests for obsidianStatus() using mocked fs/promises
- [ ] `src/app/api/health/__tests__/curator-status.test.ts` — unit tests for curatorStatus() using mocked readFile + fsStat

### Sampling Rate
- **Per task commit:** `npm test -- --run`
- **Phase gate:** `npm run build` zero TS errors + tests green before marking phase done

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `fs/promises` (Node built-in) | Both health checks | ✓ | Node built-in | — |
| `/tmp/knowledge-curator.log` | Curator status | ✗ (never run) | — | Returns `"down"` gracefully |
| `~/github/knowledge/journals/` | Obsidian status | ✓ | 3 journal files confirmed | — |
| `OBSIDIAN_VAULT_PATH` env var | Health route | Optional | Default `$HOME/github/knowledge` | Default used |
| `CURATOR_LOG_PATH` env var | Health route | Optional | Default `/tmp/knowledge-curator.log` | Default used |

**Missing dependencies with no fallback:** None — the log being absent is a valid "error" state, not a blocker.

**Note:** The curator log being absent means the node will show red (error) until the first successful cron run. This is correct behavior — the cron hasn't run yet in this environment.

---

## Open Questions

1. **`"degraded"` status for curator in svcMap fallthrough:** The current `getStatus()` falls through `"degraded"` to `return "idle"` (amber). This is intentional — amber = idle = "ran but had warnings." No change needed.

2. **Multi-run log accumulation:** The log appends indefinitely. After months, this is still fast to parse (3,000–5,000 lines), but if Luis notices slow health checks, a line-limit on the tail read (last 50 lines) would prevent any future degradation. Not needed for v1.2.

3. **Curator log path on production server:** The cron writes to `/tmp/knowledge-curator.log`. The Next.js app reads the same file. Both run on the same machine (MacBook, not a container). No path mismatch risk.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Log format uses `"Warning:"` (capital W, colon) as the warning sentinel | Curator Log Parsing | Would miss warning detection — check regex against real log output on first cron run |
| A2 | `toLocaleDateString("en-CA")` reliably produces YYYY-MM-DD in local time on macOS | Obsidian check | Wrong date format → file not found → perpetual "idle" — can test with `new Date().toLocaleDateString("en-CA")` in Node |

---

## Sources

### Primary (HIGH confidence)
- `src/app/api/health/route.ts` — direct read, all patterns VERIFIED
- `src/components/flow/react-flow-canvas.tsx` — direct read, lines 161–173 VERIFIED
- `src/lib/constants.ts` — direct read, existing pattern VERIFIED
- `src/lib/api-client.ts` — direct read, useHealth() polling VERIFIED
- `src/types/index.ts` — direct read, HealthStatus type VERIFIED
- `~/github/knowledge/knowledge-curator.sh` — direct read, log format VERIFIED
- `~/github/knowledge/journals/` — filesystem probe, vault structure VERIFIED
- `.planning/research/SUMMARY.md` — milestone research CITED
- `.planning/v1.2-KICKOFF.md` — build order and constraints CITED

### Secondary (MEDIUM confidence)
- None required — all claims verified from primary sources

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Hardcoded line locations: HIGH — direct file read, lines 163–164
- checkService pattern: HIGH — direct file read
- svcMap pattern: HIGH — direct file read, lines 168–172
- Log format: HIGH — direct script read (knowledge-curator.sh)
- Log absence: HIGH — filesystem probe confirmed log does not exist
- Vault structure: HIGH — filesystem probe confirmed journals/ directory

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable Next.js patterns; log format will only change if knowledge-curator.sh is edited)
