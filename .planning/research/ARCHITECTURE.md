# Architecture Patterns — v1.3 Integration Analysis

**Project:** agent-kitchen
**Milestone:** v1.3 Advanced Observability + Knowledge Depth
**Researched:** 2026-04-13
**Overall Confidence:** HIGH (all findings from direct codebase inspection)

---

## Existing Architecture Baseline

### Component Inventory

| File | Role | Key Constraint |
|------|------|---------------|
| `src/app/api/skills/route.ts` | Reads skill dir + skill-contributions.jsonl | Returns global stats only, no per-skill time series |
| `src/app/api/activity/route.ts` | Aggregates events from 4 sources | Max 20 events global, last 2h window, maps to ~5 node IDs |
| `src/components/flow/react-flow-canvas.tsx` | Renders 21+ nodes + edges via useMemo | GroupBoxNode uses `pointerEvents: none`, not React Flow parent/child |
| `src/components/flow/node-detail-panel.tsx` | Side panel on node click | Already filters events by `e.node === nodeId` from global feed |
| `src/app/flow/page.tsx` | Orchestrates data fetching, passes to canvas | Passes `activityData.events` (global) to NodeDetailPanel |
| `~/github/knowledge/scripts/obsidian-to-mem0.py` | Journals → mem0 sync | Hardcodes `JOURNALS_DIR` and `AGENT_ID = "claude"`, state keyed per source |
| `~/github/knowledge/scripts/skill-sync.py` | Syncs skills, logs to skill-contributions.jsonl | Logs `contributed` and `pruned` actions only — NO failure events |

### Data Flow (Current)

```
skill-sync.py → skill-contributions.jsonl → /api/skills → ReactFlowCanvas (skillsStats)
                                           → /api/activity → NodeDetailPanel (events[])

APO cron log → /api/activity → events[]
HEARTBEAT.md → /api/activity → events[]
APO proposals → /api/activity → events[]

obsidian-to-mem0.py ← JOURNALS_DIR only
  state key: "obsidian-journals"
  agent_id: "claude" (hardcoded)
```

### Activity Node Mapping Gap (Critical for FLOW-13)

The activity API keyword-matches log lines to node IDs. Current coverage:

| Node ID in canvas | Mapped in /api/activity |
|-------------------|------------------------|
| `cookbooks` | Yes (PROPOSAL, skill contributions) |
| `agents` | Yes (ERROR/FAIL, heartbeats) |
| `librarian` | Yes (audit, scan, QMD, search) |
| `notebooks` | Yes (mem0, memory, remember) |
| `taskboard` | Yes (Starting, Complete, cycle) |
| `qdrant`, `obsidian`, `gitnexus`, `llmwiki`, `knowledge-curator` | No mapping |
| `agent-alba`, `agent-gwen`, `agent-sophia`, etc. | No mapping |

---

## Feature Integration Analysis

### FLOW-12: Collapsible Node Groups

**Integration point:** `react-flow-canvas.tsx` only — internal refactor, no API changes.

**Current state:** `GroupBoxNode` is a visual backdrop div (`pointerEvents: none`, `selectable: false`, `zIndex: -1`). It does not use React Flow's built-in parent/child node system. Groups cannot be clicked or toggled.

**What must change:**

1. Add `collapsedGroups: Set<string>` state to `ReactFlowCanvas` (or lifted to `flow/page.tsx` if persistence across tab navigation is wanted).
2. Make `GroupBoxNode` clickable — remove `pointerEvents: none`, add click handler, pass a `collapsed` bool via `data`.
3. Gate node visibility in the `useMemo` nodes array: when a group is collapsed, filter out its child nodes and inject a single summary node in their place.
4. Gate edge visibility in the `useMemo` edges array: remove edges whose source or target is inside a collapsed group; add a single aggregate edge from the summary node boundary.

**Groups to make collapsible:**
- `group-agents` (children: all `agent-*` nodes + `local-agents`)
- `group-devtools` (children: `claude-code`, `qwen-cli`, `gemini-cli`, `codex`)

**Risk note:** The node list is computed in a single `useMemo` with 8+ dependencies. Adding collapse state adds a new dependency and new filter logic. The edge generation also references `allAgentIds` (a derived memo) which must be gated by collapse state. Test collapse/expand cycle in the `useMemo` output before wiring the UI — missing edge cleanup causes React Flow to render floating endpoints.

**New/modified components:**
- MODIFY: `src/components/flow/react-flow-canvas.tsx`
- No new routes, no new components required

---

