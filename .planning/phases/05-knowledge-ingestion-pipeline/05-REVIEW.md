---
phase: 05-knowledge-ingestion-pipeline
reviewed: 2026-04-10T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - agents.config.json
  - collections.config.json
  - package.json
  - src/app/api/activity/route.ts
  - src/app/api/devtools-status/route.ts
  - src/app/api/heartbeat/__tests__/route.test.ts
  - src/app/api/heartbeat/route.ts
  - src/app/flow/page.tsx
  - src/app/page.tsx
  - src/components/flow/node-detail-panel.tsx
  - src/components/flow/react-flow-canvas.tsx
  - src/components/kitchen/agent-card.tsx
  - src/components/kitchen/agent-grid.tsx
  - src/components/kitchen/summary-bar.tsx
  - src/lib/__tests__/activity-cleanup.test.ts
  - src/lib/activity-cleanup.ts
  - src/lib/api-client.ts
  - src/types/index.ts
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-04-10T00:00:00Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

This review covers 18 source files spanning API routes, React components, data types, and utility libraries. The codebase is generally well-structured with clear separation of concerns. The heartbeat route has good path traversal protection (allowlist regex). The activity cleanup utility is cleanly written with good test coverage.

One critical finding involves path traversal risk in `devtools-status/route.ts` — the `~` replacement is an incomplete home-directory resolution that can be bypassed. Five warnings cover logic errors, type inconsistencies, and missing error handling. Four info items flag dead code and minor quality issues.

---

## Critical Issues

### CR-01: Incomplete Home Directory Expansion Allows Path Injection

**File:** `src/app/api/devtools-status/route.ts:18`
**Issue:** The `readJSON` and `readTOML` helpers expand `~` by replacing only the first `~` character with `process.env.HOME`. This is an incomplete implementation: `String.prototype.replace` with a string pattern replaces only the first occurrence. More critically, it does not validate that the resolved path stays within the expected home directory. A caller passing a value like `~/../etc/passwd` would resolve to `/home/user/../etc/passwd`, which normalizes to `/etc/passwd`. Although the paths are currently hardcoded in the same file, the generic helper signature accepts any `path: string`, making it a footgun if reused elsewhere.

**Fix:**
```typescript
import path from "path";

async function readJSON(filePath: string): Promise<Record<string, unknown>> {
  try {
    const home = process.env.HOME ?? "";
    const resolved = path.resolve(filePath.replace(/^~/, home));
    // Guard: resolved path must start with home directory
    if (!resolved.startsWith(home + path.sep)) {
      return {};
    }
    const raw = await readFile(resolved, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
```

---

## Warnings

### WR-01: Event ID Collision Risk from Math.random() Seeding

**File:** `src/app/api/activity/route.ts:37,46,57,65,73,80`
**Issue:** Activity event IDs are constructed as `` `apo-${ts}-${Math.random()}` ``. When multiple log lines share the same timestamp (common in batch log output), `Math.random()` could theoretically produce duplicate IDs within a single response. More practically, these IDs are used as React `key` props in the event list — a collision will cause React to silently discard one entry, losing data shown to the user.

**Fix:** Use a monotonic counter instead of random for the unique suffix, or incorporate the loop index:
```typescript
lines.forEach((line, idx) => {
  // ...
  id: `apo-${ts}-${idx}`,
});
```

### WR-02: `nodeStats` Function Captures Stale Closure in `useMemo`

**File:** `src/components/flow/react-flow-canvas.tsx:175-194`
**Issue:** `nodeStats` is a plain function defined inside the component body but *outside* of any `useMemo` or `useCallback`. It closes over `agentCount`, `activeCount`, `memoryCount`, `knowledgeCount`, `skillCount`, and `devToolsMap`. It is then called from within the `nodes` `useMemo` and from `handleNodeClick` (a `useCallback`). The `nodes` `useMemo` dependency array does not include `agentCount`, `activeCount`, `memoryCount`, `knowledgeCount`, or `skillCount` (lines 295-296), so when those props change, the `nodes` array will hold stale stats. The `// eslint-disable-next-line react-hooks/exhaustive-deps` suppression on line 295 is masking this.

**Fix:** Either include all `nodeStats` dependencies in the `useMemo` dep array, or wrap `nodeStats` in its own `useCallback` with complete dependencies and add that to the dep array:
```typescript
const nodeStats = useCallback((id: string): Record<string, string | number> => {
  // ... existing switch ...
}, [agentCount, activeCount, memoryCount, knowledgeCount, skillCount, devToolsMap]);

const nodes = useMemo(() => {
  // ...
}, [remoteAgents, keyRemote, nodeActivity, highlightedNode, localActiveCount, localTotalCount, devToolsMap, nodeStats]);
```

### WR-03: Unhandled Promise Rejection in `NodeDetailPanel` fetch

**File:** `src/components/flow/node-detail-panel.tsx:44-48`
**Issue:** The `fetch` chain calls `.then(r => r.json())` without checking `r.ok` first. If the `/api/heartbeat` endpoint returns a non-2xx response (e.g., 400 for an invalid node ID, or 500 on an internal error), `r.json()` will still succeed and `d.content` will be the error response body — which may be `{ content: null }` from the route's own error path, so it silently swallows the distinction. A 400 status from the server is not a network error, so `.catch` will not fire. The loading spinner will disappear and the panel will show no heartbeat state without any user feedback.

