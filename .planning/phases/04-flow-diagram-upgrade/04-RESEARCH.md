# Phase 4: Flow Diagram Upgrade - Research

**Researched:** 2026-04-10
**Domain:** React Flow canvas, Next.js API routes, filesystem reads, CSS label rendering
**Confidence:** HIGH

## Summary

Phase 4 is a focused polish-and-extension pass on the existing Flow page. All decisions are already locked in CONTEXT.md — the research here validates those decisions against the actual codebase and confirms that every implementation detail is straightforward.

The four work streams are: (1) remove `truncate` CSS from FlowNode labels, (2) add a `/api/heartbeat` route that reads the last 20 lines of `HEARTBEAT_STATE.md` and render in the panel, (3) add regex noise-stripping in `/api/activity/route.ts`, and (4) add two new static nodes (`knowledge-curator`, `obsidian`) with 9 new edges and a 4th row layout retuning. No new dependencies are required. All patterns are established in the codebase.

**Primary recommendation:** Implement in four isolated tasks aligned to the four work streams. Each task touches a single file or file pair and can be verified independently by loading the Flow page.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Label Display (FLOW-01)**
- D-01: Remove `truncate` CSS from label and subtitle `<p>` elements in `FlowNode`. Allow text to wrap. Reduce font sizes slightly if needed (label: 9px, subtitle: 7px) to keep nodes compact.
- D-02: Node container width stays at 90px — don't widen nodes to fix labels.

**Node Detail Panel (FLOW-02)**
- D-03: Read `HEARTBEAT_STATE.md` (not `HEARTBEAT.md`) from the agent's config directory. Show the last 20 lines of that file as the primary panel content, below the existing stats grid.
- D-04: API route needed: `GET /api/heartbeat?agent={agentId}` — reads `~/github/knowledge/agent-configs/{agentId}/HEARTBEAT_STATE.md`, returns last 20 lines as plain text.
- D-05: If `HEARTBEAT_STATE.md` doesn't exist for a node (e.g. system nodes like mem0, QMD), fall back to existing stats-only view. No error shown — graceful degradation.
- D-06: Panel label changes from "Node Activity" to "Last State" when heartbeat content is available.

**Activity Feed (FLOW-03)**
- D-07: Pattern-based cleanup in `/api/activity/route.ts`. Strip: `===`, `---`, leading/trailing `[timestamp]` prefixes, raw ISO-8601 timestamps mid-string, and common noise words like "Starting", "Complete", "cycle" when alone. Keep the semantic content.
- D-08: No LLM involvement. Pure regex/string transforms. Example: `=== APO Cycle Starting 2026-04-09T14:33:22 ===` → `APO Cycle Starting`.

**New Nodes: Knowledge Curator + Obsidian (FLOW-05, FLOW-06, FLOW-07)**
- D-09: Add `knowledge-curator` node (🧹, label: "Knowledge Curator", subtitle: "nightly · curator") in the knowledge infrastructure row.
- D-10: Add `obsidian` node (📓, label: "Obsidian", subtitle: "knowledge vault") as the rightmost anchor in the knowledge row — the ground truth hub.
- D-11: Knowledge Curator edges (FLOW-05): curator → gitnexus (knowledge), curator → llmwiki (knowledge), curator → notebooks/mem0 (memory), curator → librarian/QMD (knowledge).
- D-12: Obsidian hub edges (FLOW-07): librarian → obsidian (knowledge), llmwiki → obsidian (knowledge), curator → obsidian (knowledge).
- D-13: New data-flow edges (FLOW-06): notebooks → librarian (mem0→QMD bridge, memory color), llmwiki → librarian (knowledge color). These replace or supplement existing edges.
- D-14: Knowledge Curator node shows last-run time in subtitle when available. Source: read the Knowledge Curator cron log (`/tmp/knowledge-curator.log` — confirmed path from crontab). If unavailable, show "nightly · curator" static subtitle. No separate cron data API needed unless the log exists.

