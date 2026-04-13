# Technology Stack — v1.3 Delta Research

**Project:** Agent Kitchen v1.3 Advanced Observability + Knowledge Depth
**Researched:** 2026-04-13
**Scope:** New capabilities only. Existing stack (Next.js 16, Tailwind 4, @xyflow/react 12.10.2, Recharts 3.8.1, Framer Motion 12.38.0, TanStack Query 5.96.2, Python 3) is validated — not re-researched.

---

## Primary Finding: Zero New npm Packages Required

Every v1.3 feature maps to capabilities already present in the installed stack. No new dependencies. This is the most important output of this research.

The existing packages provide all necessary primitives. The work is pattern application, not package addition.

---

## Feature-to-Stack Mapping

### FLOW-12: Collapsible Node Groups

**API:** `parentId` property on `Node` objects in @xyflow/react v12. Confirmed present in installed bundle (`node_modules/@xyflow/react/dist/umd/index.js` contains `parentId`).

**Current state:** `GroupBoxNode` renders as a visual overlay with `pointerEvents: "none"` and `zIndex: -1`. Groups are purely decorative — child nodes are not graph-model children of the group. This means collapse cannot be done by hiding a subtree; it requires filtering the nodes array manually.

**Required pattern change (no new packages):**
- Set `parentId: "group-agents"` (or `"group-devtools"`) on each child node in the `nodes` array in `react-flow-canvas.tsx`
- Coordinates on child nodes become relative to the parent group node when `parentId` is set
- Set `extent: "parent"` on child nodes to constrain dragging within the group boundary
- Collapse = filter child nodes out of the rendered nodes array + shrink the group box's `data.height` to ~40px (header-only). A `Set<string>` of collapsed group IDs in component state drives this.
- `GroupBoxNode` must become interactive: remove `selectable: false`, add `pointerEvents: "auto"`, add a collapse/expand toggle button rendered inside the group header

**Integration point:** All state lives inside `ReactFlowCanvas`. `ReactFlowCanvasProps` interface does not change.

**Confidence:** HIGH — `parentId` confirmed in bundle. Core React Flow parent-child behavior since v10.

---

### FLOW-13: Per-Node Inline Activity Panel (last 10 events on click)

**API:** Existing `NodeDetailPanel` component (Framer Motion `AnimatePresence` side panel, already wired in `FlowPage`).

**Current state:** `NodeDetailPanel` already receives `events: Event[]`, filters by `nodeId`, and shows up to 15 events. The feature is 90% implemented. "Last 10 events inline on node click" maps to this panel trimmed to 10 events with a more compact layout.

**Implementation choice:**

Option A — Trim the existing side panel (recommended for v1.3): Change `.slice(0, 15)` to `.slice(0, 10)`, tighten padding, and ensure the panel opens immediately on first click. Zero new APIs.

Option B — On-canvas node overlay: Expand `FlowNode` to render a mini event list below the icon when `data.highlighted === true`. Requires passing filtered events into each node's `data` field through `ReactFlowCanvasProps`. Deferred: on-canvas overlays require careful z-index management and can occlude edges.

**Recommendation:** Option A for v1.3. The side panel already animates smoothly via Framer Motion and handles the node-click wiring in `FlowPage`.

**Confidence:** HIGH — pattern is already working, change is a trim and style adjustment.

---

### SKILL-06: Skill Failure Rate Tracking

**API:** Node.js built-in `fs/promises` (`readFile`). Same module already used in `src/app/api/skills/route.ts`.

**Log format confirmed** (live file: `~/github/knowledge/logs/failures.log`):
```
2026-04-08 11:37:18,487 | ERROR | {"timestamp": "...", "error_type": "memory_add_failed", "details": {"agent_id": "..."}, "exception": "...", "traceback": "..."}
```

Format is `[datetime] | [level] | {json_payload}`. This is NOT pure JSONL — each line must be split on ` | ` and the third segment parsed as JSON. Tracebacks span multiple lines; only the first line of each entry contains the JSON payload. Parse first-line-only is sufficient for failure rate counting.

**Parsing pattern (mirrors JSONL pattern already in skills route):**
```typescript
const lines = raw.split("\n").filter(l => l.includes(" | ERROR | "));
for (const line of lines) {
  try {
    const payload = JSON.parse(line.split(" | ")[2]);
    // use payload.error_type, payload.details.agent_id
  } catch { /* skip malformed */ }
}
```

