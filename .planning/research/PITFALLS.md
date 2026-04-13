# Domain Pitfalls — v1.3 Feature Integration

**Project:** Agent Kitchen v1.3
**Researched:** 2026-04-13
**Scope:** Adding FLOW-12, FLOW-13, SKILL-06/07/08, KNOW-08/09 to existing codebase

---

## Critical Pitfalls

### PITFALL-1: React Flow parentId changes absolute coordinates to parent-relative

**Feature:** FLOW-12 (Collapsible node groups)
**What goes wrong:** When `parentId` is set on a child node, React Flow (@xyflow/react v12) interprets that node's `position` as relative to the parent container node's origin — not the canvas origin. The existing `GroupBoxNode` nodes (`group-agents`, `group-devtools`) currently use absolute canvas positions and have `pointerEvents: none`. If you add `parentId` to agent/devtool nodes to make them "inside" the group, every node's `x/y` must be recalculated as an offset from the group box's position rather than the canvas. Failure to do this produces nodes that jump to wrong positions on first render.

**Why it happens:** React Flow's parent/child containment model was designed for true nesting, not visual grouping. The current implementation uses group boxes purely as z-index=-1 decorators with manual pixel math. Adding `parentId` retrofits a different system onto that manual math.

**Consequences:** Agent nodes visually relocate to wrong positions, edges route to wrong anchor points, and `fitView` zooms to the wrong bounding box. The bug is invisible in dev mode if you hardcode positions but breaks dynamically sized groups (which `group-agents` is — width depends on `keyRemote.length`).

**Prevention:**
- Before setting `parentId`, calculate child positions as `(child_canvas_x - group_x, child_canvas_y - group_y)`. Current values: `AGENT_START_X=100`, group `x=AGENT_START_X-15=85`; so child offset_x = `100 - 85 = 15`. Do this math explicitly in a constant.
- Also add `extent: "parent"` on child nodes so they cannot be dragged outside the group boundary.
- The group node itself must have explicit `width` and `height` on the node object (not just in `data`) — React Flow v12 uses those for boundary calculations. Add `width` and `height` directly to the `Node` object for group nodes, not only in `data`.
- Test collapse/expand with 3 agents (minimum), 5 agents (normal), and 0 agents (edge case) because `agentBoxWidth` is dynamically computed.

**Detection:** After adding `parentId`, if nodes appear at (0,0) or cluster at top-left corner of canvas, the coordinate recalculation is wrong.

**Phase:** FLOW-12 (collapsible group phase)

---

### PITFALL-2: GroupBoxNode collapse breaks edge routing

**Feature:** FLOW-12
**What goes wrong:** Currently `GroupBoxNode` has `pointerEvents: none` and `selectable: false, draggable: false`. Making it interactive for collapse requires removing `pointerEvents: none`. But when the group is collapsed, the child nodes need to either be hidden (removed from nodes array) or moved inside the group bounds. If you simply hide child nodes by removing them from the array, all their edges (`mgr-${id}`, `${id}-mem`, etc.) will render as dangling edges with no target — React Flow v12 does NOT silently discard edges to missing nodes; it throws console warnings and the edge line renders to coordinate (0,0).

**Why it happens:** The edges array is computed independently from nodes. When nodes are conditionally removed during collapse, edge sources/targets become stale.

**Consequences:** Console errors, visual artifacts (edges running to canvas corner), potential layout thrash on every render cycle because the missing-node edges trigger reconciliation.

**Prevention:**
- On collapse: filter edges to remove any edge whose source or target is in the collapsed group before passing to ReactFlow.
- Alternative: keep child nodes in the array but set `hidden: true` on them. React Flow v12 supports `hidden` on nodes and automatically hides edges connected to hidden nodes. This is cleaner than array manipulation.
- Use `hidden: true` approach — it avoids rebuilding the edges useMemo on every collapse state change.

**Detection:** Edges visually shooting to top-left corner of canvas when a group is collapsed.

**Phase:** FLOW-12

---

### PITFALL-3: failures.log format is not guaranteed stable

**Feature:** SKILL-06 (failure rate tracking)
**What goes wrong:** The actual failures.log format is:
```
2026-04-08 11:37:18,487 | ERROR | {"timestamp": "...", "error_type": "...", "details": {...}, "exception": "...", "traceback": "..."}
```
The milestone context states the format as `[datetime] | ERROR | {json}` — accurate but incomplete. Key risks:
1. The header line `# Failures log cleared 2026-04-05 21:16:16 PDT` is not a parseable log line and will cause JSON parse errors if not handled.
2. The JSON blob after `| ERROR |` contains embedded newlines in the `traceback` field. A naive line-by-line parser splits tracebacks across multiple lines and corrupts the JSON.
3. The `error_type` field is not enumerated — observed types include `memory_add_failed`, `disk_critical`. New error types will be added without notice.
4. Not all entries have `| ERROR |` level — the file is multi-severity.