**Layout / No Overlap (FLOW-04)**
- D-15: Keep hardcoded coordinates — no elkjs dependency.
- D-16: Proposed row structure:
  - Row 1 (y≈100): request, gateways, manager, output
  - Row 2 (y≈280): dynamic agent nodes (remote + local)
  - Row 3 (y≈440): tunnels, taskboard, notebooks/mem0, librarian/QMD, qdrant
  - Row 4 (y≈580): cookbooks, apo, gitnexus, llmwiki, knowledge-curator, obsidian
- D-17: Canvas height increases from 620px to 720px to accommodate 4 rows without crowding.

### Claude's Discretion
- Exact pixel coordinates within each row — planner/executor tunes for non-overlap
- Edge label text (if any) — keep minimal or none
- Animation speed on new edges — match existing animated edges

### Deferred Ideas (OUT OF SCOPE)
- `FLOW-08`: Flow node positions persist in localStorage — v2 requirement, not this phase
- `FLOW-09`: Multiple layout modes (hierarchical, force-directed) — v2 requirement, not this phase
- elkjs / auto-layout — deferred, not needed for this phase's scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FLOW-01 | React Flow nodes display label text cleanly — no truncation or missing labels | D-01 confirmed: remove `truncate` class from two `<p>` elements in `FlowNode`. Label is `className="truncate"` at line 50, subtitle at line 53 in react-flow-canvas.tsx. |
| FLOW-02 | Node detail panel shows real content from agent heartbeat files | D-03/D-04 confirmed: HEARTBEAT_STATE.md does NOT currently exist in any agent-config dir (find returned empty). File will be created by agents; API must handle graceful 404. Pattern: readFile + tail last 20 lines. |
| FLOW-03 | Activity feed shows human-readable descriptions with log noise stripped | D-07/D-08 confirmed: APO cron log uses `===` banners, `---`, and `[YYYY-MM-DD HH:MM:SS]` bracket timestamps. Regexes identified below. |
| FLOW-04 | Flow page desktop layout has no node overlap — all 13+ nodes visible | Current canvas: 13 static nodes + 6 dynamic agent nodes. Row 4 needs 6 new slots. Layout retuning with 4-row structure and 720px height confirmed viable. |
| FLOW-05 | Flow diagram includes Knowledge Curator node connected to GitNexus, LLM Wiki, mem0, and QMD | Cron confirmed: `0 2 * * * knowledge-curator.sh >> /tmp/knowledge-curator.log`. Log exists at `/tmp/knowledge-curator.log` with `[YYYY-MM-DD HH:MM:SS]` timestamp format. Last-run parsing is straightforward. |
| FLOW-06 | Flow diagram edges reflect new data flows — mem0→QMD bridge, llm-wiki→QMD indexing | New edges `mem-qmd` (memory color) and `wiki-qmd` (knowledge color) defined in UI-SPEC. No conflicting existing edges. |
| FLOW-07 | Flow diagram includes Obsidian/Knowledge Base node as ground truth hub | New `obsidian` node + 3 incoming edges (`lib-obs`, `wiki-obs`, `curator-obs`) in knowledge color. All source nodes already exist. |
</phase_requirements>

---

## Standard Stack

### Core (verified in package.json)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @xyflow/react | ^12.10.2 | React Flow canvas, nodes, edges | Already used — extend in place |
| framer-motion | ^12.38.0 | Panel animation (spring) | Already used — retain existing pattern |
| next | 16.2.2 | App Router API routes | Project framework — API routes in `src/app/api/` |
| react | (next peer) | Component rendering | Project framework |

[VERIFIED: package.json]

### No New Dependencies

This phase requires zero new npm installs. All functionality uses:
- Built-in Node.js `fs/promises` (already imported in `/api/activity/route.ts`)
- Existing `@xyflow/react` node/edge APIs
- Existing `framer-motion` for animation
- `path` module (already imported in activity route)

[VERIFIED: src/app/api/activity/route.ts lines 1-4]

### Installation

```bash
# No new packages required
```

---

## Architecture Patterns

### Established Patterns (verified in codebase)

**1. Static node list in `react-flow-canvas.tsx`**