### FLOW-13: Per-Node Activity Panel (Last 10 Events)

**Integration points:** `/api/activity/route.ts` (extend), `node-detail-panel.tsx` (extend).

**Current state:** `NodeDetailPanel` already calls `events.filter(e => e.node === nodeId)` from a parent-passed global feed. The wiring exists. The data fidelity problems are: (a) most canvas node IDs have no events mapped to them, and (b) the global feed is capped at 20 events total across all nodes with a 2-hour window.

**What must change:**

1. **Extend `/api/activity`** to accept `?node=X` query param. When `node` is provided:
   - Remove the 2-hour window restriction (or widen to 24h)
   - Return up to 10 events matching that node ID
   - Expand the node mapping in the log parser to cover missing nodes (see gap table above):
     - `obsidian` — match "obsidian", "vault", "journal"
     - `knowledge-curator` — match "curator", "pipeline", "step"
     - `qdrant` — match "qdrant", "vector", "embed"
     - Per-agent nodes — match heartbeat events by agent name

2. **Refactor `NodeDetailPanel`** to self-fetch on `nodeId` change: `fetch("/api/activity?node=" + nodeId)`. This avoids contaminating the global 20-event feed with per-node queries and keeps the panel self-contained.

3. **`flow/page.tsx`**: No structural change needed once NodeDetailPanel self-fetches.

**New/modified components:**
- MODIFY: `src/app/api/activity/route.ts` — add `?node` param, widen time window, expand node mapping
- MODIFY: `src/components/flow/node-detail-panel.tsx` — self-fetch per node instead of consuming parent events

---

### SKILL-07: Coverage Gaps Report (Zero-Usage Skills, 30 Days)

**Integration point:** `/api/skills/route.ts` (extend with new output field).

**Current state:** `skill-sync-state.json` already contains `skill_usage: { skillName -> last_used_timestamp }`. The route already reads this file for `lastPruned` and `lastUpdated`. The data needed for coverage gap detection is present.

**What must change:**

In the `/api/skills` GET handler, after reading `skill-sync-state.json`, cross-reference all skill directory names against `skill_usage` timestamps:

```
const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
coverageGaps = allSkillNames.filter(name =>
  !state.skill_usage[name] ||
  new Date(state.skill_usage[name]).getTime() < thirtyDaysAgo
)
```

Return `coverageGaps: string[]` and `coverageGapCount: number` in the response JSON. Surface in the `cookbooks` node stats.

**New/modified components:**
- MODIFY: `src/app/api/skills/route.ts` — read `skill_usage`, compute gaps, add to response
- MODIFY: `src/components/flow/react-flow-canvas.tsx` nodeStats for `cookbooks` — add gap count

---

### SKILL-06: Failure Rate Tracking

**Critical finding: the data source does not exist yet.**

`skill-contributions.jsonl` records only `contributed` and `pruned` actions — confirmed by reading `skill-sync.py`, which calls `append_jsonl_event()` exclusively with those action types. No failure events are logged anywhere in the current pipeline.

**The data path must be built first.**

Extend `skill-sync.py` to call `append_jsonl_event(skill, "failed", contributor, metadata)` when a sync operation fails for a specific skill (copy error, validation error, etc.). This extends the existing JSONL contract without new files or new log sources.

Do not write the API extension until failure events are confirmed appearing in the JSONL. Writing the route first will silently return zero failure rate — correct-looking but wrong.

**After the data path exists:**

Extend `/api/skills` to count `action === "failed"` per skill and globally. Return `failureCount: number` and optionally `failuresBySkill: Record<string, number>` in the response.

**New/modified components:**
- MODIFY: `~/github/knowledge/scripts/skill-sync.py` — add failure event logging (prerequisite, must come first)
- MODIFY: `src/app/api/skills/route.ts` — parse failure events, add to response

---

### SKILL-08: Per-Skill Usage Heatmap

**Critical finding: "usage" and "contribution" are different data, and only contribution data exists.**

The JSONL contains timestamped contribution and prune events. If "usage" means "how often was this skill invoked by an agent," that telemetry does not exist. If it means "how often was it contributed or pruned," the data is present.

**Two scopes:**

- **Scope A — Contribution heatmap (achievable now):** Group JSONL events by `(skill, week)` for contributions and prunes. Shows skill modification activity, not invocation frequency.
- **Scope B — Invocation heatmap (requires new telemetry):** Requires agents to log skill invocations to a new JSONL. No such logging exists.

**Recommendation:** Build Scope A. Document the scope clearly in the UI label ("skill contribution activity" not "skill usage"). Flag Scope B as a v1.4 item.