**Skill attribution limitation:** The failures log identifies `agent_id` (e.g., `"cmo"`, `"claude"`), not skill names. Per-skill failure attribution requires that a `skill` field be added to future failure log entries in `mem0-server.py` or wherever failures originate. For v1.3, surface failure rate by `error_type` and `agent_id`, not per skill directly.

**New route:** `/api/skills/failures` — sibling to existing `/api/skills/route.ts`. Returns `{ failuresByType: Record<string, number>, failuresByAgent: Record<string, number>, last7Days: number }`.

**Confidence:** HIGH for failure rate by agent/type. MEDIUM for per-skill attribution (log does not currently include skill name field).

---

### SKILL-07: Skill Coverage Gaps (zero-usage in 30 days)

**API:** Node.js built-in `fs/promises` (`readdir`, `readFile`). Same modules used in existing skills route.

**Algorithm (all data available from existing sources):**
1. `readdir(SKILLS_PATH)` → full skill name list (already in `/api/skills` route, line 25)
2. Parse `skill-contributions.jsonl` → build `Map<skillName, lastContributedTimestamp>`
3. Skills with no `"contributed"` action in 30 days (or never) = gaps

**JSONL action semantics confirmed** (live file sample):
- `"action": "synced"` — appeared in a sync run (not a usage signal)
- `"action": "contributed"` — actively contributed by an agent (the real usage signal)
- `"action": "pruned"` — marked for removal

Coverage gap = no `"contributed"` entry in 30 days, regardless of `"synced"` entries.

**Integration:** Add `coverageGaps: string[]` and `gapThresholdDays: number` to the existing `/api/skills` response. Alternatively, create `/api/skills/gaps` as a sibling route if the gaps report is large and shouldn't inflate the main polling response.

**Confidence:** HIGH — all data is in existing JSONL, algorithm is straightforward.

---

### SKILL-08: Per-Skill Usage Heatmap

**API:** CSS grid + Tailwind + inline `backgroundColor`. No chart library.

**Why not a dedicated library:**
- Recharts 3.8.1 has no native heatmap component. Using ScatterChart as a heatmap is misuse with poor UX.
- `react-grid-heatmap`, `cal-heatmap`, `nivo` would each add a package for ~30 lines of CSS grid logic.
- Third-party heatmap libraries ship their own color palettes that conflict with the existing slate/amber/emerald design language.
- CSS grid is the standard pattern for this (GitHub contribution graph, npm trends).

**Implementation pattern:**
```typescript
// N skills × 30 days grid
const intensity = count / maxCount; // 0 to 1
const bg = count === 0
  ? "rgba(30,41,59,0.8)"                          // slate-800 for zero
  : `rgba(16,185,129,${Math.max(0.15, intensity)})`; // emerald-500 scaled
```

A `div` grid of colored cells with `title` tooltip for each cell (native browser, no library needed). Recharts `Tooltip` component is overkill here.

**Data source:** Extend `/api/skills` or `/api/skills/gaps` to return `usageBySkillByDay: Record<string, Record<string, number>>` — a map of `{ skillName: { "YYYY-MM-DD": count } }` derived from the JSONL timestamps.

**Confidence:** HIGH — CSS grid pattern is unambiguous, zero dependencies.

---

### KNOW-08: `projects/` Subdirectory Ingestion into mem0

**API:** Python 3 built-in modules (`pathlib`, `hashlib`, `os`, `urllib.request`). Same as `obsidian-to-mem0.py`.

**Directory structure confirmed** (live filesystem):
```
~/github/knowledge/projects/
  alex/meetings/
  agent-kitchen/
  attentivemobile/
  4legacycapital/
  ... (~20+ subdirectories)
```

Each subdirectory is a project containing markdown files (meetings notes, context docs, etc.).

**Pattern to follow exactly** (`obsidian-to-mem0.py`):
1. State file: extend `obsidian-ingestion-state.json` with a `"projects"` key — one sub-object per project directory
2. `mtime` watermark per directory (same as journals `last_mtime`)
3. SHA256 content-hash dedup (same `processed_hashes` list per project)
4. Atomic write via `os.replace()` (identical pattern)
5. `POST /memory/add` with `source="projects-sync"` in metadata

**State file extension:**
```json
{
  "obsidian-journals": { "last_mtime": "...", "processed_hashes": [] },
  "projects": {
    "alex": { "last_mtime": "...", "processed_hashes": [] },
    "agent-kitchen": { "last_mtime": "...", "processed_hashes": [] }
  }
}
```

**Recommendation:** Create `projects-to-mem0.py` as a sibling script (not extending `obsidian-to-mem0.py`). Keeps journals and projects ingestion independently testable. Add as Step 7 in `knowledge-curator.sh`.