All nodes are defined in `const staticNodes: Node[]` inside `useMemo`. New nodes (`knowledge-curator`, `obsidian`) append to this array. Pattern:

```typescript
// Source: src/components/flow/react-flow-canvas.tsx line 139
{ id: "knowledge-curator", position: { x: TBD, y: 580 }, data: { label: "Knowledge Curator", subtitle: "nightly · curator", icon: "🧹", status: getStatus("knowledge-curator"), highlighted: highlightedNode === "knowledge-curator" }, type: "flowNode" },
{ id: "obsidian", position: { x: TBD, y: 580 }, data: { label: "Obsidian", subtitle: "knowledge vault", icon: "📓", status: "active", highlighted: highlightedNode === "obsidian" }, type: "flowNode" },
```

[VERIFIED: react-flow-canvas.tsx]

**2. Edge definition pattern**

All edges in `const base: Edge[]` inside `useMemo`. New edges append to this array:

```typescript
// Source: src/components/flow/react-flow-canvas.tsx line 188
{ id: "curator-gnx",  source: "knowledge-curator", target: "gitnexus",  animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
{ id: "curator-wiki", source: "knowledge-curator", target: "llmwiki",   animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
{ id: "curator-mem",  source: "knowledge-curator", target: "notebooks", animated: true, style: { stroke: EDGE_COLORS.memory,    strokeWidth: 1.5 } },
{ id: "curator-qmd",  source: "knowledge-curator", target: "librarian", animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
{ id: "lib-obs",      source: "librarian",         target: "obsidian",  animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
{ id: "wiki-obs",     source: "llmwiki",           target: "obsidian",  animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
{ id: "curator-obs",  source: "knowledge-curator", target: "obsidian",  animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } },
{ id: "mem-qmd",      source: "notebooks",         target: "librarian", animated: true, style: { stroke: EDGE_COLORS.memory,    strokeWidth: 1   } },
{ id: "wiki-qmd",     source: "llmwiki",           target: "librarian", animated: true, style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1   } },
```

[VERIFIED: react-flow-canvas.tsx + CONTEXT.md D-11/D-12/D-13]

**3. Next.js App Router API route**

Pattern from existing routes (`/api/agents`, `/api/activity`):

```typescript
// Source: src/app/api/agents/route.ts
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agent");
  // ...
  return NextResponse.json({ content: lines });
}
```

[VERIFIED: src/app/api/agents/route.ts, src/app/api/activity/route.ts]

**4. AGENT_CONFIGS_PATH constant**

The constant is defined in `src/lib/constants.ts` and used in the agents route. The heartbeat route MUST use this same constant (not hardcode the path):

```typescript
import { AGENT_CONFIGS_PATH } from "@/lib/constants";
// AGENT_CONFIGS_PATH = process.env.AGENT_CONFIGS_PATH || `${process.env.HOME}/github/knowledge/agent-configs`
```

[VERIFIED: src/lib/constants.ts line 37]

**5. `execFileSync` security constraint**

CLAUDE.md / PROJECT.md requires `execFileSync` not `exec` for shell commands. The heartbeat route only does `readFile` — no shell execution needed for this route.

[VERIFIED: src/components/flow/react-flow-canvas.tsx, CONTEXT.md code_context section]

### Recommended Project Structure

No new directories needed. New files:

```
src/app/api/
└── heartbeat/
    └── route.ts          # New: GET /api/heartbeat?agent={agentId}
```

Modified files:

```
src/components/flow/
├── react-flow-canvas.tsx  # FlowNode truncate fix + new nodes + edges + layout
└── node-detail-panel.tsx  # Add heartbeat section below stats grid
src/app/api/
└── activity/
    └── route.ts           # Add noise-stripping transforms
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Log noise stripping | Custom parser class | Inline regex transforms in route.ts | APO log format is simple and stable — 3-4 regexes cover all patterns |
| Last-run time parsing | Date library | `new Date(match[1]).getTime()` | Single timestamp format `[YYYY-MM-DD HH:MM:SS]` — native Date handles it |
| Node layout algorithm | elkjs / dagre | Hardcoded x/y coordinates | Decision D-15: locked. Fits 13+2 nodes in 4 rows without dependency overhead |
| Heartbeat file watch | fs.watch / chokidar | On-demand `readFile` per panel click | Panel opens infrequently; stat overhead is negligible |

---

## Common Pitfalls

### Pitfall 1: `truncate` removal causes node height growth
**What goes wrong:** Removing `truncate` on both label and subtitle `<p>` causes long labels (e.g., "Knowledge Curator") to wrap to 2 lines, pushing adjacent nodes in the same row visually taller and creating perceived misalignment.
**Why it happens:** `FlowNode` uses `flex flex-col items-center` — height is intrinsic, not fixed.
**How to avoid:** After removing truncate, check multi-word labels ("Knowledge Curator", "User / Telegram", "Gateways") at 90px width. At 8px font-size, "Knowledge Curator" is ~98px wide — it WILL wrap. This is acceptable per D-01; the icon box anchors alignment, not the text height.
**Warning signs:** At zoom-out, some nodes appear taller than others in the same row. This is cosmetic and acceptable per the decision to allow wrapping.

[VERIFIED: react-flow-canvas.tsx FlowNode component]

### Pitfall 2: HEARTBEAT_STATE.md does not exist yet (all agents)
**What goes wrong:** The `/api/heartbeat` route returns 404 / empty content for every agent on first deploy, making the new panel section appear to be broken rather than gracefully absent.
**Why it happens:** `find` across all 22 agent-config directories confirmed zero `HEARTBEAT_STATE.md` files currently exist. The file is a future artifact written by agents.
**How to avoid:** The route MUST catch `ENOENT` and return `{ content: null }` (or HTTP 404 with empty body). `NodeDetailPanel` MUST not render the "Last State" section when content is null/empty. Graceful degradation per D-05 is not optional — it IS the current state for every node.
**Warning signs:** Panel shows "Loading state..." permanently for any node.

[VERIFIED: find /Users/yourname/github/knowledge/agent-configs -name "HEARTBEAT_STATE.md" returned empty]

### Pitfall 3: Knowledge-curator log path is `/tmp/knowledge-curator.log`, not `~/.local/logs/`
**What goes wrong:** CONTEXT.md D-14 mentions `~/.local/logs/knowledge-curator.log` OR the path from env. The actual cron redirects to `/tmp/knowledge-curator.log`.
**Why it happens:** The crontab entry is: `0 2 * * * .../knowledge-curator.sh >> /tmp/knowledge-curator.log 2>&1`
**How to avoid:** In `getStatus("knowledge-curator")` and the subtitle logic, read from `process.env.KNOWLEDGE_CURATOR_LOG_PATH || /tmp/knowledge-curator.log`. Fall back to static subtitle if file missing (works on fresh systems where cron hasn't run yet).
**Warning signs:** `knowledge-curator` node always shows static "nightly · curator" subtitle even after curator has run.

[VERIFIED: crontab -l confirmed `/tmp/knowledge-curator.log`]

### Pitfall 4: New edges cause React Flow edge ID collisions
**What goes wrong:** If an edge ID already exists in the `edges` array, React Flow silently drops one of the duplicate-ID edges.
**Why it happens:** The existing `agentEdges` flatMap produces IDs like `{id}-qmd` for each agent. If `id = "knowledge-curator"`, this would conflict with new static edge `curator-qmd`.
**How to avoid:** New static edge IDs (`curator-gnx`, `curator-wiki`, `curator-mem`, `curator-qmd`, `lib-obs`, `wiki-obs`, `curator-obs`, `mem-qmd`, `wiki-qmd`) are unique and do not match the agent dynamic pattern (`mgr-${id}`, `${id}-mem`, `${id}-qmd`, `${id}-sk`). No collision because `knowledge-curator` is not in `KEY_AGENTS` and is not a dynamic agent node. Verify by checking that `knowledge-curator` is not in the `allAgentIds` list.
**Warning signs:** An expected edge doesn't render on canvas.

[VERIFIED: react-flow-canvas.tsx KEY_AGENTS array = ["alba", "gwen", "sophia", "maria", "lucia"]]

### Pitfall 5: `getStatus("knowledge-curator")` falls through to "idle"
**What goes wrong:** `getStatus` checks `nodeActivity[nodeId]` first (from live events), then looks up in a `svcMap`. Neither covers `knowledge-curator` or `obsidian` — they default to "idle".
**Why it happens:** `svcMap` in `getStatus` only maps `gateways`, `manager`, `notebooks`, `librarian`, `qdrant` to health service names.
**How to avoid:** For `knowledge-curator`: read log freshness (last line timestamp). If last run was within 25 hours, return "active"; otherwise "idle". For `obsidian`: hardcode "active" — it is always the ground truth hub (static vault).
**Warning signs:** Both new nodes always show amber (idle) border regardless of curator run time.

[VERIFIED: react-flow-canvas.tsx getStatus() function lines 101-111]

### Pitfall 6: Row 4 x-coordinate overlap with canvas width
**What goes wrong:** Row 4 has 6 nodes (cookbooks, apo, gitnexus, llmwiki, knowledge-curator, obsidian). At 90px node width + reasonable padding, 6 nodes require ~780px minimum canvas width. The canvas is 100% width — on a narrow viewport, nodes in Row 4 may overlap.
**Why it happens:** fitView with padding 0.2 will zoom out to fit, but at 100% width the canvas needs ~840px to fit 6 nodes comfortably at spacing 120px.
**How to avoid:** Set x-spacing to ~130px for Row 4 nodes starting at x=20. Total span: 20 + (5 × 130) = 670px, comfortably within a 1024px+ desktop viewport. The `fitView` call on mount handles narrower viewports via zoom-out.

[VERIFIED: react-flow-canvas.tsx existing Row 3 nodes at x=20, 160, 460, 600, 760 — spans 760px + 90px node width = 850px]

---

## Code Examples

### FLOW-01: Remove truncate, set 8px fonts

```typescript
// Source: src/components/flow/react-flow-canvas.tsx — FlowNode label lines 50-54
// BEFORE:
<p style={{ fontSize: 10, fontWeight: 600, color: "#f59e0b", marginTop: 4, textAlign: "center", maxWidth: 88 }} className="truncate">
  {data.label}
