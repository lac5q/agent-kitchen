---
phase: 109-parallel-domain-audit
plan: "04"
subsystem: security-audit
tags: [audit, security, data-memory, python-services, cve, trust-boundaries]
dependency_graph:
  requires: [audit-toolchain-ready, cve-baseline]
  provides: [domain-c-findings]
  affects: [109-FINDINGS-INDEX, 110, 111]
tech_stack:
  added: []
  patterns: [trust-boundary-first-severity, coverage-attestation]
key_files:
  created: [.planning/audit/domain-data-memory.md]
  modified: []
decisions:
  - "Python services are NOT in docker-compose.yml (only the Next.js app is) — they run as native host processes; documented as the structural basis for all trust-boundary calls"
  - "memory/embed/voice bind 0.0.0.0 with no service auth rated medium (defense-in-depth gap), NOT high — orchestration app.py:118-120 documents that network isolation + TS proxy is the intended control (Pitfall 2 honored)"
  - "diskcache CVE rated medium not high — no first-party code constructs a diskcache Cache (transitive-only), lowering exploitability"
  - "voice-server pip-audit recorded NOT-CHECKED (pipecat-ai resolver conflict carried from 109-01), not silently dropped — filed as C01-006 coverage gap"
  - "AUDIT-03 satisfied here; NOT marked complete in REQUIREMENTS (orchestrator owns STATE/ROADMAP/REQUIREMENTS writes in parallel-execution mode)"
metrics:
  duration: 11m
  completed_date: "2026-06-07"
  tasks_completed: 2
  files_created: 1
---

# Phase 109 Plan 04: Domain C — Data & Memory Handling Audit Summary

Audited the four Python services for unsafe deserialization, data leakage, PII-in-logs, file-path/SQLite safety, dependency CVEs, and memory access controls — producing `.planning/audit/domain-data-memory.md` with 6 findings (0 critical, 1 high, 2 medium, 3 low), a 5-surface trust-boundary table built before any severity was assigned, and a complete 10-row coverage attestation. The headline result: no unauthenticated-RCE path, no unsafe deserialization (both yaml sites use `safe_load`), the no-direct-Qdrant-write constraint holds, and Phase 74-78 memory-security controls are not regressed — the real risk is dependency lag (mem0ai's 4 CVEs) plus services binding `0.0.0.0` without service-level auth (a defense-in-depth gap, given the documented network-isolation boundary).

## Tasks Completed

| Task | Type | Status | Commit | Files |
|------|------|--------|--------|-------|
| T1: pip-audit/bandit + document Python service trust boundaries | auto | COMPLETE | (this commit) | .planning/audit/domain-data-memory.md |
| T2: Domain C manual checklist + attested report | auto | COMPLETE | (this commit) | .planning/audit/domain-data-memory.md |

Both tasks write to the single deliverable file; committed together as one atomic audit-report commit.

## Findings Produced

| ID | Severity | Title | Location | Fix Req |
|----|----------|-------|----------|---------|
| C01-001 | high | mem0ai 0.1.118 — 4 CVEs (core memory dep) | services/memory/requirements.txt:6 | SEC-04 |
| C01-002 | medium | mem0/embed/voice bind 0.0.0.0, no service auth | mem0-server.py:3 (+3 sites) | SEC-03 |
| C01-003 | medium | diskcache 5.6.3 CVE-2025-69872 (transitive) | knowledge-mcp/requirements.txt | SEC-04 |
| C01-004 | low | orchestration fastapi/uvicorn unpinned | orchestration/requirements.txt:1-2 | SEC-04 |
| C01-005 | low | voice-server predictable /tmp session file | voice-server/health.py:21, server.py:32 | SEC-03 |
| C01-006 | low | voice-server pip-audit NOT performed (blind spot) | voice-server/requirements.txt | SEC-04 |

## Trust Boundaries Documented (Pitfall 2)

| Service | Bind | Boundary | Service auth |
|---------|------|----------|--------------|
| knowledge-mcp | 127.0.0.1:8765 (0.0.0.0 opt-in) | public-reachable (opt-in) | bearer (opt-in) |
| memory/mem0-server | 0.0.0.0:3201 | loopback-intended, binds-broadly | none |
| memory/embed | 0.0.0.0:8002 | loopback-intended, binds-broadly | none |
| orchestration | internal (TS-proxy fronted) | loopback/docker-internal | none by design |
| voice-server | 0.0.0.0 | loopback-intended, binds-broadly | none |

Severity for the only "missing service auth" finding (C01-002) cites this boundary in its justification — no severity was assigned without it.

## Tooling Results

- **pip-audit:** 3 of 4 services scanned (knowledge-mcp 1 CVE, memory 4 CVEs, orchestration 0 CVEs; voice-server NOT-CHECKED — pipecat-ai resolver conflict from 109-01).
- **bandit `-r services/`:** `/tmp/bandit-domain-c.json` (valid JSON, 349 results: 342 LOW, 7 MEDIUM). MEDIUM = B104 bind-all-interfaces ×5 → C01-002; B108 insecure-temp-file ×2 → C01-005.
- **Deserialization grep:** `pickle|yaml.load|marshal|shelve` → 0 matches; both yaml call sites use `yaml.safe_load`. No RCE-class finding.

## Deviations from Plan

### Auto-fixed Issues

None — this is a read-only audit; no source files modified.

### Scope Adjustments

**1. [Informational] voice-server pip-audit remains NOT-CHECKED**
- **Found during:** Task 1
- **Issue:** The 109-01 pipecat-ai resolver conflict was not resolvable within a read-only audit (resolving it requires editing `requirements.txt`, which the plan forbids).
- **Action:** Filed as finding C01-006 and tagged NOT-CHECKED in the coverage attestation rather than silently omitted; remediation (pin pipecat-ai or use `pip-audit --environment`) documented.

**2. [Informational] diskcache CVE down-rated to medium**
- **Found during:** Task 2
- **Issue:** Wave 1 flagged the CVE; grep confirmed no first-party `diskcache.Cache` construction in knowledge-mcp source (transitive-only).
- **Action:** Rated medium with usage evidence rather than inheriting a default-high CVE label (Pitfall 3 avoidance).

## Known Stubs

None — audit report deliverable, no application code.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information-disclosure | services/memory/mem0-server.py | mem0-server exposes unauthenticated read/write/delete memory API (`/memory/add`, `/memory/search`, `/memory/all`, `/memory/reset`, `DELETE /memory/{id}`) bound to 0.0.0.0 — surface already captured as C01-002; flagged for Wave-3 index visibility. |

## Self-Check: PASSED

- [x] `.planning/audit/domain-data-memory.md` exists — FOUND
- [x] `## Trust Boundaries` present — FOUND
- [x] `## Coverage Attestation` present (10 checklist rows + tooling rows, no blanks) — FOUND
- [x] `## Summary Stats` present — FOUND
- [x] `/tmp/bandit-domain-c.json` valid JSON — VERIFIED
- [x] No source files modified (only audit + summary docs) — VERIFIED
