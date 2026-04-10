# Phase 4: Flow Diagram Upgrade - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish the React Flow diagram so all 13+ nodes (plus 2 new ones) are visible and readable on desktop, node labels don't truncate, the detail panel shows real heartbeat state content, the activity feed is human-readable, and new Knowledge Curator + Obsidian nodes appear with correct data-flow edges.

No new pages, no new data sources beyond reading HEARTBEAT_STATE.md files and cron log. Pure visual + API polish + additive node work.

</domain>

<decisions>
## Implementation Decisions

### Label Display (FLOW-01)
- **D-01:** Remove `truncate` CSS from label and subtitle `<p>` elements in `FlowNode`. Allow text to wrap. Reduce font sizes slightly if needed (label: 9px, subtitle: 7px) to keep nodes compact.
- **D-02:** Node container width stays at 90px — don't widen nodes to fix labels.

### Node Detail Panel (FLOW-02)
- **D-03:** Read `HEARTBEAT_STATE.md` (not `HEARTBEAT.md`) from the agent's config directory. Show the last 20 lines of that file as the primary panel content, below the existing stats grid.
- **D-04:** API route needed: `GET /api/heartbeat?agent={agentId}` — reads `~/github/knowledge/agent-configs/{agentId}/HEARTBEAT_STATE.md`, returns last 20 lines as plain text.
- **D-05:** If `HEARTBEAT_STATE.md` doesn't exist for a node (e.g. system nodes like mem0, QMD), fall back to existing stats-only view. No error shown — graceful degradation.
- **D-06:** Panel label changes from "Node Activity" to "Last State" when heartbeat content is available.

### Activity Feed (FLOW-03)
- **D-07:** Pattern-based cleanup in `/api/activity/route.ts`. Strip: `===`, `---`, leading/trailing `[timestamp]` prefixes, raw ISO-8601 timestamps mid-string, and common noise words like "Starting", "Complete", "cycle" when alone. Keep the semantic content.
- **D-08:** No LLM involvement. Pure regex/string transforms. Example: `=== APO Cycle Starting 2026-04-09T14:33:22 ===` → `APO Cycle Starting`.

### New Nodes: Knowledge Curator + Obsidian (FLOW-05, FLOW-06, FLOW-07)
- **D-09:** Add `knowledge-curator` node (🧹, label: "Knowledge Curator", subtitle: "nightly · curator") in the knowledge infrastructure row.
- **D-10:** Add `obsidian` node (📓, label: "Obsidian", subtitle: "knowledge vault") as the rightmost anchor in the knowledge row — the ground truth hub.
- **D-11:** Knowledge Curator edges (FLOW-05): curator → gitnexus (knowledge), curator → llmwiki (knowledge), curator → notebooks/mem0 (memory), curator → librarian/QMD (knowledge).
- **D-12:** Obsidian hub edges (FLOW-07): librarian → obsidian (knowledge), llmwiki → obsidian (knowledge), curator → obsidian (knowledge).
- **D-13:** New data-flow edges (FLOW-06): notebooks → librarian (mem0→QMD bridge, memory color), llmwiki → librarian (knowledge color). These replace or supplement existing edges.
- **D-14:** Knowledge Curator node shows last-run time in subtitle when available. Source: read the Knowledge Curator cron log (`~/.local/logs/knowledge-curator.log` or the path from env). If unavailable, show "nightly · curator" static subtitle. No separate cron data API needed unless the log exists.

### Layout / No Overlap (FLOW-04)
- **D-15:** Keep hardcoded coordinates — no elkjs dependency. Re-tune positions to add a dedicated "knowledge infrastructure" row below the current bottom row.
- **D-16:** Proposed row structure:
  - Row 1 (y≈100): request, gateways, manager, output
  - Row 2 (y≈280): dynamic agent nodes (remote + local)
  - Row 3 (y≈440): tunnels, taskboard, notebooks/mem0, librarian/QMD, qdrant
  - Row 4 (y≈580): cookbooks, apo, gitnexus, llmwiki, knowledge-curator, obsidian
- **D-17:** Canvas height increases from 620px to 720px to accommodate 4 rows without crowding.

### Claude's Discretion
- Exact pixel coordinates within each row — planner/executor tunes for non-overlap
- Edge label text (if any) — keep minimal or none
- Animation speed on new edges — match existing animated edges

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Flow Components
- `src/components/flow/react-flow-canvas.tsx` — All node/edge definitions, FlowNode component, hardcoded positions
- `src/components/flow/node-detail-panel.tsx` — Panel UI, stats grid, event list
- `src/components/flow/activity-feed.tsx` — Feed rendering
- `src/app/api/activity/route.ts` — Activity event generation, log parsing

### Page
- `src/app/flow/page.tsx` — FlowPage, data wiring, panel state

### Requirements
- `.planning/REQUIREMENTS.md` — FLOW-01 through FLOW-07 acceptance criteria

### Agent Heartbeat Files
- `~/github/knowledge/agent-configs/{agentId}/HEARTBEAT_STATE.md` — Last-run state content for panel (FLOW-02)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FlowNode` (inline in react-flow-canvas.tsx): custom node component — modify label/subtitle rendering in-place
- `NodeDetailPanel`: add heartbeat content section below existing stats grid
- `/api/activity/route.ts`: add cleanup transforms to existing message assembly
- `EDGE_COLORS` map: reuse existing color tokens (request, knowledge, memory, apo) for new edges

### Established Patterns
- All node positions are hardcoded `{ x, y }` objects — continue this pattern, just retune values
- `getStatus()` and `nodeStats()` are local functions in the canvas — add cases for new node IDs
- New API routes go in `src/app/api/` using Next.js route handlers
- `execFileSync` not `exec` (security constraint from PROJECT.md)

### Integration Points
- `page.tsx` passes `onNodeClick` → `react-flow-canvas.tsx` → `node-detail-panel.tsx` — new heartbeat API call goes in `NodeDetailPanel` or a new hook
- `useActivity` hook (in `api-client`) already polls `/api/activity` — no changes needed to polling

</code_context>

<specifics>
## Specific Ideas

- Keep node container width at 90px — don't make nodes larger to fix label overflow
- Canvas height: 620px → 720px for the 4th row
- The Obsidian node is the "ground truth hub" — position it as the rightmost node in the bottom row to visually anchor the knowledge cluster

</specifics>

<deferred>
## Deferred Ideas

- `FLOW-08`: Flow node positions persist in localStorage — v2 requirement, not this phase
- `FLOW-09`: Multiple layout modes (hierarchical, force-directed) — v2 requirement, not this phase
- elkjs / auto-layout — deferred, not needed for this phase's scope

</deferred>

---

*Phase: 04-flow-diagram-upgrade*
*Context gathered: 2026-04-10*