</p>
<p style={{ fontSize: 8, color: "#64748b", textAlign: "center", maxWidth: 88 }} className="truncate">
  {data.subtitle}
</p>

// AFTER (per D-01 and UI-SPEC typography):
<p style={{ fontSize: 8, fontWeight: 700, color: "#f59e0b", marginTop: 4, textAlign: "center", maxWidth: 88, lineHeight: 1.2 }}>
  {data.label}
</p>
<p style={{ fontSize: 8, color: "#64748b", textAlign: "center", maxWidth: 88, lineHeight: 1.2 }}>
  {data.subtitle}
</p>
```

[VERIFIED: react-flow-canvas.tsx lines 50-55]

### FLOW-02: Heartbeat API route (new file)

```typescript
// Source: pattern from src/app/api/agents/route.ts + src/app/api/activity/route.ts
// File: src/app/api/heartbeat/route.ts
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { AGENT_CONFIGS_PATH } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agent");

  if (!agentId || agentId.includes("..") || agentId.includes("/")) {
    return NextResponse.json({ content: null }, { status: 400 });
  }

  const filePath = path.join(AGENT_CONFIGS_PATH, agentId, "HEARTBEAT_STATE.md");

  try {
    const text = await readFile(filePath, "utf-8");
    const lines = text.split("\n").filter(l => l.trim()).slice(-20);
    return NextResponse.json({ content: lines.join("\n") });
  } catch {
    // ENOENT or any error — graceful degradation per D-05
    return NextResponse.json({ content: null });
  }
}
```

[VERIFIED: file read pattern from activity/route.ts; AGENT_CONFIGS_PATH from constants.ts]

### FLOW-03: Activity feed noise-stripping regexes

The APO cron log format (verified from `~/.openclaw/logs/agent-lightning-cron.log`) uses:
- `==================================================` separator lines
- `=== Starting Agent-Lightning Loop: {date} ===` banners
- `--- Summary ---` headers
- No `[timestamp]` bracket form in APO log, but HEARTBEAT logs may use it

```typescript
// Source: apply inside /api/activity/route.ts message assembly
function cleanMessage(raw: string): string {
  let msg = raw;
  // Strip === delimiters and their content (banner lines)
  msg = msg.replace(/={3,}/g, "").trim();
  // Strip --- delimiters
  msg = msg.replace(/-{3,}/g, "").trim();
  // Strip leading [timestamp] bracket form: [2026-04-09 14:33:22]
  msg = msg.replace(/^\[\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\]\s*/g, "");
  // Strip trailing ISO-8601 timestamps mid-string
  msg = msg.replace(/\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?\s*/g, " ").trim();
  // Strip lone noise words (entire message is just this word)
  if (/^(Starting|Complete|cycle|Done|Running)\.?$/i.test(msg)) return "";
  return msg.trim();
}
```

[VERIFIED: actual log content from ~/.openclaw/logs/agent-lightning-cron.log and /tmp/knowledge-curator.log]

### FLOW-05: Knowledge Curator last-run time parsing

```typescript
// In react-flow-canvas.tsx — new helper function or inside nodeStats()
// Log path: /tmp/knowledge-curator.log (verified from crontab)
// Log format: [2026-04-10 02:44:28] Knowledge Curator complete.
//             [2026-04-10 02:00:00] Starting Knowledge Curator...

