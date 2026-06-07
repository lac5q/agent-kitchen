---
phase: 109-parallel-domain-audit
plan: 05
subsystem: audit
tags: [architecture, code-quality, dead-code, circular-deps, audit]
requires: ["109-01"]
provides: ["domain-architecture-findings", "ARCH-01..05-queue"]
affects: ["112-architecture-remediation"]
tech-stack:
  added: []
  patterns: ["read-only audit", "madge/knip/ruff/vulture toolchain", "Pitfall-3 severity calibration"]
key-files:
  created:
    - .planning/audit/domain-architecture.md
  modified: []
decisions:
  - "Severity calibrated per Pitfall 3: all 12 unsafe casts rated LOW because none touch auth/validation/crypto paths"
  - "Circular deps split by edge kind: 2 type-only (erased, near-INFO) vs 1 runtime memory cycle"
  - "madge --ts-config form processed 0 files; switched to --extensions ts,tsx (Rule 3 tooling fix)"
  - "vulture decorator false-positives noted explicitly (MCP @mcp.tool handlers flagged unused)"
metrics:
  duration: "~25m"
  completed: "2026-06-07"
  tasks: 2
  files: 1
requirements: [AUDIT-04]
---

# Phase 109 Plan 05: Domain D Architecture & Code Quality Audit Summary

Read-only architecture audit (AUDIT-04) producing the Phase 112 ARCH-01..05 work queue: 9 findings (1 MEDIUM, 5 LOW, 3 INFO, zero HIGH/CRITICAL) across dead code, circular deps, unsafe TS casts, inconsistent API error handling, and one shell-mode exec site — with redundancy, cross-layer leakage, and Python cross-service imports attested CLEAN.

## What Was Built

`.planning/audit/domain-architecture.md` — a fully attested Domain D findings report containing: severity-ranked top-findings table, 8-row Coverage Attestation (every manual checklist item tagged CLEAN/FINDING), full per-finding schema with file:line + ARCH mapping, and Summary Stats.

## Key Findings

- **D01-001 (MEDIUM → ARCH-04):** 129 API routes, only 29 (22%) use the canonical `{ ok: false, error }` shape; 10+ routes return ad-hoc catch errors. Broadest systemic issue.
- **D01-002 (LOW → ARCH-02):** Real runtime circular import in memory subsystem (`backends.ts:4` value-imports `registry.ts`).
- **D01-003 (LOW → ARCH-05):** 12 unsafe casts (9 `catch (error: any)`, 3 VoicePanel browser-API) — **none in security paths**, all rated LOW per Pitfall 3.
- **D01-004 (LOW → ARCH-02):** Type-only seal cycle (erased at compile).
- **D01-005 (LOW → ARCH-01):** 11 dead exports/types in security paths; `auth/jwt.ts generateRefreshToken` unconsumed (possible incomplete refresh-token flow).
- **D01-006/007/008 (INFO → ARCH-01):** 11 unused files, 120 unused exports; Python ruff (50, mostly test imports) + vulture (mostly decorator false-positives).
- **D01-009 (LOW → ARCH-02):** `context-sources.ts:119` runs `execFileSync` with `shell:"/bin/sh"` and an interpolated `tool` arg. Provenance traced to JSON-config `requiredTools[]` (operator-controlled, not request-reachable) → disposition CLEAN/not-exploitable, logged as defense-in-depth.

**CLEAN attestations:** redundant patterns (DB centralized in `lib/db.ts`, 0 raw `new Database()`), cross-layer leakage (0 UI→db imports), Python cross-service imports (0). execFile/spawn arg-safety attested CLEAN with one caveat (D01-009): one shell-mode site exists but is config-controlled, not user-reachable; `execSync` 0 occurrences.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking tooling] madge invocation processed 0 files**
- **Found during:** Task 1
- **Issue:** The plan's `madge --circular --ts-config apps/memroos/tsconfig.json apps/memroos/src/lib/` reported "Processed 0 files" (no file resolution).
- **Fix:** Re-ran as `madge --circular --extensions ts,tsx apps/memroos/src/` (648 files processed, 3 cycles found). Documented in report's Tool invocation notes. No source changed.
- **Files modified:** none (tooling invocation only)
- **Commit:** a661af8

## Environment Anomaly (for orchestrator integration)

This worktree branch (`worktree-agent-a6234ee403a006ba1`) was created from a pre-109 base commit, so phase 109 plan/research files were initially absent from the worktree path. Verification (`git diff --stat HEAD main -- apps/memroos/src services` → empty; `git merge-base --is-ancestor HEAD main` → ANCESTOR; HEAD `17646aa` == main `17646aa`) confirmed the worktree tree is **identical to main** — all audited source and every `file:line` reference is valid against the integration target. Context files (RESEARCH, toolchain-baseline) were read via `git show main:` since they resolve to the same commit. No merge was needed.

## GitNexus Note

GitNexus MCP tools were not present in this executor's tool set, so dependency-graph analysis used madge/knip (the plan's sanctioned fallback). `gitnexus_detect_changes()` could not be run from here; orchestrator may wish to confirm index freshness separately.

## Post-Write Correction (advisor review)

A reviewer flagged that the initial AC-8 attestation claimed "no `shell:` option" while my own execFile/spawn scan showed `context-sources.ts:119` uses `shell:"/bin/sh"`. I traced the interpolated `tool` arg to JSON-config `requiredTools[]` (operator-controlled, not request-reachable), corrected AC-8's evidence to be accurate, and added finding **D01-009** (LOW, defense-in-depth). Disposition remains CLEAN (not user-exploitable) but the attestation is now honest. Fix committed as `a0f654f`. Also noted the as-any grep whole-line exclude caveat (12 found vs RESEARCH's 13).

## Self-Check: PASSED

- FOUND: .planning/audit/domain-architecture.md
- FOUND: commit a661af8 (initial report), a0f654f (AC-8 correction + D01-009)
- Coverage Attestation present (8 rows, no blanks); Summary Stats present; 9 findings mapped to ARCH-01..05.
- No source files modified (audit dir is the only change; context-sources.ts was read, not edited).
