---
phase: 16-per-node-activity-panel
plan: "01"
subsystem: flow-ui
tags:
  - flow
  - ui
  - activity
  - observability
  - tdd
dependency_graph:
  requires:
    - phase-15 (SkillHeatmap wired to NodeDetailPanel)
    - phase-07 (heartbeat fetch in NodeDetailPanel)
  provides:
    - node-keyword-map module (matchEventsForNode, isSparseNode)
    - AbortController cleanup on NodeDetailPanel heartbeat fetch
    - Keyword-based event fan-out for all canvas nodes
    - Sparse-data indicator for unmapped nodes
  affects:
    - src/components/flow/node-detail-panel.tsx
    - phase-17 canvas refactor (keyword map is a ready reference)
tech_stack:
  added: []
  patterns:
    - TDD red-green cycle (Vitest)
    - AbortController + cancelled flag for fetch-in-useEffect
    - Keyword map with alias + regex fan-out
key_files:
  created:
    - src/lib/node-keyword-map.ts
    - src/lib/__tests__/node-keyword-map.test.ts
    - src/components/flow/__tests__/node-detail-panel.test.tsx
  modified:
    - src/components/flow/node-detail-panel.tsx
decisions:
  - NodeEvent.type/severity widened to string in the module interface to avoid type incompatibility with the local Event interface in NodeDetailPanel (which predates the module and uses string)
  - Sparse nodes include qdrant/obsidian/knowledge-curator/tunnels/gitnexus/llmwiki/dev-tools/request/output — documented affordance, not a bug
  - AbortController + cancelled flag dual pattern used (React docs recommendation — handles both abort and GC races)
metrics:
  duration: "~7 minutes"
  completed: "2026-04-13"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 1
  tests_added: 17
---

# Phase 16 Plan 01: Per-Node Activity Panel (FLOW-13) Summary

**One-liner:** Keyword-map fan-out + AbortController cleanup + sparse indicator for NodeDetailPanel — closes FLOW-13 with 17 new tests.

## What Was Built

### Task 1: node-keyword-map module (TDD RED → GREEN)

New pure TypeScript module `src/lib/node-keyword-map.ts` with:

- **`NODE_KEYWORD_MAP`** — keyword + alias registry covering all canvas node IDs
- **`matchEventsForNode(nodeId, events)`** — filters events via exact match, alias match, or keyword regex match; preserves order; does not slice
- **`isSparseNode(nodeId)`** — returns true for nodes with no event instrumentation

10 unit tests, all passing. Zero React/DOM imports.

### Task 2: NodeDetailPanel updates (TDD RED → GREEN)

Modified `src/components/flow/node-detail-panel.tsx`:

1. **Event cap reduced**: `.slice(0, 15)` → `.slice(0, 10)` via `matchEventsForNode`
2. **Keyword routing**: replaced `events.filter(e => e.node === nodeId)` with `matchEventsForNode(nodeId ?? "", events)` — qdrant/obsidian/agent-* nodes now return non-empty lists when keyword-matching events exist
3. **AbortController**: created per-effect, `{ signal: controller.signal }` passed to fetch, `cancelled` flag guards all state setters, cleanup calls `controller.abort()`
4. **Sparse indicator**: `<p aria-label="limited-activity-data" className="text-xs italic text-slate-600">Limited activity data for this node type</p>` shown when `isSparseNode(nodeId)` and no events matched
5. **`data-testid="node-event"`**: added to event row div for test targeting
6. **SkillHeatmap block preserved** (cookbooks node — Phase 15)
7. **Props interface unchanged** — no call-site changes needed

7 component tests, all passing.

## Sparse Node List (Documented — FLOW-13 Criterion 4)

The following nodes have no event instrumentation in the current `/api/activity` API. When their event list is empty, the panel shows "Limited activity data for this node type":

| Node | Reason |
|------|--------|
| `qdrant` | No events routed; mem0 writes go through notebooks |
| `obsidian` | No events routed; curator writes go through knowledge-curator |
| `knowledge-curator` | Runs via cron, not API |
| `tunnels` | No events |
| `gitnexus` | No events |
| `llmwiki` | No events |
| `claude-code` | No events |
| `qwen-cli` | No events |
| `gemini-cli` | No events |
| `codex` | No events |
| `request` | No events (relay node) |
| `output` | No events (relay node) |

Nodes NOT in the sparse list (they have keyword routing — empty panel means no recent activity, not missing instrumentation): `agent-*`, `local-agents`, `cookbooks`, `notebooks`, `librarian`, `taskboard`, `apo`, `manager`, `gateways`.

## Final NODE_KEYWORD_MAP (Phase 17 / FLOW-14 Reference)

