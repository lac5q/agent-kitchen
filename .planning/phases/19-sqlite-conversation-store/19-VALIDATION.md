---
phase: 19
slug: sqlite-conversation-store
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose src/lib/__tests__ src/app/api/recall` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose src/lib/__tests__ src/app/api/recall`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 0 | SQLDB-03 | — | DB path centralized, no hardcodes | unit | `npx vitest run --reporter=verbose src/lib/__tests__/db.test.ts` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 1 | SQLDB-03 | — | FTS5 index created on init | unit | `npx vitest run --reporter=verbose src/lib/__tests__/db.test.ts` | ❌ W0 | ⬜ pending |
| 19-02-01 | 02 | 2 | SQLDB-01 | — | /api/recall returns ranked results | integration | `npx vitest run --reporter=verbose src/app/api/recall/__tests__/route.test.ts` | ❌ W0 | ⬜ pending |
| 19-02-02 | 02 | 2 | SQLDB-02 | — | Ingest skips unchanged files; thinking blocks excluded; FTS5 escaping prevents injection | unit | `npx vitest run --reporter=verbose src/lib/__tests__/ingest.test.ts` | ❌ W0 | ⬜ pending |
| 19-03-01 | 03 | 3 | SQLDB-04 | — | Ledger panel renders DB stats | manual | Browser: navigate to /ledger, check stats panel | N/A | ⬜ pending |
| 19-03-02 | 03 | 3 | DASH-01 | — | Last recall query shown in Ledger | manual | Browser: call /api/recall, reload /ledger | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/db.test.ts` — stubs for SQLDB-01, SQLDB-02
- [ ] `src/lib/__tests__/ingest.test.ts` — stubs for SQLDB-02
- [ ] `src/app/api/recall/__tests__/route.test.ts` — stubs for SQLDB-03
- [ ] `npm install better-sqlite3 @types/better-sqlite3` — native SQLite driver

*Wave 0 must install better-sqlite3 before any SQLite code runs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ledger panel shows row count, DB size, last ingest timestamp | SQLDB-04 | Requires browser rendering of dashboard UI | Navigate to /ledger; verify stats panel shows all 4 metrics |
| Last recall query displayed after search | DASH-01 | Requires end-to-end browser flow | Call /api/recall?q=test, navigate to /ledger, verify query shown |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