**Confidence:** HIGH — pattern proven in production, directory structure confirmed.

---

### KNOW-09: Per-Project `agent_id` Routing

**API:** Python `dict` lookup + `POST /memory/add` with `agent_id` from directory name. mem0 REST API already supports arbitrary `agent_id` values (confirmed: existing scripts use `"claude"`, `"cmo"`, `"shared"`, etc.).

**Routing strategy:** Use the project subdirectory name directly as `agent_id`.

```python
PROJECT_AGENT_OVERRIDES = {
    "business": "shared",    # generic business context → shared pool
    "operations": "shared",  # same
}

def agent_id_for_project(project_name: str) -> str:
    return PROJECT_AGENT_OVERRIDES.get(project_name, project_name)
```

If the directory name does not match a known agent and no override exists, use the name as-is (mem0 will create a new agent context). Fall back to `"shared"` only via the overrides dict.

**Confidence:** HIGH — mem0 REST API accepts arbitrary `agent_id`, current scripts demonstrate the pattern.

---

## Alternatives Considered and Rejected

| Category | Rejected | Why |
|----------|----------|-----|
| Heatmap | `react-grid-heatmap` | Adds npm dep for ~30 lines of CSS grid |
| Heatmap | `nivo` HeatMap | Large bundle, incompatible color system |
| Heatmap | Recharts ScatterChart | Misuse of scatter; poor calendar-style layout |
| Node collapse | React Flow `<Panel>` | For toolbar overlays, not node grouping |
| Log parsing | `readline` streaming | `failures.log` is small enough for `readFile` |
| FLOW-13 | On-canvas overlay (Option B) | Z-index complexity, occludes edges, deferred |
| KNOW-08 | Separate state files per project | Many small files; extending existing state is simpler |
| KNOW-09 | Config-driven project→agent map file | Overkill; directory-name-as-agent-id is sufficient with overrides dict |

---

## No New Dependencies Confirmation

| Package | Version | Status | v1.3 Use |
|---------|---------|--------|----------|
| `@xyflow/react` | 12.10.2 | Installed | `parentId`, `extent: "parent"` for FLOW-12 |
| `framer-motion` | 12.38.0 | Installed | AnimatePresence for FLOW-13 panel (already wired) |
| `recharts` | 3.8.1 | Installed | Not used for heatmap (CSS grid instead) |
| `@tanstack/react-query` | 5.96.2 | Installed | New skill API routes |
| Node.js `fs/promises` | built-in | — | SKILL-06/07/08 log parsing |
| Python `pathlib`, `hashlib`, `urllib` | built-in | — | KNOW-08/09 (identical to existing scripts) |

---

## Integration Points Summary

| Feature | File to Change | Change Type |
|---------|---------------|-------------|
| FLOW-12 | `src/components/flow/react-flow-canvas.tsx` | Add `parentId`/`extent` to child nodes; add collapse state + toggle to `GroupBoxNode` |
| FLOW-13 | `src/components/flow/node-detail-panel.tsx` | Trim to 10 events, compact layout |
| SKILL-06 | New `src/app/api/skills/failures/route.ts` | Parse `failures.log` with `readFile` |
| SKILL-07 | `src/app/api/skills/route.ts` or new `/api/skills/gaps/route.ts` | Cross-ref `readdir` + JSONL for 30-day gaps |
| SKILL-08 | New `src/components/skills/SkillHeatmap.tsx` | CSS grid, data from extended skills API |
| KNOW-08/09 | New `~/github/knowledge/scripts/projects-to-mem0.py` | Extend obsidian-to-mem0.py pattern with per-project agent_id routing |

---

## Sources

- `package.json` — `/Users/yourname/github/agent-kitchen/package.json` (confirmed all package versions)
- `parentId` confirmed present — `node_modules/@xyflow/react/dist/umd/index.js`
- Failures log format confirmed — `/Users/yourname/github/knowledge/logs/failures.log` (live)
- JSONL action semantics confirmed — `/Users/yourname/github/knowledge/skill-contributions.jsonl` (live)
- Projects directory confirmed — `ls ~/github/knowledge/projects/` (live)
- Python script pattern — `/Users/yourname/github/knowledge/scripts/obsidian-to-mem0.py` (lines 1-80)
- Existing skill route — `src/app/api/skills/route.ts`
- Existing flow canvas — `src/components/flow/react-flow-canvas.tsx`
- Existing detail panel — `src/components/flow/node-detail-panel.tsx`
