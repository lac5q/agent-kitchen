# Phase 10: Flow Diagram UX — Research

**Researched:** 2026-04-12
**Domain:** @xyflow/react v12 layout, fitView, edge routing
**Confidence:** HIGH

---

## Summary

The flow diagram is "messy and too large" due to three root causes found by direct code inspection — not hypothesis. First, all 40+ edges have `animated: true` with no `type` specified, defaulting to bezier curves. Simultaneous flowing dotted bezier arcs create visual chaos as they arc freely across one another. Second, `fitView` is already present but `fitViewOptions` has no `duration`, so on initial render fitView may fire before the container has settled its dimensions, producing a jarring unzoomed view. Third, node positions are spread across a 760×900px canvas with low density — particularly row 1 has a 340px gap between gateways (x=180) and manager (x=520).

The fix is surgical: change edge `type` to `smoothstep` across all edges (routes along grid-aligned axes, eliminates crossing arcs), suppress animation except on highlighted-node edges, compact node positions for rows 1 and 4, and add `duration: 200` to `fitViewOptions`. No layout library is needed.

**Primary recommendation:** Switching all edges from default (bezier) to `smoothstep` is the single highest-impact change. It eliminates the arc-crossing problem and cuts visual noise by ~80% before touching any positions.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FLOW-10 | Flow diagram auto-fits the viewport on initial load without manual zoom | fitView already set; adding duration + adjusting minZoom to 0.3 ensures it resolves cleanly on initial render |
| FLOW-11 | Flow diagram visually clean — nodes well-spaced, edges minimal crossing, readable at default zoom | Edge type smoothstep eliminates crossing; selective animation reduces noise; position compaction improves density |
</phase_requirements>

---

## Current State Audit (from direct code inspection)

### Layout Mechanism
**Hardcoded positions.** Every node has an explicit `x/y` coordinate. No auto-layout library is in use. [VERIFIED: react-flow-canvas.tsx lines 271–285]

Layout structure (5 rows):
- Row 1 (y=100): request (x=20), gateways (x=180), [gap 340px], manager (x=520), output (x=680)
- Row 2 (y=280): 5 remote agents (x=100..580 @ 120px spacing) + local-agents
- Row 3 (y=440): tunnels (x=20), taskboard (x=160), notebooks (x=380), librarian (x=520), qdrant (x=660)
- Row 4 (y=580): cookbooks (x=20), apo (x=150), gitnexus (x=280), llmwiki (x=410), knowledge-curator (x=540), obsidian (x=670)
- Row 5 (y=740): 4 dev tool nodes (x=20..440 @ 140px spacing)

**Total canvas spread:** ~760px wide × 820px tall (before dev tools extend to y=740+80=820)

### Current fitView Configuration
```tsx
// react-flow-canvas.tsx lines 421-429
<ReactFlow
  fitView
  fitViewOptions={{ padding: 0.15 }}
  minZoom={0.3}
  maxZoom={2}
  ...
>
```
`fitView` is **already set**. [VERIFIED: react-flow-canvas.tsx line 426]

**Problem:** No `duration` specified in fitViewOptions. On initial render in Next.js, the ReactFlow container (height: 900px fixed) may have layout not yet fully settled when fitView fires. Adding `duration: 200` gives the DOM time to resolve and makes the fit animation visible/smooth rather than an invisible snap.

### Container Dimensions
```tsx
// react-flow-canvas.tsx line 420
<div style={{ width: "100%", height: 900, ... }}>
```
Fixed 900px height. On 1080p laptop screens with nav bar + page header + activity feed, this pushes below the fold. [VERIFIED: react-flow-canvas.tsx line 420]

### Edge Configuration
```tsx
// Example: all 40+ edges look like this
{ id: "req-gw", source: "request", target: "gateways", animated: true,
  style: { stroke: EDGE_COLORS.request, strokeWidth: 2 } }
```
- No `type` specified → defaults to `"default"` (bezier)
- All have `animated: true` → all 40+ edges have flowing dots simultaneously
- `getSmoothStepPath` IS exported and `smoothstep` IS a built-in edge type in this version [VERIFIED: node_modules/@xyflow/react/dist/esm/index.js]

