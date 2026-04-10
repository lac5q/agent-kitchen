---
phase: 4
slug: flow-diagram-upgrade
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (if exists) or inline in `package.json` |
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test -- --run && npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run`
- **After every plan wave:** Run `npm run test -- --run && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | FLOW-01 | — | N/A | visual/manual | `npm run build` | ✅ | ⬜ pending |
| 4-01-02 | 01 | 1 | FLOW-04 | — | N/A | visual/manual | `npm run build` | ✅ | ⬜ pending |
| 4-02-01 | 02 | 1 | FLOW-02 | T-4-01 | agentId stripped of path traversal | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 1 | FLOW-02 | — | N/A | integration/manual | `npm run build` | ✅ | ⬜ pending |
| 4-03-01 | 03 | 1 | FLOW-03 | — | N/A | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 4-04-01 | 04 | 2 | FLOW-05 | — | N/A | visual/manual | `npm run build` | ✅ | ⬜ pending |
| 4-04-02 | 04 | 2 | FLOW-06 | — | N/A | visual/manual | `npm run build` | ✅ | ⬜ pending |
| 4-04-03 | 04 | 2 | FLOW-07 | — | N/A | visual/manual | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/heartbeat/__tests__/route.test.ts` — unit tests for path traversal guard (FLOW-02, T-4-01)
- [ ] `src/lib/__tests__/activity-cleanup.test.ts` — unit tests for regex cleanup transforms (FLOW-03)

*All test stubs needed because these are new routes/utilities with no existing tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All 13+ nodes visible without overlap on desktop | FLOW-01, FLOW-04 | Visual layout check — no automated spatial overlap detection | Open /flow in browser at 1440px width; confirm no nodes overlap |
| Node label text fully readable (no truncation) | FLOW-01 | Visual check | Inspect each node label for wrapping vs truncation |
| Detail panel shows real HEARTBEAT_STATE.md content | FLOW-02 | File system state varies by agent | Click each agent node; confirm "Last State" section appears when file exists |
| Activity feed shows human-readable events | FLOW-03 | Log content varies | Open /flow; inspect feed for absence of ===, ---, raw timestamps |
| Knowledge Curator node visible with curator edges | FLOW-05 | Visual check | Confirm curator node appears in knowledge row with 4 outgoing edges |
| Obsidian node as ground truth hub | FLOW-07 | Visual check | Confirm obsidian node in knowledge row; 3 incoming edges from QMD, llmwiki, curator |
| mem0→QMD and llmwiki→QMD edges visible | FLOW-06 | Visual check | Confirm 2 new data-flow edges in diagram |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