// Server-side: read in a new API or pass through existing data.
// Simplest approach: add to nodeStats("knowledge-curator") in the canvas
// by passing curator last-run as a prop (similar to memoryCount, knowledgeCount).
// OR: read directly in the heartbeat API for knowledge-curator.
```

[VERIFIED: /tmp/knowledge-curator.log timestamp format confirmed]

### FLOW-02: NodeDetailPanel heartbeat section

```typescript
// Source: src/components/flow/node-detail-panel.tsx — add after stats grid
// NodeDetailPanel needs a new useEffect to fetch /api/heartbeat

// State to add:
const [heartbeatContent, setHeartbeatContent] = useState<string | null>(null);
const [heartbeatLoading, setHeartbeatLoading] = useState(false);

// Effect to add (runs when nodeId changes):
useEffect(() => {
  if (!nodeId) { setHeartbeatContent(null); return; }
  setHeartbeatLoading(true);
  fetch(`/api/heartbeat?agent=${nodeId}`)
    .then(r => r.json())
    .then(d => setHeartbeatContent(d.content ?? null))
    .catch(() => setHeartbeatContent(null))
    .finally(() => setHeartbeatLoading(false));
}, [nodeId]);

// Section label per D-06:
// "Last State" when heartbeatContent is not null
// "Node Activity" when heartbeatContent is null

