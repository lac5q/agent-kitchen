---
phase: 05-knowledge-ingestion-pipeline
fixed_at: 2026-04-10T00:00:00Z
review_path: .planning/phases/05-knowledge-ingestion-pipeline/05-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-04-10T00:00:00Z
**Source review:** .planning/phases/05-knowledge-ingestion-pipeline/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (1 Critical, 5 Warning)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: Incomplete Home Directory Expansion Allows Path Injection

**Files modified:** `src/app/api/devtools-status/route.ts`
**Commit:** 460ef2a
**Applied fix:** Imported `path` from Node core. Replaced bare `string.replace("~", HOME)` with a regex `/^~/` replacement followed by `path.resolve()`. Added a path-containment guard that returns empty early if the resolved path does not start with `home + path.sep`, preventing `~/../etc/passwd`-style traversal. Applied to both `readJSON` and `readTOML` helpers.

### WR-01: Event ID Collision Risk from Math.random() Seeding

**Files modified:** `src/app/api/activity/route.ts`
**Commit:** 02196fd
**Applied fix:** Changed `for...of` loop over `lines` to `lines.forEach((line, idx) => {...})` and replaced all `Math.random()` suffixes in event IDs with the monotonic loop index `idx`. This guarantees unique IDs within a single response batch even when multiple lines share the same timestamp.

### WR-02: nodeStats Function Captures Stale Closure in useMemo

**Files modified:** `src/components/flow/react-flow-canvas.tsx`
**Commit:** 472dab8
**Applied fix:** Converted `nodeStats` from a plain function to `useCallback` with a complete dependency array `[agentCount, activeCount, memoryCount, knowledgeCount, skillCount, devToolsMap]`. Added `nodeStats` to the `nodes` useMemo dependency array and removed the `eslint-disable-next-line react-hooks/exhaustive-deps` suppression comment that was masking the stale closure. Also updated `handleNodeClick` useCallback to depend on `nodeStats` instead of `devToolsMap` directly (and removed its eslint-disable comment).

### WR-03: Unhandled Promise Rejection in NodeDetailPanel fetch

**Files modified:** `src/components/flow/node-detail-panel.tsx`
**Commit:** 730dd63
**Applied fix:** Added `r.ok` check before calling `r.json()` in the heartbeat fetch chain. Non-2xx responses now throw an error that is caught by the existing `.catch()` handler, which sets heartbeat content to null. This prevents silent swallowing of error responses.

### WR-04: devtools-status Returns partial for Codex TOML Check with Substring Match

**Files modified:** `src/app/api/devtools-status/route.ts`
**Commit:** 809c95a
**Applied fix:** Replaced `codexTOML.includes("[mcp_servers.mem0]")` and the equivalent `qmd` check with anchored multiline regex tests `/^\[mcp_servers\.mem0\]/m` and `/^\[mcp_servers\.qmd\]/m`. This prevents false positives from commented-out headers or section names that are substrings of the target.

### WR-05: AgentPlatform Type Missing "opencode" — Silent Runtime Mismatch

**Files modified:** `src/app/page.tsx`
**Commit:** e274ee8
**Applied fix:** Added a `VALID_PLATFORMS` Set constant containing all known platform values. Replaced the bare `r.platform as Agent["platform"]` type assertion in the remote agents map with a runtime membership check: if the platform string is in the set it is used as-is, otherwise it falls back to `"claude"`. This makes unknown API platform strings visible at runtime rather than silently accepted.

---

_Fixed: 2026-04-10T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