### Edge Fan-Out (primary crossing sources)
1. **Agent edges:** Each of 5 key remote agents emits 4 edges (to manager y=100, notebooks y=440, librarian y=440, cookbooks y=580). 5×4 = 20 bezier arcs spanning 3 rows, all crossing.
2. **local-agents:** 6 edges fanning out in all directions (apo, gitnexus, llmwiki, notebooks, librarian, cookbooks)
3. **knowledge-curator:** 5 edges (gitnexus, llmwiki, notebooks, librarian, obsidian) — all flowing to neighbors in same row (y=580) and y=440, creating tight short arcs
4. **Skill sync dashed cyan edges:** cookbooks→gateways crosses back UP from y=580 to y=100, traversing 3 rows diagonally

### Node Width
Nodes render at width 90px (the `FlowNode` wrapper div). The icon/border box is 80×80px. [VERIFIED: react-flow-canvas.tsx lines 63, 68]

---

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| @xyflow/react | 12.10.2 | Flow diagram rendering | Already in use — no swap |

### Supporting (NOT needed — avoid adding dependencies)
| Instead of | Decision | Reason |
|------------|----------|--------|
| dagre | Manual position adjustment | 25 nodes in fixed topology; dagre adds a 60KB dependency for no benefit when positions are known |
| elkjs | Manual position adjustment | Same reasoning — overkill for a static 5-row layout |

**Verified available built-in edge types in @xyflow/react v12:** `default` (bezier), `smoothstep`, `step`, `straight` [VERIFIED: node_modules/@xyflow/react/dist/esm/index.js — `builtinEdgeTypes` object]

---

## Architecture Patterns

### Recommended Changes (ordered by impact)

#### Change 1: Switch All Edges to `smoothstep` Type (HIGHEST IMPACT)
**What:** Add `type: "smoothstep"` to every edge definition.

Smoothstep edges route along horizontal and vertical axes with a single rounded bend. This eliminates freely-arcing bezier curves that cross one another. [VERIFIED: getSmoothStepPath available, smoothstep in builtinEdgeTypes]

```tsx
// Source: node_modules/@xyflow/react/dist/esm/index.js — builtinEdgeTypes
// Before (all edges):
{ id: "req-gw", source: "request", target: "gateways",
  animated: true, style: { stroke: EDGE_COLORS.request, strokeWidth: 2 } }

// After:
{ id: "req-gw", source: "request", target: "gateways",
  type: "smoothstep",
  animated: true, style: { stroke: EDGE_COLORS.request, strokeWidth: 2 } }
```

Apply to all edges in `base`, `agentEdges`, `extraEdges`, `skillSyncEdges` arrays.

#### Change 2: Selective Animation (HIGH IMPACT, LOW RISK)
**What:** Only animate edges that connect to the `highlightedNode`. Make all others `animated: false`.

40+ simultaneously-animated flowing edges = visual noise. Most should be static lines showing topology; animation should indicate active data flow.

```tsx
// Pattern to apply in the useMemo that builds edges:
// Pass highlightedNode into edge construction
const isHighlighted = (id: string) =>
  highlightedNode === id || highlightedNode === null; // animate all if nothing selected

// Then per edge:
{ id: "req-gw", source: "request", target: "gateways",
  type: "smoothstep",
  animated: highlightedNode ? (highlightedNode === "request" || highlightedNode === "gateways") : true,
  style: { stroke: EDGE_COLORS.request, strokeWidth: 2 } }
```

**Simpler alternative** (recommended for Phase 10 — less code churn): reduce animation to only "request flow" edges (amber), keep knowledge/memory/APO edges as static lines. This requires changing `animated: true` → `animated: false` on ~30 of 40 edges.

#### Change 3: Add `duration` to `fitViewOptions` (FLOW-10 FIX)
**What:** Add `duration: 200` so fitView runs as an animated transition on initial render.