**Dependency:** SKILL-06 should be complete first because failure events should be included in the time-series bucketing, and the expanded JSONL vocabulary confirms the data path is reliable.

**New/modified components:**
- NEW: `src/components/skills/skill-heatmap.tsx` — Recharts grid or Calendar chart
- MODIFY: `src/app/api/skills/route.ts` — add `contributionsBySkill: Record<string, {week: string, count: number}[]>`

---

### KNOW-08: `projects/` Subdirectory Ingestion

**Integration point:** `~/github/knowledge/scripts/obsidian-to-mem0.py` — extend with a second pass.

**Vault structure confirmed:** `~/github/knowledge/projects/` contains 46 project directories (e.g., `alex/`, `epiloguecapital/`, `agent-kitchen/`). Each project has subdirectories like `meetings/` containing timestamped markdown files.

**Current state:** Script walks `JOURNALS_DIR = VAULT / "journals"` only. Uses three dedup guards (content hash, mtime watermark, origin tag). State is stored in `obsidian-ingestion-state.json` using `state.setdefault("obsidian-journals", {...})`.

**What must change:**

Add `sync_projects(state)` function that walks `VAULT / "projects"` recursively. The `state.setdefault("obsidian-journals", ...)` pattern scales directly to per-project keys with no state file format change:

```python
PROJECTS_DIR = VAULT / "projects"

def sync_projects(state: dict):
    for project_dir in sorted(PROJECTS_DIR.iterdir()):
        if not project_dir.is_dir():
            continue
        project_name = project_dir.name
        state_key = f"project-{project_name}"
        proj_state = state.setdefault(state_key, {
            "last_mtime": None,
            "processed_hashes": [],
        })
        for md_file in sorted(project_dir.rglob("*.md")):
            # Apply same three dedup guards as journals pass
            ...
```

**New/modified components:**
- MODIFY: `~/github/knowledge/scripts/obsidian-to-mem0.py` — add `sync_projects()`, call from `main()`

---

### KNOW-09: Per-Project `agent_id` Routing

**Integration point:** Same script edit as KNOW-08 — implement together in one change.

**Current state:** `AGENT_ID = "claude"` is a module-level constant. All memories land under the `claude` agent namespace regardless of source.

**Approach:** Derive `agent_id` from the project directory name in `sync_projects()`. The mem0 `/memory/add` call passes `agent_id` as a payload field — no API change required, only the caller must pass the right value.

```python
agent_id = project_name  # e.g., "alex", "epiloguecapital", "agent-kitchen"
```

Refactor `post_to_mem0()` to accept `agent_id` as a parameter rather than using the module global.

**Validation gate:** Confirm the mem0 instance accepts arbitrary agent_ids (it does — mem0 creates new agent namespaces on first use). The existing `source="obsidian-sync"` origin tag prevents re-ingestion loops regardless of agent_id.

**Side effect to flag:** Routing 46 project dirs to 46 agent namespaces in mem0 will create 46 new agent_id entries. Confirm the session-start preload hook does not attempt to load all agent namespaces on startup (it uses specific agent_ids via env var, so this is safe).

**New/modified components:**
- MODIFY: `~/github/knowledge/scripts/obsidian-to-mem0.py` (same file as KNOW-08 — one combined edit)

---

## Component Summary Table

| Feature | New Components | Modified Components | New API Routes |
|---------|---------------|--------------------|----|
| FLOW-12 | None | `react-flow-canvas.tsx` | None |
| FLOW-13 | None | `/api/activity/route.ts`, `node-detail-panel.tsx` | None |
| SKILL-07 | None | `/api/skills/route.ts`, `react-flow-canvas.tsx` | None |
| SKILL-06 | None | `skill-sync.py` (prereq), `/api/skills/route.ts` | None |
| SKILL-08 | `components/skills/skill-heatmap.tsx` | `/api/skills/route.ts` | None |
| KNOW-08 | None | `obsidian-to-mem0.py` | None |
| KNOW-09 | None | `obsidian-to-mem0.py` (same edit as KNOW-08) | None |

**Key observation:** Zero new API routes required across all 7 features. Every feature extends existing routes or scripts.

---

## Recommended Build Order

### Phase 1 — KNOW-08 + KNOW-09 (Python-only, no frontend risk)

Build together in a single script edit. Self-contained, no frontend changes, no API changes. Validates the per-project `agent_id` routing pattern before any UI depends on it. Dedup guards are already battle-tested from v1.2.