**Fix:**
```typescript
fetch(`/api/heartbeat?agent=${nodeId}`)
  .then(r => {
    if (!r.ok) throw new Error(`heartbeat ${r.status}`);
    return r.json();
  })
  .then(d => setHeartbeatContent(d.content ?? null))
  .catch(() => setHeartbeatContent(null))
  .finally(() => setHeartbeatLoading(false));
```

### WR-04: `devtools-status` Returns `partial` for the Codex TOML Check When `[mcp_servers.mem0]` Is a Substring Match

**File:** `src/app/api/devtools-status/route.ts:88-89`
**Issue:** The Codex wiring check uses `codexTOML.includes("[mcp_servers.mem0]")`. This is a plain substring match, so a file containing `# [mcp_servers.mem0]` (a TOML comment) or `[mcp_servers.mem0_backup]` would register as connected. The JSON-based checks for other tools use `Object.keys(mcpServers)` which is structurally correct, but the TOML check has no structural parsing.

**Fix:** Use a more precise regex that matches the section header at the start of a line and is not preceded by `#`:
```typescript
const codexMem0: WireStatus = /^\[mcp_servers\.mem0\]/m.test(codexTOML) ? "connected" : "not-wired";
const codexQmd: WireStatus  = /^\[mcp_servers\.qmd\]/m.test(codexTOML)  ? "connected" : "not-wired";
```

### WR-05: `AgentPlatform` Type Missing `"opencode"` — Silent Runtime Mismatch

**File:** `src/types/index.ts:2` and `agents.config.json:39`
**Issue:** `AgentPlatform` is defined as `"claude" | "codex" | "qwen" | "gemini" | "opencode"` — `"opencode"` is included in the type. However, in `src/app/page.tsx` line 9, the `DEV_TOOL_DEFS` array only defines platforms `"claude"`, `"qwen"`, `"gemini"`, and `"codex"`. The `platform` field for `devtool` agents with id `"codex"` uses `platform: "codex"` and the devtools-status API also treats "codex" as a codex tool. This is internally consistent.

The actual mismatch is in `src/app/page.tsx` line 27: remote agents use `r.platform as Agent["platform"]` — a type assertion that will silently succeed at compile time even if the API returns an unknown platform string. If `agents.config.json` introduces a new platform, the assertion masks the gap.

**Fix:** Validate at runtime instead of asserting:
```typescript
const VALID_PLATFORMS = new Set<Agent["platform"]>(["claude", "codex", "qwen", "gemini", "opencode"]);

platform: VALID_PLATFORMS.has(r.platform as Agent["platform"])
  ? (r.platform as Agent["platform"])
  : "claude", // fallback
```

---

## Info

### IN-01: `FlowNode` and `FlowEdge` Types Are Unused

**File:** `src/types/index.ts:63-78`
**Issue:** The `FlowNode` and `FlowEdge` interfaces are defined but not imported anywhere in the reviewed files. The flow canvas uses `@xyflow/react`'s own `Node` and `Edge` types. These type definitions add maintenance surface without value.

**Fix:** Remove `FlowNode` and `FlowEdge` from `src/types/index.ts`, or confirm they are used in unreviewed files before removing.

### IN-02: Magic Number `skillCount={405}` Hardcoded in Flow Page

**File:** `src/app/flow/page.tsx:58`
**Issue:** `skillCount` is passed as the literal `405` directly in JSX. This is a static value that will drift from reality without any visible indicator. It is not sourced from an API or constant.

**Fix:** Extract to a named constant in `@/lib/constants` (e.g., `SKILL_COUNT = 405`) or source it from an API endpoint if a skills count is already available.

### IN-03: Duplicate `activeCount` Computation in Flow Page

**File:** `src/app/flow/page.tsx:29,37`
**Issue:** `activeCount` and `localActiveCount` are computed with identical filter expressions on lines 29 and 37:
```typescript
const activeCount = agentsData?.agents.filter((a: { status: string }) => a.status === "active").length || 0;
// ...
const localActiveCount = agentsData?.agents.filter((a: { status: string }) => a.status === "active").length || 0;
```
These two variables hold the same value from the same data source and can be unified.

**Fix:** Remove `localActiveCount` and pass `activeCount` in its place, or remove `activeCount` and rename `localActiveCount`.

### IN-04: Test Uses `as never` Cast to Satisfy Mock Types

**File:** `src/app/api/heartbeat/__tests__/route.test.ts:70,85`
**Issue:** `mockReadFile.mockResolvedValueOnce(fileLines.join("\n") as never)` uses `as never` to work around a type mismatch in the mock. This suppresses TypeScript's ability to catch incorrect mock return types. The `as never` pattern is a test-code smell that can hide real type errors if the mocked function's signature changes.

**Fix:** Type the mock correctly using the actual return type:
```typescript
mockReadFile.mockResolvedValueOnce(fileLines.join("\n") as unknown as Buffer);
// or configure the mock type parameter at declaration time
```

---

_Reviewed: 2026-04-10T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