```tsx
// react-flow-canvas.tsx line 427
fitViewOptions={{ padding: 0.2, duration: 200 }}
```

Also increase padding from 0.15 to 0.2 to give nodes more breathing room within the viewport.

#### Change 4: Compact Node Positions (MEDIUM IMPACT)
**Problem spots:**
- Row 1 gap: gateways at x=180, manager at x=520 → 340px gap with nothing in between. Tighten manager to x=380, output to x=520.
- Row 4: obsidian at x=670 is wide right; knowledge-curator at x=540. Gap works but makes the row wide. Consider reducing row 4 x-spacing from 130px to 110px.
- Row 3 gap: notebooks at x=380, librarian at x=520 — 140px gap, taskboard at x=160 leaves 220px unused. Tighten taskboard to x=300, notebooks to x=430.

**Revised row 1 positions:**
```tsx
{ id: "request",  position: { x: 20,  y: 100 } }  // unchanged
{ id: "gateways", position: { x: 160, y: 100 } }  // was 180 → small tighten
{ id: "manager",  position: { x: 380, y: 100 } }  // was 520 → 140px closer
{ id: "output",   position: { x: 530, y: 100 } }  // was 680 → follows manager
```

This reduces total canvas width from ~760px to ~620px, allowing fitView to show nodes larger at default zoom.

#### Change 5: Reduce Container Height (OPTIONAL — addresses "too large for screen")
```tsx
// react-flow-canvas.tsx line 420
// Before:
<div style={{ width: "100%", height: 900, ... }}>

// After (responsive):
<div style={{ width: "100%", height: "min(900px, calc(100vh - 220px))", ... }}>
```

220px accounts for: nav (60px) + page header (60px) + activity feed (100px). This prevents the canvas from pushing below the fold on 1080p screens.

### Anti-Patterns to Avoid
- **Adding dagre/elkjs:** Introduces a dependency for a layout problem that manual coordinates solve better with full visual control.
- **Changing edge colors or the legend:** The color system is established (amber=request, green=knowledge, blue=memory, purple=APO, cyan=skill). Don't touch it.
- **Removing animations entirely:** Some animation is important for a "live system" feel. Keep amber request-flow edges animated.
- **Recursive readdir on vault:** Unrelated to this phase but a hard constraint — not applicable here.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Edge routing to reduce crossings | Custom SVG path calculator | `type: "smoothstep"` built-in |
| Fit-to-viewport on init | useEffect + manual viewport calculation | `fitView` prop + `fitViewOptions.duration` |
| Auto-layout | dagre integration | Manual position constants (layout is static) |

---

## Common Pitfalls

### Pitfall 1: fitView Fires Before Container Dimensions Are Resolved
**What goes wrong:** ReactFlow calls fitView during mount, but the parent container height is specified as `height: 900` (number). In SSR/hydration environments (Next.js 16), the DOM may not have finalized layout.
**Why it happens:** fitView uses the container's bounding rect. If it fires before paint, it gets 0 or stale dimensions.
**How to avoid:** Add `duration: 200` to fitViewOptions. The animated fit runs post-paint and resolves correctly.
**Warning signs:** Diagram appears at 1:1 zoom (not fitted) on initial load, then snaps when user interacts.

### Pitfall 2: smoothstep Edges With Same-Row Sources and Targets Create Tight Loops
**What goes wrong:** knowledge-curator (x=540, y=580) → gitnexus (x=280, y=580) is a same-row edge going left. Smoothstep will route it as a U-shape: down, left, up. This can look odd.
**Why it happens:** Smoothstep routes via orthogonal paths; same-Y source/target forces a detour.
**How to avoid:** For same-row edges (curator→gitnexus, curator→llmwiki, wiki→librarian), keep `type: "default"` (bezier) or use `type: "straight"`. Only apply smoothstep to cross-row edges.
**Warning signs:** Edges forming square U-shapes in row 4.