**Dependency:** None.

### Phase 2 — SKILL-07 (Data source exists, straightforward API extension)

`skill_usage` map already exists in `skill-sync-state.json`. Extends `/api/skills` response with a gap list. Low risk of breaking the existing `skillsStats` consumer in the canvas.

**Dependency:** None. Build after KNOW phases to keep Python and frontend work separated.

### Phase 3 — SKILL-06 (Requires new Python data path first)

Extend `skill-sync.py` to emit `failed` events. Commit and let it run. Confirm failure events appear in `skill-contributions.jsonl`. Then extend `/api/skills`. The Python prerequisite and the API extension should be separate commits so the data path can be verified independently.

**Dependency:** `skill-sync.py` change must be running and producing events before API work starts.

### Phase 4 — SKILL-08 (Heatmap, depends on SKILL-06 vocabulary)

Build Scope A (contribution heatmap). Requires SKILL-06 done first so failure events are included in the time-series buckets. New `skill-heatmap.tsx` component using Recharts.

**Dependency:** SKILL-06 complete.

### Phase 5 — FLOW-13 (API + panel, independent of skills track)

Extend `/api/activity` with `?node` filter, widen time window, expand node mapping. Refactor `NodeDetailPanel` to self-fetch. Can run in parallel with the skills track if desired, but sequentially is safer.

**Dependency:** None from skills track.

### Phase 6 — FLOW-12 (Hardest UI change, save for last)

Modify GroupBoxNode to be clickable, add collapse state, gate node/edge arrays. This is the riskiest change — touches the core `useMemo` logic for the entire canvas. Build last when all other features are validated and the canvas code is stable.

**Dependency:** FLOW-13 must be complete so the panel refactor is settled before adding collapse state to the same canvas.

---

## Critical Warnings

### SKILL-06: Data Path Does Not Exist
Do not write the failure rate API extension until `skill-sync.py` is actively logging `failed` events. Writing the route first silently returns zero failure rate — looks correct but is not.

### SKILL-08: Scope Ambiguity
"Usage heatmap" likely implies invocation frequency, but no invocation telemetry exists. Build the contribution heatmap (Scope A) and label it accurately in the UI. Flag invocation telemetry as a v1.4 item.

### FLOW-13: Activity Coverage is Sparse
After extending `/api/activity?node=X`, most canvas nodes will show sparse or empty panels because the log only produces events for ~5 node types. This is expected. Do not try to fake events — document which nodes have live activity vs. which are observation-only.

### FLOW-12: Edge Orphan Risk
When collapsing a group, edges from collapsed agent nodes to `notebooks`, `librarian`, `cookbooks` must be removed or replaced with a group-level edge. Missing this causes React Flow to render floating edge endpoints with no source node. Test the collapse/expand cycle in the `useMemo` output in isolation before wiring the click handler.

### KNOW-09: mem0 Namespace Proliferation
46 new `agent_id` namespaces will be created in mem0. Confirm the session-start preload hook uses specific agent_ids from env vars (it does) and will not attempt to load all 46 namespaces on startup.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| FLOW-12 GroupBoxNode approach | HIGH | Direct code inspection of canvas, GroupBoxNode props confirmed |
| FLOW-13 activity gap | HIGH | Node mapping table confirmed by reading activity route in full |
| SKILL-07 data source | HIGH | `skill_usage` field confirmed in state file reading pattern |
| SKILL-06 missing data path | HIGH | `append_jsonl_event()` call sites in skill-sync.py confirm no "failed" action |
| SKILL-08 scope | HIGH | JSONL schema confirmed; invocation logs confirmed absent |
| KNOW-08 project structure | HIGH | 46 dirs confirmed, sample files inspected, state file pattern confirmed |
| KNOW-09 agent_id routing | MEDIUM | mem0 namespace creation on first use expected to work; not tested with 46 agents |

---

## Sources

- Direct code reading: `src/app/api/skills/route.ts`, `src/app/api/activity/route.ts`, `src/components/flow/react-flow-canvas.tsx`, `src/components/flow/node-detail-panel.tsx`, `src/app/flow/page.tsx`
- Direct code reading: `~/github/knowledge/scripts/obsidian-to-mem0.py`, `~/github/knowledge/scripts/skill-sync.py`
- Vault structure inspection: `~/github/knowledge/projects/` (46 dirs confirmed, `alex/meetings/*.md` sampled)
- Constants: `src/lib/constants.ts`
- Project context: `.planning/PROJECT.md` (v1.3 target features, existing decisions)