// Render heartbeat section (after stats grid, before events):
{heartbeatLoading && (
  <p className="text-xs text-slate-500">Loading state...</p>
)}
{!heartbeatLoading && heartbeatContent && (
  <div className="p-4 border-b border-slate-800">
    <p className="text-xs font-medium text-slate-500 mb-2">Last State</p>
    <pre className="font-mono text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap">{heartbeatContent}</pre>
  </div>
)}
```

[VERIFIED: node-detail-panel.tsx structure; UI-SPEC heartbeat section contract]

---

## Runtime State Inventory

> Not a rename/refactor/migration phase — this section is omitted.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| CSS `truncate` on node labels | Remove truncate, allow wrap, reduce font size | Labels now fully readable at small font |
| Static label size: 10px/8px | Unified 8px/8px with weight distinction (bold/regular) | Per UI-SPEC typography contract |
| Panel always shows "Node Activity" | "Node Activity" or "Last State" depending on HEARTBEAT_STATE.md | Clearer panel affordance |
| No knowledge-curator node | New node with live last-run time from `/tmp/knowledge-curator.log` | Curator is now visible in the graph |
| No Obsidian hub node | New rightmost anchor node in Row 4 with 3 incoming knowledge edges | Knowledge architecture is visually complete |

---

## Open Questions

1. **Knowledge Curator subtitle: server-side or client-side read?**
   - What we know: The subtitle needs last-run time from `/tmp/knowledge-curator.log`, and the canvas is a client component. Reading a local file requires a server-side API call.
   - What's unclear: Should last-run be fetched via the heartbeat API (extend it to return last-run time for system nodes), or via a dedicated query param on the same route, or passed as a prop via page.tsx using a new server data hook?
   - Recommendation: Simplest path — extend the `/api/heartbeat?agent=knowledge-curator` response to also include a `lastRun` field by checking the curator log. The `nodeStats` for `knowledge-curator` can show "Last Run" + relative time from this API call. Planner should pick one approach.

2. **`getStatus("knowledge-curator")` — where does freshness logic live?**
   - What we know: `getStatus` runs in the client-rendered canvas. It cannot read files directly.
   - What's unclear: The canvas currently derives status from `nodeActivity` (from events API) or `services` (from health API). Neither covers curator.
   - Recommendation: Add a new field to the activity API response — `curatorLastRun: string | null` — so the canvas can compute freshness. Alternatively, always return "idle" for curator and let the subtitle show last-run time without affecting border color. This is a planner decision.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js fs/promises | /api/heartbeat route | ✓ | Built-in | — |
| `/tmp/knowledge-curator.log` | FLOW-05 last-run time | ✓ | exists (2026-04-10 run) | Static "nightly · curator" subtitle |
| `~/github/knowledge/agent-configs/` | FLOW-02 heartbeat | ✓ | 22 agent dirs | — |
| HEARTBEAT_STATE.md files | FLOW-02 panel content | ✗ | None exist yet | Graceful degradation (D-05) |
| Next.js build/start | All routes | ✓ | 16.2.2 | — |

**Missing dependencies with no fallback:**
- None — all missing items have explicit graceful degradation per the locked decisions.

**Missing dependencies with fallback:**
- `HEARTBEAT_STATE.md`: not present for any agent — panel silently shows stats-only view (D-05 is the fallback).

---

## Validation Architecture

> `workflow.nyquist_validation` is absent in `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected (no test dir, no test script in package.json) |
| Config file | None — Wave 0 gap |
| Quick run command | `npm run build` (type-check + compile) |
| Full suite command | `npm run build && npm run lint` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FLOW-01 | Labels render without truncation | manual-only | Visual check: load `/flow` on desktop, confirm all node labels visible | N/A |
| FLOW-02 | Heartbeat panel shows HEARTBEAT_STATE.md content OR graceful empty | smoke | `curl http://localhost:3002/api/heartbeat?agent=claude-sonnet-engineer` returns `{"content":null}` | ❌ Wave 0 |
| FLOW-03 | Activity messages have noise stripped | smoke | `curl http://localhost:3002/api/activity` — check messages field contains no `===` or `---` | ❌ Wave 0 |
| FLOW-04 | No overlap on desktop | manual-only | Load `/flow` at 1280px wide, visually verify 4 rows | N/A |
| FLOW-05 | Knowledge Curator node visible with last-run subtitle | manual-only | Load `/flow`, confirm 🧹 node appears in Row 4 | N/A |
| FLOW-06 | New data-flow edges visible | manual-only | Load `/flow`, confirm mem0→QMD and llmwiki→QMD edges present | N/A |
| FLOW-07 | Obsidian node visible with 3 incoming knowledge edges | manual-only | Load `/flow`, confirm 📓 node at right of Row 4 with green edges | N/A |

### Sampling Rate
- **Per task commit:** `npm run build` (catches TypeScript errors)
- **Per wave merge:** `npm run build && npm run lint`
- **Phase gate:** Full build green + manual visual verification of all 7 requirements before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Smoke test script for `/api/heartbeat` endpoint validation
- [ ] Smoke test script for `/api/activity` noise-stripping validation
- [ ] (Optional) `curl`-based smoke tests can be run manually without a test framework