### Pitfall 3: Agent Edges Still Cross Even With smoothstep
**What goes wrong:** 5 agents at y=280 each connect to notebooks (y=440), librarian (y=440), cookbooks (y=580). With smoothstep, they route vertically — but 5 agents emitting edges to the same 3 targets will still produce parallel lines that visually cluster.
**Why it happens:** Smoothstep reduces crossing arcs but parallel lines to the same target remain.
**How to avoid:** This is acceptable — parallel lines are much cleaner than crossing arcs. No additional fix needed beyond the edge type change. If it bothers: remove agent→cookbooks and agent→librarian edges (these are implied by the knowledge-curator flows) and only keep agent→notebooks and agent→manager.

### Pitfall 4: `animated: true` on dashed edges looks wrong
**What goes wrong:** The skill-sync dashed cyan edges have `animated: false` (correct). If accidentally changed to `animated: true`, the dash animation on the dashed stroke creates an ugly fast-moving pattern.
**How to avoid:** Keep `animated: false` on the dashed cyan skill sync edges. Never set both `animated: true` and `strokeDasharray`.

---

## Build Order and Risk Assessment

| Step | Change | Risk | Time |
|------|--------|------|------|
| 1 | Add `type: "smoothstep"` to all cross-row edges | LOW — built-in type, no code change to nodes | 5 min |
| 2 | Set `animated: false` on knowledge/memory/APO edges (keep amber animated) | LOW — visual only | 5 min |
| 3 | Add `duration: 200` to fitViewOptions, increase padding to 0.2 | LOW — one line | 2 min |
| 4 | Compact row 1 node positions | LOW-MEDIUM — needs visual verification | 10 min |
| 5 | Make container height responsive (`min(900px, ...)`) | LOW | 2 min |

**Total estimated effort:** 25-30 min implementation + build verification.

**Build gate:** `npm run build` must pass with 0 TypeScript errors before `npm start --port 3002`.

---

## Specific Nodes/Edges Causing Most Visual Noise (ranked)

1. **Agent rows → memory/knowledge targets (20 edges):** 5 agents × 4 edges each, all animated bezier, all crossing as they converge on notebooks/librarian/cookbooks. **Fix: smoothstep + reduce to 2 edges per agent (drop agent→cookbooks, agent→librarian).**
2. **knowledge-curator (5 edges):** Fans out to gitnexus, llmwiki, notebooks, librarian, obsidian. Most targets are in the same row or one row up — short bezier arcs that arc through neighbors. **Fix: smoothstep for vertical targets, straight for same-row.**
3. **cookbooks→gateways skill sync (dashed cyan):** Crosses 3 rows upward diagonally (y=580 → y=100). Hard to route cleanly. **Fix: smoothstep makes this an orthogonal L-shape; acceptable.**
4. **local-agents (6 edges):** Highest fan-out single node — reaches 5 different targets across 3 rows. **Fix: smoothstep resolves most crossings here.**

---

## Code Examples

### Full fitViewOptions Fix
```tsx
// Source: react-flow-canvas.tsx — replace lines 427
fitViewOptions={{ padding: 0.2, duration: 200 }}
```

### Edge Type Pattern (cross-row edges)
```tsx
// Source: verified from @xyflow/react v12.10.2 builtinEdgeTypes
{ id: "req-gw", source: "request", target: "gateways",
  type: "smoothstep",
  animated: true,  // keep amber request flow animated
  style: { stroke: EDGE_COLORS.request, strokeWidth: 2 } }

// Knowledge/memory edges — smoothstep but NOT animated
{ id: "mem-qdr", source: "notebooks", target: "qdrant",
  type: "smoothstep",
  animated: false,  // static line — topology indicator, not live flow
  style: { stroke: EDGE_COLORS.memory, strokeWidth: 1.5 } }
```

### Same-Row Edge Exception (keep bezier/straight)
```tsx
// Source: analysis of row 4 node positions
// curator (x=540,y=580) → gitnexus (x=280,y=580): same row, going left
{ id: "curator-gnx", source: "knowledge-curator", target: "gitnexus",
  type: "straight",  // NOT smoothstep — avoids U-shape on same-row targets
  animated: false,
  style: { stroke: EDGE_COLORS.knowledge, strokeWidth: 1.5 } }
```