**Consequences:** Parser crash on comment header line; silently incorrect failure counts because multi-line traceback entries are counted as multiple events; wrong failure attribution when grouping by `agent_id` (not all error types have `agent_id` in details — `disk_critical` has none).

**Prevention:**
- Parse with a stateful reader: split on the delimiter pattern `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} \| ERROR \|` (anchored on timestamp, not line start), treat everything between two such anchors as one entry.
- Skip lines starting with `#`.
- After extracting the JSON portion, parse it with try/except and discard malformed entries (don't crash).
- Group by `error_type` first, then by `details.agent_id` only for types that have it.
- The log file is 515 lines and growing. Use tail-read (last N bytes) with a configurable lookback window — do not read the entire file on every 10s poll. Use a lookback of 7 days by timestamp.

**Detection:** Test parser against the actual file before integrating. Any parse that yields exactly 1 error per line has missed multi-line tracebacks.

**Phase:** SKILL-06

---

### PITFALL-4: SKILL-07 coverage gap must not recurse vault

**Feature:** SKILL-07 (coverage gaps — skills with zero usage in 30 days)
**What goes wrong:** SKILL-07 requires cross-referencing available skills on disk. The natural approach is `Path(skills_dir).iterdir()`. The master skills dir (`~/github/knowledge/skills/`) is safe — 264 entries, shallow. The vault root (`~/github/knowledge/`) is NOT. If the implementation accidentally calls `iterdir()` or `glob("**/*")` on the vault root instead of the skills subdirectory, it will recurse 518+ files. The constraint "never recursive readdir on vault" applies here because the skills dir is inside the vault.

**Consequences:** At 10s polling cadence, `rglob` on the vault is catastrophic inode load. This regression was hit in v1.1.

**Prevention:**
- Use `Path(CONFIG["master_dir"]).iterdir()` (non-recursive, shallow) — same pattern as `get_skills_in_dir()` already in skill-sync.py.
- Never pass vault root to any glob. Only use absolute paths to specific subdirs.
- CRITICAL: skill-contributions.jsonl only contains `action: "synced"` events (confirmed by inspection — no `"used"` events exist). SKILL-07 cannot determine "usage" from this file. It must read skill usage from `~/.openclaw/skill-sync-state.json` (the `skill_usage` dict), NOT from the JSONL. Verify this before building the route.

**Detection:** If the API route for SKILL-07 takes >500ms, it is almost certainly recursing too wide. Benchmark on first implementation.

**Phase:** SKILL-07

---

## Moderate Pitfalls

### PITFALL-5: CSS grid heatmap renders 0px cells when skill count is 0

**Feature:** SKILL-08 (per-skill usage heatmap)
**What goes wrong:** A CSS grid heatmap using `grid-template-columns: repeat(N, 1fr)` where N=0 is invalid CSS and produces a broken layout. The `skillCount` prop can be 0 on first load before data arrives (TanStack Query returns `undefined` while loading).

**Prevention:**
- Guard: `if (!skills || skills.length === 0) return <EmptyState />` before rendering the grid.
- Clamp N to a minimum of 1: `Math.max(1, Math.ceil(Math.sqrt(skills.length)))` for column count.
- Use `isLoading` from TanStack Query to show a skeleton, not a 0-column grid.

**Phase:** SKILL-08

---

### PITFALL-6: SKILL-08 heatmap performance — 264 cells at 10s poll

**Feature:** SKILL-08
**What goes wrong:** There are 264 skills in the master registry. A heatmap with 264 cells, each with individual hover state, re-renders at every 10s data poll if the parent component holds the hover state. In React, hovering cell #1 and receiving a data update triggers a full 264-cell diff.

**Prevention:**
- Move hover state into a local `useState` in the heatmap component, not in the page component.
- Memoize the cell array with `useMemo` keyed on skill data. Cells should be stable references between polls if skill counts haven't changed.
- Do NOT use `useQuery` with `refetchInterval: 10000` directly in the heatmap component — pull data from the parent and pass as props so the heatmap doesn't independently trigger polling.
- Do not add Framer Motion animation to individual heatmap cells — this creates 264 simultaneous animation instances.

**Phase:** SKILL-08

---

### PITFALL-7: KNOW-08 new script must use isolated state file

**Feature:** KNOW-08/09 (projects/ subdir ingestion)
**What goes wrong:** `obsidian-to-mem0.py` writes to `obsidian-ingestion-state.json`. A new `projects-to-mem0.py` script sharing that state file creates a read-modify-write race — both scripts run from `knowledge-curator.sh`, potentially overlapping. The second writer silently overwrites the first writer's state updates.

**Prevention:**
- Give the projects script its own state file: `projects-ingestion-state.json` — same isolation pattern used when `obsidian-ingestion-state.json` was separated from `ingestion-state.json` in Phase 08. This is the proven precedent in this codebase.

**Phase:** KNOW-08

---

### PITFALL-8: KNOW-09 per-project agent_id routing creates memories never surfaced

**Feature:** KNOW-09 (per-project agent_id routing)
**What goes wrong:** If each project routes to its own `agent_id` (e.g., `agent_id: "epilogue"`, `agent_id: "alex"`), memories become fragmented across agent IDs. The session-start mem0 preload hook only preloads `agent_id: "claude"` and `agent_id: "shared"`. Project-specific memories under custom agent IDs will never be preloaded at session start. Loading all project agent IDs at session start would hit Gemini embedding quota — the `429 RESOURCE_EXHAUSTED` error is already occurring in failures.log.

**Consequences:** Project memories exist in mem0 but deliver zero value because they are never surfaced.

**Prevention:**
- Use `agent_id: "shared"` with `project` in metadata for all project content. Simple, immediately surfaced at session start, no quota risk.
- Defer per-project agent_id routing to v1.4 only if on-demand preload (`--project` flag on session hook) is implemented first.

**Phase:** KNOW-09

---

### PITFALL-9: KNOW-08 projects/ depth is 3+ levels with 341 markdown files

**Feature:** KNOW-08
**What goes wrong:** `projects/` contains 46 project directories with nested subdirectories (e.g., `projects/epilogue/meetings/`). A shallow `iterdir()` on `projects/` only finds project name directories, not the actual markdown files. A `rglob("*.md")` on `projects/` pulls all 341 files — safe for a nightly cron job, but must NEVER be called from an API route polling at 10s.

The mtime watermark logic from `obsidian-to-mem0.py` must work on per-file mtime (not per-directory mtime) because a directory's mtime only updates when direct children change, not grandchildren.

**Prevention:**
- Use `Path(PROJECTS_DIR).rglob("*.md")` in the nightly Python script only. 341 files is fine for cron.
- Do NOT expose a `/api/projects-ingest` endpoint. Keep ingestion in Python cron only; the API should read pre-computed state from the ingestion state file.
- The mtime watermark should track the latest file mtime seen across all successfully processed files, same as obsidian-to-mem0.py pattern.

**Phase:** KNOW-08

---

### PITFALL-10: FLOW-13 node-detail-panel already fetches heartbeat — second fetch needs AbortController

**Feature:** FLOW-13 (per-node activity drill-down)
**What goes wrong:** `node-detail-panel.tsx` already calls `/api/heartbeat?agent={nodeId}` in a `useEffect` on nodeId change with no cleanup. If FLOW-13 adds a second `useEffect` for activity events, both effects fire simultaneously on every node click. If the user clicks multiple nodes quickly, N in-flight fetches run with stale nodeId values that update state for the wrong node.

**Additionally:** The activity events data (`events: Event[]` filtered by `e.node === nodeId`) is already passed as a prop and sliced to 15 items. FLOW-13 most likely only needs to increase that limit or improve the display — it does NOT need a new fetch. Adding a second fetch introduces complexity for no gain.

**Prevention:**
- Add AbortController cleanup to the existing heartbeat useEffect: return `() => controller.abort()`.
- For activity events, use the existing prop — do not add a second fetch inside this component.
- If new failure event types need to surface in FLOW-13, add them to the events array at the API/data-fetching level in the parent, not with a new fetch in the panel component.

**Phase:** FLOW-13

---

## Minor Pitfalls

### PITFALL-11: failures.log disk_critical entries inflate failure rate metrics

**Feature:** SKILL-06
**What goes wrong:** `disk_critical` errors are not skill execution failures — they are infrastructure events. The most recent entries in failures.log (as of 2026-04-13) are entirely disk_critical events, not skill failures. Counting all log entries as skill failures will show false spikes tied to disk events.

**Prevention:** Filter by `error_type` allowlist in the route handler. For skill failure tracking, include only `memory_add_failed` and agent-execution error types. Document the allowlist explicitly in code. Consider surfacing `disk_critical` as a separate infrastructure health indicator in the heartbeat panel rather than mixed into skill metrics.

**Phase:** SKILL-06

---

### PITFALL-12: Vitest ESM mocks required for all new filesystem-reading routes

**Feature:** SKILL-06, SKILL-07
**What goes wrong:** Any new API route reading from the filesystem (failures.log, skill-sync-state.json) using `fs/promises` requires the established Vitest ESM mock pattern. Static imports cause mocks to not intercept correctly in Vitest 4.x with ESM. This pattern is documented in STATE.md but will be forgotten for new routes.

**Prevention:** Apply to all new route tests: `// @vitest-environment node` at top, `vi.mock('fs/promises')` before any import, then `await import('./route')` after the mock declaration.

**Phase:** Any phase adding new `/api/` routes for SKILL-06/07

---

### PITFALL-13: skill-contributions.jsonl has no usage events — wrong data source for SKILL-07/08

**Feature:** SKILL-07, SKILL-08
**What goes wrong:** The JSONL file contains only `action: "synced"` events (confirmed by inspection of the actual file). Zero `action: "used"` events exist. Building SKILL-07 (coverage gaps) or SKILL-08 (usage heatmap) from this JSONL produces only sync history, not usage frequency.

**Prevention:**
- Skill usage data lives in `~/.openclaw/skill-sync-state.json` under the `skill_usage` dict (key: skill name, value: last_used_timestamp).
- For v1.3, read usage from the state file. Display last-used timestamps.
- The JSONL is the correct source for contribution attribution (who added which skill) but not usage frequency.
- Real-time usage tracking requires instrumentation at the OpenClaw runtime level — defer to v1.4.

**Phase:** SKILL-07, SKILL-08 — understand this before designing the data model for either feature

---

## Phase-Specific Warnings Summary

| Feature | Pitfall | Mitigation |
|---------|---------|------------|
| FLOW-12 | Child node coordinates become parent-relative when parentId is set | Recalculate all offsets as `(child_x - group_x, child_y - group_y)` |
| FLOW-12 | Collapsed group leaves dangling edges to missing nodes | Use `hidden: true` on child nodes; do not remove them from array |
| FLOW-12 | GroupBoxNode needs explicit `width`/`height` on Node object (not only in data) | Add to node definition alongside `data.width`/`data.height` |
| FLOW-13 | Double-fetch if second useEffect added to panel | Activity events already in props; use AbortController on existing fetch |
| SKILL-06 | Multi-line tracebacks corrupt line-by-line JSON parser | Stateful parser anchored on timestamp regex, not line boundaries |
| SKILL-06 | disk_critical entries inflate skill failure count | Filter by error_type allowlist |
| SKILL-07 | skill-contributions.jsonl has no usage events | Use skill-sync-state.json skill_usage dict instead |
| SKILL-07 | iterdir accidentally recurses vault | Only call iterdir on CONFIG["master_dir"], never vault root |
| SKILL-08 | 0-column CSS grid when skill count is 0 | Guard before render; clamp column count to minimum 1 |
| SKILL-08 | 264-cell hover re-render at 10s poll | Local useState for hover; memoize cell array; no Framer Motion per cell |
| KNOW-08 | Read-modify-write race if sharing obsidian-ingestion-state.json | Use isolated projects-ingestion-state.json |
| KNOW-08 | rglob on projects/ acceptable in nightly script but not in API | Keep ingestion in Python cron only; API reads pre-computed state |
| KNOW-09 | Per-project agent_id creates memories never surfaced at session start | Use agent_id: "shared" + project metadata for v1.3 |

---

## Sources

- Direct inspection: `/Users/lcalderon/github/knowledge/scripts/obsidian-to-mem0.py` — confirmed 3 dedup guards, state structure, atomic write pattern, AGENT_ID="claude"
- Direct inspection: `/Users/lcalderon/github/knowledge/skill-contributions.jsonl` — confirmed only `action: "synced"` events exist (no "used" events)
- Direct inspection: `/Users/lcalderon/github/knowledge/logs/failures.log` (515 lines) — confirmed actual format: `timestamp | ERROR | {json-with-multiline-traceback}`, comment header line, disk_critical as dominant recent error type
- Direct inspection: `/Users/lcalderon/github/agent-kitchen/src/components/flow/react-flow-canvas.tsx` — confirmed GroupBoxNode structure (pointerEvents:none, absolute coordinates), dynamic agentBoxWidth, node/edge construction pattern
- Direct inspection: `/Users/lcalderon/github/agent-kitchen/src/components/flow/node-detail-panel.tsx` — confirmed existing heartbeat fetch with no AbortController cleanup
- Direct file count: `projects/` directory — 46 subdirs, 341 markdown files at 3+ levels depth
- Project decisions in `.planning/STATE.md` — vitest ESM mock pattern, obsidian state isolation precedent, heartbeat window constraints, mem0 write-only via POST
- @xyflow/react v12 parentId coordinate behavior: MEDIUM confidence (consistent with React Flow documented containment model and observed v11→v12 migration notes; not independently verified via Context7 for v12 exact behavior)
