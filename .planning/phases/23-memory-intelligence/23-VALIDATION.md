---
phase: 23
slug: memory-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run src/lib/__tests__/memory-consolidation.test.ts src/lib/__tests__/memory-decay.test.ts` |
| **Full suite command** | `npx vitest run src/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 0 | MEM-01/02 | — | LOG() probe prevents runtime crash | unit | `npx vitest run src/lib/__tests__/memory-decay.test.ts` | ❌ W0 | ⬜ pending |
| 23-01-02 | 01 | 1 | MEM-01/02 | — | Schema adds consolidated column safely | unit | `npx vitest run src/lib/__tests__/db-schema.test.ts` | ❌ W0 | ⬜ pending |
| 23-01-03 | 01 | 1 | MEM-01 | — | Consolidation loop does not reprocess consolidated rows | unit | `npx vitest run src/lib/__tests__/memory-consolidation.test.ts` | ❌ W0 | ⬜ pending |
| 23-01-04 | 01 | 1 | MEM-02 | — | Decay applies correct multiplier per tier | unit | `npx vitest run src/lib/__tests__/memory-decay.test.ts` | ❌ W0 | ⬜ pending |
| 23-01-05 | 01 | 1 | MEM-02 | — | Pinned tier salience never decays | unit | `npx vitest run src/lib/__tests__/memory-decay.test.ts` | ❌ W0 | ⬜ pending |
| 23-01-06 | 01 | 2 | MEM-01 | — | Consolidation API key missing → graceful exit | unit | `npx vitest run src/lib/__tests__/memory-consolidation.test.ts` | ❌ W0 | ⬜ pending |
| 23-02-01 | 02 | 1 | MEM-04 | — | /api/agent-peers returns correct GROUP BY result | unit | `npx vitest run src/app/api/agent-peers/__tests__/route.test.ts` | ❌ W0 | ⬜ pending |
| 23-02-02 | 02 | 1 | MEM-04 | — | Window param is capped at 1440 min | unit | `npx vitest run src/app/api/agent-peers/__tests__/route.test.ts` | ❌ W0 | ⬜ pending |
| 23-02-03 | 02 | 1 | MEM-03 | — | /api/memory-stats returns pending count and last run | unit | `npx vitest run src/app/api/memory-stats/__tests__/route.test.ts` | ❌ W0 | ⬜ pending |
| 23-02-04 | 02 | 2 | MEM-03/04 | — | Dashboard panels render with mock data | unit | `npx vitest run src/components/__tests__/agent-peers-panel.test.tsx src/components/__tests__/memory-intelligence-panel.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/memory-consolidation.test.ts` — stubs for MEM-01 (batch, mark consolidated, insights write)
- [ ] `src/lib/__tests__/memory-decay.test.ts` — stubs for MEM-02 (4-tier rates, pinned=0, access-resistance, LOG() probe)
- [ ] `src/app/api/agent-peers/__tests__/route.test.ts` — stubs for MEM-04 (peers query, window cap, empty result)
- [ ] `src/app/api/memory-stats/__tests__/route.test.ts` — stubs for MEM-03 (pending count, last run timestamp, tier stats)
- [ ] `src/components/__tests__/agent-peers-panel.test.tsx` — stubs for MEM-04 dashboard panel
- [ ] `src/components/__tests__/memory-intelligence-panel.test.tsx` — stubs for MEM-03 dashboard panel

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| instrumentation.ts boots schedulers on server start | MEM-01/02 | Cannot unit-test Next.js server lifecycle | Start `npm run dev`, check server logs for `[consolidation] started` and `[decay] started` messages |
| Dashboard panels render live data | MEM-03/04 | Requires running app + data in SQLite | Open `/kitchen` or ledger page; verify AgentPeersPanel and MemoryIntelligencePanel render without errors |
| Consolidation runs and writes insights | MEM-01 | Requires real ANTHROPIC_API_KEY + messages in DB | POST to `/api/memory-consolidate` with some test messages; verify `memory_meta_insights` rows written |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