### Responsive Container Height
```tsx
// react-flow-canvas.tsx line 420
<div style={{
  width: "100%",
  height: "min(900px, calc(100vh - 220px))",
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid #1e293b"
}}>
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| All edges animated bezier | smoothstep + selective animation | Eliminates arc crossing; reduces motion noise |
| No edge type specified (uses default) | Explicit `type: "smoothstep"` | Orthogonal routing, readable at any zoom |

---

## Open Questions

1. **Should agent→cookbooks and agent→librarian edges be removed?**
   - What we know: These 10 edges are the highest-crossing group. The knowledge-curator→cookbooks/librarian edges already represent this flow implicitly.
   - What's unclear: Whether Luis wants agents visibly connected to cookbooks/library in the diagram for conceptual accuracy.
   - Recommendation: Keep them for Phase 10 (just change type); defer removal to a "simplify edges" future pass.

2. **Should `animated: false` be the new default or only on non-request edges?**
   - Recommendation: Keep amber (request) and APO edges animated; set all knowledge/memory edges to static. This preserves the "live" feel for user-initiated flows while cleaning up background topology lines.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — all changes are to existing TypeScript/React code with no new runtime deps).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| FLOW-10 | fitView fires on initial render | Visual/manual | Cannot unit-test DOM layout; verify by loading page and confirming no manual zoom needed |
| FLOW-11 | Edges don't cross excessively | Visual/manual | No automated test possible for visual layout; verify in browser at default zoom |

### Wave 0 Gaps
- No new test files needed — this is a pure visual/UX change. Manual verification in browser is the gate.

---

## Security Domain

No new API routes, no user input, no data handling. Security domain: NOT APPLICABLE for this phase.

---

## Project Constraints (from CLAUDE.md)

| Directive | Applies To This Phase |
|-----------|----------------------|
| No `execSync`/`exec` — use `execFileSync` or `fs/promises` | Not applicable (no backend changes) |
| Production = `npm start --port 3002` after `npm run build` | YES — build gate required before verifying layout |
| No `qmd embed` | Not applicable |
| mem0 writes via `POST http://localhost:3201/memory/add` only | Not applicable |
| No recursive `readdir()` on vault | Not applicable |
| Use Sonnet for implementation | YES |
| Read `node_modules/next/dist/docs/` before writing Next.js code | Applicable if page.tsx is touched — check if `min()` CSS in inline style needs any Next.js 16-specific handling |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `min(900px, calc(100vh - 220px))` works in inline React style with Next.js 16 | Responsive Container | CSS `min()` in inline styles is standard — risk is LOW; if it fails, use a fixed height of 750px instead |
| A2 | Removing `animated: true` from knowledge/memory edges won't break any test assertions | Selective Animation | Risk LOW — no automated tests exist for edge animation state |

---

## Sources

### Primary (HIGH confidence)
- `src/components/flow/react-flow-canvas.tsx` — direct code inspection of all node positions, edge definitions, current fitView config
- `node_modules/@xyflow/react/dist/esm/index.js` — verified: `smoothstep` in `builtinEdgeTypes`, `getSmoothStepPath` exported, `fitViewOptions` prop accepted with `padding` and `duration`

### Secondary (MEDIUM confidence)
- `.planning/PROJECT.md` — confirmed "4-row layout, 21 nodes" description (actual count in code: 25 nodes including group boxes and dev tools)
- `.planning/v1.2-KICKOFF.md` — confirmed no layout library is in scope

---

## Metadata

**Confidence breakdown:**
- Current layout state: HIGH — read directly from source
- fitView fix (FLOW-10): HIGH — fitView already present, duration/padding tweak confirmed from source
- Edge type smoothstep (FLOW-11): HIGH — verified available in installed version
- Position compaction: MEDIUM — specific x values are recommendations, require visual verification after change
- Same-row edge exception: MEDIUM — based on analysis of smoothstep routing behavior; test in browser

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable library — @xyflow/react v12 API is stable)