*(No test framework exists — build + lint + manual visual review is the only available verification. The planner should not introduce a test framework in this phase.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user local dashboard |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | Single-user local dashboard |
| V5 Input Validation | yes | Path traversal on `agentId` param in `/api/heartbeat` |
| V6 Cryptography | no | No crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `agent` param | Tampering | Reject any `agentId` containing `..` or `/` before constructing file path |
| File read outside agent-configs dir | Information Disclosure | Use `path.join(AGENT_CONFIGS_PATH, agentId, "HEARTBEAT_STATE.md")` — never interpolate raw user input into path string |

**Path traversal guard (critical):**

```typescript
// In /api/heartbeat/route.ts
if (!agentId || agentId.includes("..") || agentId.includes("/") || agentId.includes("\\")) {
  return NextResponse.json({ content: null }, { status: 400 });
}
```

The `agentId` values expected are clean slugs like `claude-sonnet-engineer`, `lucia-kilo-claw`. Any path separator or dotdot must be rejected.

[VERIFIED: AGENT_CONFIGS_PATH directory contains only agent slug subdirs — no traversal escape possible with the guard above]

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on This Phase |
|-----------|----------------------|
| `execFileSync` not `exec` for shell commands | `/api/heartbeat` uses `readFile` only — no exec needed. Compliant. |
| Run impact analysis before editing any symbol | Apply to `FlowNode`, `ReactFlowCanvas`, `NodeDetailPanel`, `GET` in activity route |
| Run `gitnexus_detect_changes()` before committing | Required after each task |
| Never rename symbols with find-and-replace | No renames in this phase |
| This Next.js has breaking changes vs training data — read docs in `node_modules/next/dist/docs/` | All API route patterns verified against existing routes in this codebase, not training data |
| Vector store: QMD = BM25 only, `qmd embed` is FORBIDDEN, Qdrant = all vector search | This phase does not touch vector search or QMD embed |
| Verify before writing code; test/verification step first | Build + smoke curl tests serve as verification |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `/tmp/knowledge-curator.log` log timestamp format `[YYYY-MM-DD HH:MM:SS]` is stable and matches what will be read at runtime | FLOW-05, Code Examples | Last-run display shows wrong time or breaks silently |
| A2 | `NodeDetailPanel` is a client component and can use `useEffect`/`fetch` without server-side wrapper | FLOW-02, Code Examples | Would need to restructure data fetch to page.tsx level |

**Both assumptions are LOW risk** — A1 is verified from the actual log file today; A2 is confirmed by the `"use client"` directive at line 1 of node-detail-panel.tsx.

---

## Sources

### Primary (HIGH confidence)
- `src/components/flow/react-flow-canvas.tsx` — all node/edge definitions, FlowNode component, verified line-by-line
- `src/components/flow/node-detail-panel.tsx` — panel structure, verified
- `src/components/flow/activity-feed.tsx` — feed rendering, verified
- `src/app/api/activity/route.ts` — existing log parsing, verified
- `src/app/flow/page.tsx` — data wiring, prop passing, verified
- `src/lib/constants.ts` — AGENT_CONFIGS_PATH, POLL_INTERVALS, verified
- `package.json` — all dependency versions, verified
- `/tmp/knowledge-curator.log` — timestamp format and log structure, verified
- `~/.openclaw/logs/agent-lightning-cron.log` — APO log noise format, verified
- `crontab -l` — knowledge-curator cron schedule and log path, verified

### Secondary (MEDIUM confidence)
- `.planning/phases/04-flow-diagram-upgrade/04-UI-SPEC.md` — visual + interaction contract
- `.planning/phases/04-flow-diagram-upgrade/04-CONTEXT.md` — all locked decisions
- `find /Users/yourname/github/knowledge/agent-configs -name "HEARTBEAT_STATE.md"` — confirmed no files exist

### Tertiary (LOW confidence)
- None — all critical claims verified from source

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified from package.json
- Architecture: HIGH — all patterns verified from existing codebase files
- Pitfalls: HIGH — all pitfalls derived from actual code inspection, not assumptions
- HEARTBEAT_STATE.md availability: HIGH — confirmed absent, graceful degradation path is locked decision

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable codebase; no fast-moving dependencies)
