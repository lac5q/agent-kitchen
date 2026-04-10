---
phase: 04
status: issues-found
reviewed: 2026-04-10
---

# Code Review — Phase 04

## Summary

Five files reviewed covering the activity feed, heartbeat endpoint, flow canvas, node detail panel, and message cleanup. The heartbeat path traversal guard is present but incomplete. Several medium-severity issues exist around stale closures, edge ID collisions, and weak timestamp handling. No critical data-loss or authentication issues found.

---

## Findings

### CRITICAL

None.

---

### HIGH

**H-01: Path traversal guard in `/api/heartbeat` is a denylist instead of an allowlist**

`src/app/api/heartbeat/route.ts` — line 13

The guard rejects `..`, `/`, and `\` as literal characters. Because Next.js URL-decodes query params before `searchParams.get()` is called, percent-encoded slashes arrive as literal slashes and are caught. However, a null byte (`\0`) embedded in the agent ID passes all three checks and could produce unexpected path behavior on some Node.js versions. More importantly, any future change to how the value is sourced (e.g., from a header or body) could reintroduce the bypassed cases. A strict allowlist eliminates the entire class of issue:

```ts
// Replace the current guard with:
if (!agentId || !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
  return NextResponse.json({ content: null }, { status: 400 });
}
```

---

### MEDIUM

**M-01: `useMemo` dependency on `getStatus` / `nodeStats` suppressed via eslint-disable — stale closure bug**

`src/components/flow/react-flow-canvas.tsx` — lines 188, 230, 237

Both the `nodes` memo and `handleNodeClick` have `// eslint-disable-next-line react-hooks/exhaustive-deps` suppressing missing-dependency warnings. `getStatus` and `nodeStats` are plain functions inside the component body, recreated on every render. Referencing them inside memos without listing them as dependencies causes the memos to use stale closures when `services`, `agentCount`, `activeCount`, or other props change — nodes will not re-render with fresh status or stats data until an unrelated dep change triggers re-memoization.

Fix: move `getStatus` and `nodeStats` outside the component (accepting props explicitly), or wrap each in `useCallback`/`useMemo` and include them in the dep arrays.

---

**M-02: Edge slice discards connections mid-agent, leaving some agent nodes disconnected**

`src/components/flow/react-flow-canvas.tsx` — lines 216–221

`agentEdges` generates 4 edges per agent ID. With 5 key agents + `local-agents` = 6 entries = 24 edges, then `.slice(0, 20)` silently drops the last agent's `${id}-sk` edge and all 4 edges for any seventh+ agent. This leaves those agent nodes visually connected to manager but disconnected from cookbooks (and potentially other targets). Either remove the slice — React Flow handles hundreds of edges without issue — or slice on the agent list before `flatMap`.

---

**M-03: `allAgentIds` re-created every render makes the `edges` memo a no-op**

`src/components/flow/react-flow-canvas.tsx` — lines 191, 230

`allAgentIds` is a new array on every render, so `[allAgentIds]` in the `edges` dep array is always a new reference, causing the memo to recompute on every render. Fix: compute `allAgentIds` inside the `edges` memo body, or memoize it separately with `useMemo`.

---

**M-04: Weak timestamp ID uniqueness in activity feed — risk of React key collisions**

`src/app/api/activity/route.ts` — lines 37, 47, 57, 66, 76

Event IDs are constructed from a second-resolution timestamp plus `Math.random()`. Log bursts within the same second have a small but non-zero probability of ID collision on the client, causing React key warnings or dropped renders. Replace with a monotonic counter:

```ts
let seq = 0;
// then use: id: `apo-${ts}-${seq++}`
```

---

**M-05: `AGENT_CONFIGS_PATH` sourced differently between activity and heartbeat routes**

`src/app/api/activity/route.ts` — line 9  
`src/app/api/heartbeat/route.ts` — line 4

The activity route defines its own `AGENT_CONFIGS` inline from `process.env`. The heartbeat route imports `AGENT_CONFIGS_PATH` from `@/lib/constants`. If the two resolve to different directories under any env configuration, the routes read from different base paths. Recommend consolidating to a single export from `@/lib/constants` used by both.

---

### LOW / INFORMATIONAL

**L-01: `cleanMessage` does not strip ANSI escape codes**

`src/lib/activity-cleanup.ts` — line 5

Agent logs running in terminals typically contain ANSI color codes (`\x1b[32m`, etc.). `cleanMessage` strips timestamp brackets and separator lines but passes ANSI codes through, producing garbled text in the activity feed UI. Add before the existing transforms:

```ts
msg = msg.replace(/\x1b\[[0-9;]*m/g, "");
```

---

**L-02: `heartbeatContent` rendered verbatim in `<pre>` — safe today, flag for future changes**

`src/components/flow/node-detail-panel.tsx` — line 99

The heartbeat file content is displayed as a React text node inside `<pre>`, which React escapes automatically. This is safe. Noting it here because the file content is written by agent processes on disk — if the rendering approach ever changes to an unsafe HTML injection method or a markdown renderer, this surface would become an injection vector. Current code is safe.

---

**L-03: `obsidian` and `knowledge-curator` statuses are hardcoded, bypassing real activity data**

`src/components/flow/react-flow-canvas.tsx` — lines 103–104

```ts
if (nodeId === "obsidian") return "active";
if (nodeId === "knowledge-curator") return "idle";
```

These overrides bypass both `nodeActivity` and the service map, so both nodes always show fixed statuses regardless of real state. Likely a Phase 04 placeholder — remove once heartbeat/activity data is available for these nodes.

---

**L-04: Magic number `15` hardcoded in librarian stats**

`src/components/flow/react-flow-canvas.tsx` — line 119

```ts
case "librarian": return { "Docs": knowledgeCount, "Collections": 15 };
```

The `15` is not derived from any prop or API and will silently become stale. Either remove the field or pass it as a prop.