```typescript
{
  request:           { aliases: [],                       keywords: [] },
  gateways:          { aliases: ["gateway"],              keywords: [/gateway/i, /telegram/i, /discord/i] },
  manager:           { aliases: ["paperclip"],            keywords: [/paperclip/i, /orchestrator/i] },
  output:            { aliases: [],                       keywords: [] },
  "local-agents":    { aliases: ["agents"],               keywords: [/\bagent(s)?\b/i, /heartbeat/i, /chef/i] },
  "agent-alba":      { aliases: ["alba", "hermes"],       keywords: [/\balba\b/i, /hermes/i] },
  "agent-gwen":      { aliases: ["gwen"],                 keywords: [/\bgwen\b/i] },
  "agent-sophia":    { aliases: ["sophia"],               keywords: [/\bsophia\b/i] },
  "agent-maria":     { aliases: ["maria"],                keywords: [/\bmaria\b/i] },
  "agent-lucia":     { aliases: ["lucia"],                keywords: [/\blucia\b/i] },
  tunnels:           { aliases: ["cf-tunnel","tunnel"],   keywords: [/tunnel/i, /cloudflare/i] },
  taskboard:         { aliases: ["kanban","nerve"],        keywords: [/task ?board/i, /kanban/i, /nerve/i] },
  notebooks:         { aliases: ["mem0","memory"],        keywords: [/mem0/i, /\bmemory\b/i, /remember/i] },
  librarian:         { aliases: ["qmd"],                  keywords: [/\bqmd\b/i, /BM25/i, /keyword search/i] },
  qdrant:            { aliases: ["qdrant-cloud"],         keywords: [/qdrant/i, /vector (store|search|db)/i, /embedding/i] },
  cookbooks:         { aliases: ["skills","cookbook","skill"], keywords: [/\bskill(s)?\b/i, /cookbook/i, /APO/i, /proposal/i] },
  apo:               { aliases: ["agent-lightning","lightning"], keywords: [/\bAPO\b/i, /agent lightning/i, /proposal/i, /\bcycle\b/i] },
  gitnexus:          { aliases: [],                       keywords: [/gitnexus/i, /code graph/i] },
  llmwiki:           { aliases: ["wiki"],                 keywords: [/llm[ -]?wiki/i, /wiki/i] },
  "knowledge-curator": { aliases: ["curator","knowledge_curator"], keywords: [/curator/i, /knowledge-curator/i, /nightly (ingest|sync)/i] },
  obsidian:          { aliases: ["vault"],                keywords: [/obsidian/i, /vault/i, /journal/i] },
  "claude-code":     { aliases: [],                       keywords: [] },
  "qwen-cli":        { aliases: [],                       keywords: [] },
  "gemini-cli":      { aliases: [],                       keywords: [] },
  codex:             { aliases: [],                       keywords: [] },
}
```

## Props Interface: Unchanged

`NodeDetailPanelProps` is identical before and after this plan. No call-site changes required. Callers in `src/app/flow/page.tsx` are unaffected.

## Test Counts

| Test file | Tests added | Result |
|-----------|------------|--------|
| `src/lib/__tests__/node-keyword-map.test.ts` | 10 | All pass |
| `src/components/flow/__tests__/node-detail-panel.test.tsx` | 7 | All pass |
| **Total** | **17** | **17/17** |

Full vitest suite: 102 pass, 1 pre-existing failure (smoke.test.tsx SummaryBar — unrelated to this plan). Before this plan there were 6 failures; our changes fixed 5 of them (the RED tests became GREEN).

## Dependency Note: @testing-library/react

`@testing-library/react` was already in `package.json` devDependencies. The worktree uses a symlink to the main repo's `node_modules/` — no new packages were installed.

## GitNexus Impact Report

`NodeDetailPanel` callers (d=1):
- `src/app/flow/page.tsx` — passes props, no change needed
- `src/components/__tests__/skill-heatmap.test.tsx` — imports for context, no change needed

Risk level: LOW. Props unchanged; only internal implementation changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Widened NodeEvent interface types**
- **Found during:** Task 2, npm run build
- **Issue:** `NodeEvent.type` and `NodeEvent.severity` were narrow literal unions, incompatible with local `Event` interface in `node-detail-panel.tsx` which uses `string`
- **Fix:** Widened both fields to `string` in `node-keyword-map.ts` — matching logic does not depend on the narrow types
- **Files modified:** `src/lib/node-keyword-map.ts`
- **Commit:** e1711a6

## Known Stubs

None. All event routing is keyword-based and functional. Sparse nodes display a documented indicator.

## Threat Flags

None. Changes are client-only. No new network endpoints or trust boundaries introduced. T-16-02 (AbortController leak) directly mitigated by Task 2 implementation.

## Self-Check: PASSED

- [x] `src/lib/node-keyword-map.ts` — EXISTS
- [x] `src/lib/__tests__/node-keyword-map.test.ts` — EXISTS
- [x] `src/components/flow/node-detail-panel.tsx` — MODIFIED (contains AbortController, matchEventsForNode, isSparseNode)
- [x] `src/components/flow/__tests__/node-detail-panel.test.tsx` — EXISTS
- [x] Commits: 743d2ed (RED1), 89bacde (GREEN1), eb32034 (RED2), e1711a6 (GREEN2)
- [x] 17 new tests, all pass
- [x] npm run build succeeds
- [x] Props interface unchanged
