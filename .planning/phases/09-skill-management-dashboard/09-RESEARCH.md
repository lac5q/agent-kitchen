# Phase 9: Skill Management Dashboard — Research

**Researched:** 2026-04-12
**Domain:** Skill sync observability — Python JSONL bridge + Next.js API + React Flow canvas
**Confidence:** HIGH — all findings from direct filesystem and codebase inspection

---

## Summary

Phase 9 surfaces the existing skill sync infrastructure (Hermes's `skill-sync.py`) into the agent-kitchen dashboard. The core pattern is a JSONL bridge: `skill-sync.py` appends contribution events to a log file, a new `/api/skills` route reads that log plus the master skills directory, and the frontend displays live stats on the Cookbooks node with dashed cyan edges showing skill flow.

The key discovery: **SKILL-01 is partially implemented.** The `~/github/knowledge/scripts/skill-sync.py` (the version in git) already contains the `append_jsonl_event()` function and `--export-jsonl` flag handling (lines 40-52, 328-349). However, the cron system runs `~/.openclaw/scripts/skill-sync.py` — a different, older copy that lacks this code. SKILL-01 therefore requires two actions: (1) copy the updated script to `~/.openclaw/scripts/skill-sync.py`, and (2) update the cron JSON to pass `--export-jsonl`.

The second discovery: **the hardcoded `skillCount={405}` in flow/page.tsx is wrong.** The master skills directory has 264 entries (not 405). The live count from `/api/skills` will correct this automatically.

**Primary recommendation:** Build in strict order — JSONL bridge activation → API route → frontend (constants → api-client → page → canvas → activity). Do not start frontend work until the API route returns real data.

---

## Project Constraints (from CLAUDE.md / PROJECT.md)

| Constraint | Rule |
|-----------|------|
| Security | No `execSync`/`exec` — use pure `fs/promises` in Next.js API routes |
| Build | Production = `npm start --port 3002`. Always `npm run build` first. |
| Vector store | ALL semantic search via Qdrant Cloud. `qmd embed` is FORBIDDEN. |
| Skills | Hermes's `skill-sync.py` is the sync engine — do not create parallel scripts |
| No rewrite | Add ~10 lines to skill-sync.py, do not restructure it |
| Gwen staging | Skills go to `~/github/knowledge/skills/.hermes-staging/` (already exists) |
| JSONL format | `{"skill":"name","action":"contributed|pruned|archived","contributor":"hermes|gwen","timestamp":"ISO","metadata":{}}` |

---

## SKILL-01: JSONL Bridge — Exact Work Required

### Critical Finding: Two Divergent Script Copies

The cron system (`~/.hermes/cron/skill-sync.json`, `skill-prune-weekly.json`) executes:
```
~/.openclaw/scripts/skill-sync.py --both
~/.openclaw/scripts/skill-sync.py --prune
```

The git-tracked version at `~/github/knowledge/scripts/skill-sync.py` already has the `--export-jsonl` code added. The cron copy at `~/.openclaw/scripts/skill-sync.py` does NOT have this code yet (confirmed via `diff`).

### SKILL-01 Tasks (2 actions, not a code write)

**Action 1: Sync the updated script to the cron path**
```bash
cp ~/github/knowledge/scripts/skill-sync.py ~/.openclaw/scripts/skill-sync.py
chmod +x ~/.openclaw/scripts/skill-sync.py
```

**Action 2: Update cron JSON to add `--export-jsonl` flag**

File: `~/.hermes/cron/skill-sync.json`
Change the bash command in `prompt` from:
```
python3 ~/.openclaw/scripts/skill-sync.py --both 2>&1 | tail -20
```
To:
```
python3 ~/.openclaw/scripts/skill-sync.py --both --export-jsonl 2>&1 | tail -20
```

File: `~/.hermes/cron/skill-prune-weekly.json`
Change from:
```
python3 ~/.openclaw/scripts/skill-sync.py --prune 2>&1
```
To:
```
python3 ~/.openclaw/scripts/skill-sync.py --prune --export-jsonl 2>&1
```

**No new Python code needed.** The `append_jsonl_event()` function and flag handling already exist in the git-tracked version.

### What the JSONL Event Code Does (already implemented)

```python
# Already in ~/github/knowledge/scripts/skill-sync.py lines 40-52
CONTRIBUTIONS_LOG = Path.home() / "github" / "knowledge" / "skill-contributions.jsonl"

def append_jsonl_event(skill: str, action: str, contributor: str, metadata: dict = None):
    event = {
        "skill": skill,
        "action": action,          # "contributed" | "synced" | "pruned"
        "contributor": contributor, # "hermes" | "master" | "system"
        "timestamp": datetime.now().isoformat(),
        "metadata": metadata or {},
    }
    with open(CONTRIBUTIONS_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")
```

### Current JSONL State

- File path: `~/github/knowledge/skill-contributions.jsonl` — EXISTS, 0 bytes (empty, never populated)
- `.hermes-staging/` directory: EXISTS at `~/github/knowledge/skills/.hermes-staging/`
- The file will populate on next cron run after the flag is added

### Contributor Attribution Gap

The state file (`~/.openclaw/skill-sync-state.json`) has 236 `synced_from` entries, all pointing to the master dir — zero Hermes, zero Gwen. The JSONL is also empty. When `/api/skills` launches, `contributedByHermes` and `contributedByGwen` will be 0 until skills actually move through the pipeline. This is correct and expected — API must return zeros gracefully, not error.

---

## SKILL-02: /api/skills Route Design

### File to Create

`src/app/api/skills/route.ts` — does NOT exist yet. [VERIFIED: filesystem check]

### Data Sources

| Source | Path | Purpose |
|--------|------|---------|
| Skills master dir | `~/github/knowledge/skills/` (264 dirs, excl. dot-prefix) | `totalSkills` count |
| Sync state file | `~/.openclaw/skill-sync-state.json` | `lastPruned`, contributor attribution from `synced_from` |
| JSONL log | `~/github/knowledge/skill-contributions.jsonl` | `recentContributions`, contributor counts |

### Route Implementation Pattern

Follow the pattern from `src/app/api/activity/route.ts` — `export const dynamic = "force-dynamic"`, all reads in try/catch with graceful fallbacks.

```typescript
// src/app/api/skills/route.ts
import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { SKILLS_PATH, SKILL_CONTRIBUTIONS_LOG } from "@/lib/constants";

export const dynamic = "force-dynamic";

const SKILL_SYNC_STATE = path.join(
  process.env.HOME || "",
  ".openclaw/skill-sync-state.json"
);

export async function GET() {
  // 1. Count skills in master dir (exclude dot-prefixed dirs)
  let totalSkills = 0;
  try {
    const entries = await readdir(SKILLS_PATH, { withFileTypes: true });
    totalSkills = entries.filter(e => e.isDirectory() && !e.name.startsWith(".")).length;
  } catch { /* fallback: 0 */ }

  // 2. Read sync state for lastPruned
  let lastPruned: string | null = null;
  let lastUpdated: string | null = null;
  try {
    const raw = await readFile(SKILL_SYNC_STATE, "utf-8");
    const state = JSON.parse(raw);
    lastPruned = state.last_prune ?? null;
    lastUpdated = state.last_sync ?? null;
  } catch { /* file may not exist */ }

  // 3. Parse JSONL for recent contributions
  let recentContributions: Array<{skill: string; contributor: string; timestamp: string; action: string}> = [];
  let contributedByHermes = 0;
  let contributedByGwen = 0;
  let staleCandidates = 0;
  try {
    const raw = await readFile(SKILL_CONTRIBUTIONS_LOG, "utf-8");
    const lines = raw.split("\n").filter(l => l.trim());
    const events = lines.map(l => JSON.parse(l));
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    recentContributions = events
      .filter(e => new Date(e.timestamp).getTime() > twoHoursAgo)
      .slice(-20);
    // All-time contributor counts
    contributedByHermes = events.filter(e => e.contributor === "hermes" && e.action === "contributed").length;
    contributedByGwen = events.filter(e => e.contributor === "gwen" && e.action === "contributed").length;
    staleCandidates = events.filter(e => e.action === "pruned").length;
  } catch { /* JSONL empty or missing — all zeros is correct */ }

  return NextResponse.json({
    totalSkills,
    contributedByHermes,
    contributedByGwen,
    recentContributions,
    lastPruned,
    staleCandidates,
    lastUpdated,
    timestamp: new Date().toISOString(),
  });
}
```

### Constants to Add (src/lib/constants.ts)

```typescript
// Add to existing constants.ts
export const SKILLS_PATH = process.env.SKILLS_PATH ||
  `${process.env.HOME}/github/knowledge/skills`;
export const SKILL_CONTRIBUTIONS_LOG = process.env.SKILL_CONTRIBUTIONS_LOG ||
  `${process.env.HOME}/github/knowledge/skill-contributions.jsonl`;

// In POLL_INTERVALS object, add:
skills: 60000,  // skills data is slow-moving; 60s is sufficient
```

---

## SKILL-03: Cookbooks Node Stats Panel

### How nodeStats() Works (existing pattern)

The `nodeStats()` callback in `react-flow-canvas.tsx` (line 181) is a `useCallback` that returns `Record<string, string | number>` by node ID. The NodeDetailPanel renders these key-value pairs. Currently for `cookbooks`:

```typescript
case "cookbooks": return { "Skills": skillCount };
```

### Updated Cookbooks nodeStats (5 fields)

```typescript
case "cookbooks": return {
  "Skills":      skillsStats?.totalSkills ?? skillCount,
  "From Hermes": skillsStats?.contributedByHermes ?? 0,
  "From Gwen":   skillsStats?.contributedByGwen ?? 0,
  "Last Pruned": skillsStats?.lastPruned
    ? new Date(skillsStats.lastPruned).toLocaleDateString()
    : "Never",
  "Stale":       skillsStats?.staleCandidates ?? 0,
};
```

### Props Change Required

Add to `ReactFlowCanvasProps` interface:
```typescript
skillsStats?: {
  totalSkills: number;
  contributedByHermes: number;
  contributedByGwen: number;
  recentContributions: Array<{skill: string; contributor: string; timestamp: string; action: string}>;
  lastPruned: string | null;
  staleCandidates: number;
  lastUpdated: string | null;
  timestamp: string;
} | null;
```

Update `nodeStats` dependency array:
```typescript
}, [agentCount, activeCount, memoryCount, knowledgeCount, skillCount, skillsStats, devToolsMap]);
//                                                                      ^^^^^^^^^^^^ add this
```

### Cookbooks Node Subtitle Update

The current subtitle is `"skillshare · 405+"`. Update to live data:

```typescript
{ id: "cookbooks",
  position: { x: 20, y: 580 },
  data: {
    label: "Skills",
    subtitle: skillsStats
      ? `${skillsStats.totalSkills} skills · ${skillsStats.contributedByHermes + skillsStats.contributedByGwen} contributed`
      : "skillshare · loading...",
    icon: "📚",
    // ... rest unchanged
  }
}
```

---

## SKILL-04: Dashed Cyan Edges

### Edge Color Addition

```typescript
// In EDGE_COLORS constant (line 119)
const EDGE_COLORS = {
  request: "#f59e0b",
  knowledge: "#10b981",
  memory: "#0ea5e9",
  apo: "#8b5cf6",
  sync: "#06b6d4",   // ADD: cyan for skill sync flow
};
```

### New Edges to Add (guarded by alba presence)

Add to the `edges` useMemo, after `extraEdges`:

```typescript
// Skill sync flow edges — only when alba is in the graph
const albaInGraph = keyRemote.some(a => a.id === "alba");
const skillSyncEdges: Edge[] = albaInGraph ? [
  {
    id: "alba-cookbooks-skill",
    source: "agent-alba",
    target: "cookbooks",
    animated: false,          // dashed, not animated
    style: {
      stroke: EDGE_COLORS.sync,
      strokeWidth: 1.5,
      strokeDasharray: "5,5", // dashed pattern
    },
  },
  {
    id: "cookbooks-gateways-skill",
    source: "cookbooks",
    target: "gateways",
    animated: false,
    style: {
      stroke: EDGE_COLORS.sync,
      strokeWidth: 1.5,
      strokeDasharray: "5,5",
    },
  },
] : [];

return [...base, ...agentEdges, ...extraEdges, ...skillSyncEdges];
```

### Legend Entry in flow/page.tsx

```tsx
// Add to the legend div at the bottom of FlowPage
<div className="flex items-center gap-1.5">
  <div className="h-2 w-6 border-t-2 border-dashed border-cyan-400" />
  Skill Sync
</div>
```

---

## SKILL-05: Activity Feed Integration

### Pattern (from existing /api/activity/route.ts)

Activity events are typed as:
```typescript
interface ActivityEvent {
  id: string;
  timestamp: string;
  node: string;     // "cookbooks" routes to Cookbooks node
  type: "request" | "knowledge" | "memory" | "error" | "apo";
  message: string;
  severity: "info" | "warn" | "error";
}
```

### Addition to /api/activity/route.ts

Add a new section (after section 3, before the sort):

```typescript
// 4. Read recent skill contribution events from JSONL (last 2 hours)
const SKILL_LOG = process.env.SKILL_CONTRIBUTIONS_LOG ||
  `${process.env.HOME}/github/knowledge/skill-contributions.jsonl`;
try {
  const raw = await readFile(SKILL_LOG, "utf-8");
  const lines = raw.split("\n").filter(l => l.trim());
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (new Date(event.timestamp).getTime() < twoHoursAgo) continue;
      const actionLabel = event.action === "contributed"
        ? `contributed by ${event.contributor}`
        : event.action === "pruned"
        ? `pruned (unused 30+ days)`
        : event.action;
      events.push({
        id: `skill-${event.skill}-${event.timestamp}`,
        timestamp: event.timestamp,
        node: "cookbooks",
        type: "knowledge",
        message: `Skill "${event.skill}" ${actionLabel}`,
        severity: "info",
      });
    } catch { /* skip malformed line */ }
  }
} catch { /* JSONL missing or empty — skip */ }
```

This follows the existing try/catch pattern exactly. No new imports needed — `readFile` is already imported in the route.

---

## Architecture Patterns

### Existing Pattern Reference

All new code follows patterns already in production:

| Pattern | Where Used | Apply To |
|---------|-----------|---------|
| `export const dynamic = "force-dynamic"` | All API routes | `/api/skills` |
| `try/catch` with silent fallback | `/api/activity`, `/api/health` | All reads in `/api/skills` |
| `useQuery` with `POLL_INTERVALS` | `api-client.ts` | `useSkills()` hook |
| `Record<string, string \| number>` stats | `react-flow-canvas.tsx` nodeStats | cookbooks case |
| `readFile` / `readdir` from `fs/promises` | `/api/activity` | `/api/skills` |

### Recommended Build Order

```
1. SKILL-01: Copy updated skill-sync.py to ~/.openclaw/scripts/
             Update skill-sync.json and skill-prune-weekly.json cron prompts to add --export-jsonl
             Verify: run manually with --export-jsonl --dry-run (should print logs, not write)
             Then run live once: python3 ~/.openclaw/scripts/skill-sync.py --both --export-jsonl
             Verify: JSONL file has entries

2. SKILL-02: Add SKILLS_PATH + SKILL_CONTRIBUTIONS_LOG to src/lib/constants.ts
             Create src/app/api/skills/route.ts
             Verify: curl localhost:3002/api/skills returns JSON with totalSkills=264

3. SKILL-03: Add useSkills() to src/lib/api-client.ts
             Update src/app/flow/page.tsx: import useSkills, replace skillCount={405}, add skillsStats prop
             Update ReactFlowCanvasProps interface to accept skillsStats
             Update nodeStats("cookbooks") to return 5 fields
             Update cookbooks node subtitle
             Verify: click Cookbooks node → NodeDetailPanel shows 5 stats rows

4. SKILL-04: Add sync: "#06b6d4" to EDGE_COLORS
             Add guarded skillSyncEdges to edges useMemo
             Update legend in flow/page.tsx
             Verify: dashed cyan lines visible alba→cookbooks, cookbooks→gateways

5. SKILL-05: Add section 4 JSONL read to /api/activity/route.ts
             Verify: click Cookbooks node → activity panel shows skill events (after live run)

6. npm run build (zero TS errors) → npm start --port 3002
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Contributor attribution from history | Parallel tracking DB | Parse JSONL; zeros are acceptable until pipeline runs |
| Skill usage analytics | Custom event system | JSONL append is sufficient for v1.2 |
| Real-time JSONL updates | File watcher / SSE | 60s poll interval; skills data is slow-moving |
| Gwen detection | Separate Gwen API | `contributor === "gwen"` in JSONL events |

---

## Common Pitfalls

### Pitfall 1: Wrong Script Path
**What goes wrong:** Editing `~/github/knowledge/scripts/skill-sync.py` but cron runs `~/.openclaw/scripts/skill-sync.py` — changes never take effect.
**How to avoid:** Always copy to the cron path after editing the git-tracked version. Verify with `diff`.

### Pitfall 2: Hardcoded skillCount Not Replaced
**What goes wrong:** `skillCount={405}` stays in flow/page.tsx. The live count is 264 — the hardcoded value is 35% too high.
**How to avoid:** Replace with `skillCount={skillsData?.totalSkills ?? 0}` and pass `skillsStats={skillsData ?? null}`.

### Pitfall 3: JSONL Empty at Launch = Silent Zeros
**What goes wrong:** Treating empty JSONL as an error condition.
**How to avoid:** When JSONL is empty (0 bytes) or file not found, all counts should return 0 silently. No error state for empty JSONL — this is the expected initial state until the cron runs.

### Pitfall 4: nodeStats useMemo Dependency Missing
**What goes wrong:** `skillsStats` prop changes but nodeStats callback doesn't update because `skillsStats` isn't in the dependency array.
**How to avoid:** Add `skillsStats` to the `useCallback` dependency array in `nodeStats`.

### Pitfall 5: Dashed Edge Uses `animated: true`
**What goes wrong:** React Flow's `animated` prop adds a flowing animation that overrides the static dashed visual.
**How to avoid:** Set `animated: false` on skill sync edges; use `strokeDasharray: "5,5"` in `style` instead.

### Pitfall 6: readdir on skills/ includes non-dir entries
**What goes wrong:** `readdir()` without `withFileTypes` counts the `audit-report-2026-03-08.md` file as a skill.
**How to avoid:** Use `readdir(SKILLS_PATH, { withFileTypes: true })` and filter `e.isDirectory() && !e.name.startsWith(".")`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `vitest.config.ts` |
| Quick run | `npx vitest run --reporter=verbose` |
| Full suite | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SKILL-01 | JSONL appended after sync/prune | Manual smoke | `python3 ~/.openclaw/scripts/skill-sync.py --both --export-jsonl && wc -l ~/github/knowledge/skill-contributions.jsonl` | N/A |
| SKILL-02 | /api/skills returns live stats | Integration | `curl http://localhost:3002/api/skills \| python3 -m json.tool` | ❌ Wave 0 |
| SKILL-03 | Cookbooks node shows 5 stat rows | Manual visual | Click Cookbooks node in Flow | N/A |
| SKILL-04 | Dashed cyan edges visible | Manual visual | Inspect Flow diagram | N/A |
| SKILL-05 | Skill events in activity when cookbooks selected | Manual smoke | Select cookbooks, check panel | N/A |

### Wave 0 Gaps
- [ ] `src/app/api/skills/__tests__/route.test.ts` — covers SKILL-02 (mock fs/promises, verify response shape)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3 | SKILL-01 script run | ✓ | System Python 3 | — |
| `~/.openclaw/skill-sync-state.json` | SKILL-02 lastPruned | ✓ | 242-line file | Graceful null |
| `~/github/knowledge/skill-contributions.jsonl` | SKILL-01, 02, 05 | ✓ (0 bytes) | Empty | Graceful zeros |
| `~/github/knowledge/skills/` | SKILL-02 totalSkills | ✓ | 264 dirs | — |
| `~/github/knowledge/skills/.hermes-staging/` | Gwen drops | ✓ | Exists | — |
| `~/.hermes/cron/skill-sync.json` | SKILL-01 cron | ✓ | JSON file | — |

---

## State of the Art

| Old State | New State | What Changes |
|-----------|-----------|--------------|
| `skillCount={405}` hardcoded (wrong) | `skillsStats?.totalSkills` from live API | Corrects 35% overcount |
| JSONL bridge code in git, not in cron | Cron passes `--export-jsonl` | Events start flowing |
| Cookbooks: single "Skills: 405" stat | 5-row panel (Total, Hermes, Gwen, Pruned, Stale) | Full skill visibility |
| No skill sync edges | Dashed cyan alba→cookbooks, cookbooks→gateways | Flow shows contribution path |
| Activity feed ignores skills | Skill events appear under cookbooks | Drill-down works |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `contributedByHermes` derived from JSONL `contributor === "hermes"` events | SKILL-02 | Low — zeros until pipeline runs; no data loss |
| A2 | Dashed edges use `strokeDasharray` in React Flow style object | SKILL-04 | Low — standard SVG; test in UI during build |
| A3 | Activity feed filtered to `node === "cookbooks"` in NodeDetailPanel | SKILL-05 | Medium — verify how NodeDetailPanel filters `events` prop |

---

## Open Questions

1. **NodeDetailPanel event filtering**
   - What we know: `NodeDetailPanel` receives all `events` and a `nodeId` prop
   - What's unclear: Does it filter internally by `event.node === nodeId`, or does the parent filter?
   - Recommendation: Check `src/components/flow/node-detail-panel.tsx` before implementing SKILL-05

2. **Gwen contributions via staging**
   - What we know: `.hermes-staging/` exists; skill-sync.py handles Hermes→master; no Gwen pickup code yet
   - What's unclear: Does skill-sync.py currently pick up from `.hermes-staging/` or is that also planned?
   - Recommendation: Check if the Gwen staging pickup is in Phase 11 (AGENT-02) or needs to be wired now for `contributedByGwen` to ever be non-zero

---

## Sources

### Primary (HIGH confidence — direct filesystem inspection)
- `~/github/knowledge/scripts/skill-sync.py` — full 353-line script read; diff confirms JSONL code present but not in cron copy
- `~/.openclaw/scripts/skill-sync.py` — cron copy confirmed divergent (lacks `--export-jsonl`)
- `~/.hermes/cron/skill-sync.json` — cron runs `--both` without `--export-jsonl`
- `~/.hermes/cron/skill-prune-weekly.json` — confirmed same gap
- `~/github/knowledge/skill-contributions.jsonl` — exists, 0 bytes
- `~/github/knowledge/skills/` — 264 directories (not 405)
- `~/github/knowledge/skills/.hermes-staging/` — exists
- `src/components/flow/react-flow-canvas.tsx` — full read; edge pattern, nodeStats, EDGE_COLORS verified
- `src/app/flow/page.tsx` — `skillCount={405}` hardcoded at line 58 confirmed
- `src/app/api/activity/route.ts` — event shape and pattern confirmed
- `src/lib/api-client.ts` — `useKnowledge()` hook pattern confirmed
- `src/lib/constants.ts` — existing constants and POLL_INTERVALS confirmed

### Secondary (MEDIUM confidence)
- `~/.openclaw/skill-sync-state.json` — state structure confirmed; 236 synced_from entries all from master

---

## Metadata

**Confidence breakdown:**
- SKILL-01 work required: HIGH — two files confirmed, diff verified
- SKILL-02 API design: HIGH — follows exact existing pattern
- SKILL-03 canvas changes: HIGH — nodeStats structure and dep array fully understood
- SKILL-04 edge format: MEDIUM — `strokeDasharray` is standard SVG but not yet tested in React Flow version in use
- SKILL-05 activity integration: HIGH — activity route pattern fully understood; NodeDetailPanel filter TBD

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable codebase; skill counts change daily but patterns are stable)
