---
phase: 3
slug: agent-awareness
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-09
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bash / manual verification |
| **Config file** | none — shell script + settings.json edits |
| **Quick run command** | `bash ~/.claude/hooks/mem0-session-preload.sh` |
| **Full suite command** | `bash ~/.claude/hooks/mem0-session-preload.sh && grep -q "SessionStart" ~/.claude/settings.json` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bash ~/.claude/hooks/mem0-session-preload.sh`
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | KNOW-05 | — | Hook exits 0 when mem0 is down | manual | `bash ~/.claude/hooks/mem0-session-preload.sh; echo $?` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | KNOW-05 | — | Hook registered in settings.json | unit | `grep -q "SessionStart" ~/.claude/settings.json && echo PASS` | ✅ | ⬜ pending |
| 3-01-03 | 01 | 2 | KNOW-05 | — | Hook returns mem0 memories in new session | manual | Start new Claude Code session, verify context appears | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `~/.claude/hooks/mem0-session-preload.sh` — hook script (created by plan tasks)

*Existing infrastructure (mem0 HTTP server on :3201, settings.json) covers supporting requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Session surfaces relevant mem0 memory | KNOW-05 | Requires live Claude Code session start | Start fresh session on agent-kitchen project; verify memory appears in context |
| Hook silent-fails when mem0 down | KNOW-05 | Requires stopping mem0 service | `launchctl unload ~/Library/LaunchAgents/com.mem0.server.plist && bash ~/.claude/hooks/mem0-session-preload.sh; echo "Exit: $?"` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (hook created by Task 1, which has `<automated>` verify — no separate Wave 0 test file needed for a shell hook)
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-09
