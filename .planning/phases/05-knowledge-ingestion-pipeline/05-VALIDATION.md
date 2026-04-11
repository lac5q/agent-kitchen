---
phase: 5
slug: knowledge-ingestion-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bash + inline Python assertions (consistent with knowledge-curator.sh pattern) |
| **Config file** | None — scripts are self-contained |
| **Quick run command** | `bash ~/github/knowledge/personal-ingestion-smoke.sh` |
| **Full suite command** | `bash ~/github/knowledge/personal-ingestion-smoke.sh --full` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick smoke test (gws auth check + state file exists)
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *(Filled by planner)* | — | — | — | — | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `~/github/knowledge/personal-ingestion-smoke.sh` — smoke test script verifying all 4 source connections
- [ ] `~/github/knowledge/ingestion-state.json` — initial state file (empty watermarks)

*Smoke test verifies: gws Gmail auth, gws Calendar auth, gws Drive auth, Spark SQLite readable, mem0 health, Qdrant reachable*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Obsidian daily note appears correctly formatted | D-08, D-09 | Requires visual Obsidian inspection | Open `~/github/knowledge/journals/YYYY-MM-DD.md` and verify `## Email Digest` and `## Meetings` sections |
| Multi-event collision (shared doc) handled correctly | D-13, D-14 | Requires specific Juan meeting test case | Check `knowledge/gdrive/meet-recordings/` for one canonical file + two index notes pointing to it |
| Project meeting notes routed to correct project folder | D-10 | Requires checking heuristic output | Verify `~/github/knowledge/projects/<name>/meetings/` contains meeting files after test run |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
