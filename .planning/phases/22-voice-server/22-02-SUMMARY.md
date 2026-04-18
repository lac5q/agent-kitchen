---
phase: 22-voice-server
plan: "02"
subsystem: voice
tags: [voice, dashboard, recall, hooks, component]
dependency_graph:
  requires: [22-01]
  provides: [VOICE-05, DASH-04]
  affects: [src/app/flow/page.tsx, src/app/api/recall/route.ts, src/lib/api-client.ts]
tech_stack:
  added: []
  patterns: [useQuery polling, agent_id SQL filter, collapsible panel, jsdom-safe scrollIntoView guard]
key_files:
  created:
    - src/components/voice/VoicePanel.tsx
    - src/components/voice/useVoiceTranscript.ts
    - src/components/voice/__tests__/VoicePanel.test.tsx
    - src/app/api/voice-status/__tests__/route.test.ts
  modified:
    - src/app/api/recall/route.ts
    - src/lib/api-client.ts
    - src/lib/constants.ts
    - src/app/flow/page.tsx
decisions:
  - "Used direct SELECT on messages table for agent_id-only recall path (not FTS) to avoid requiring a keyword search for transcript retrieval"
  - "Post-filter FTS results in JS when both q and agent_id are present — simpler than modifying FTS JOIN"
  - "Guarded scrollIntoView with typeof check for jsdom test compatibility instead of mocking in setup"
metrics:
  duration_minutes: 45
  completed_date: "2026-04-18"
  tasks_completed: 2
  tasks_total: 3
  files_created: 4
  files_modified: 4
---

# Phase 22 Plan 02: Voice Panel Dashboard Summary

**One-liner:** VoicePanel component on Flow page showing live voice server status, session duration mm:ss, and scrollable agent_id-filtered transcript via extended /api/recall route.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Extend recall route + voice hooks + voice-status test | `89303d3` | Complete |
| 2 | VoicePanel component + test + wire to Flow page | `6f875c7` | Complete |
| 3 | Human verify voice panel on Flow page | — | **Pending checkpoint** |

## What Was Built

### Task 1 — Recall route + voice hooks + test

**`/api/recall` extended with `agent_id` filter:**
- `agent_id` only (no `q`): direct `SELECT … WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?` on `messages` table — returns all messages for that agent without requiring a keyword search
- `agent_id` + `q`: runs FTS search then post-filters results by `agent_id` in JS
- Limit capped at 100 (consistent with existing DoS protection)

**`POLL_INTERVALS.voice = 2000`** added to `src/lib/constants.ts`

**`useVoiceStatus()` hook** added to `src/lib/api-client.ts` — polls `/api/voice-status` every 2s using React Query

**`useVoiceTranscript(enabled: boolean)`** created at `src/components/voice/useVoiceTranscript.ts` — polls `/api/recall?agent_id=voice&limit=50` every 5s, returns `TranscriptEntry[]`, only polls when `enabled=true`

**Voice-status route test** at `src/app/api/voice-status/__tests__/route.test.ts` — 2 tests: healthy Python server response proxied as-is; unreachable server returns `{active: false, error: "voice server unavailable"}`

### Task 2 — VoicePanel component

**`src/components/voice/VoicePanel.tsx`** (148 lines, "use client"):
- Uses `useVoiceStatus()` and `useVoiceTranscript(voiceStatus?.active ?? false)`
- Status indicator: green pulsing dot + "Active" | gray dot + "Inactive" | red dot + "Unavailable"
- Session duration: `mm:ss` format when active; "Last session: mm:ss" when inactive with prior duration
- Scrollable transcript (max-h-64, overflow-y-auto): user messages slate-700, assistant amber-900/30
- Empty state: "No voice transcripts yet"
- Auto-scroll to bottom on new entries (useEffect + ref, jsdom-safe guard)
- Collapsible via chevron toggle (useState)
- Container: `rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-3`
- Mic SVG icon in header (inline SVG, no new package)

**`src/components/voice/__tests__/VoicePanel.test.tsx`** — 7 tests: Inactive / Active with duration / Unavailable / empty transcript / transcript entries with role labels / Last session duration / collapse toggle

**`src/app/flow/page.tsx`** — VoicePanel imported and rendered between the ReactFlowCanvas `</div>` and the ActivityFeed container

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@testing-library/user-event` not installed**
- **Found during:** Task 2 test run
- **Issue:** Test file imported `@testing-library/user-event` for the collapse toggle test; package not in node_modules
- **Fix:** Replaced `userEvent.click()` with `fireEvent.click()` from `@testing-library/react` (already installed). Removed async/await from that test.
- **Files modified:** `src/components/voice/__tests__/VoicePanel.test.tsx`
- **Commit:** `6f875c7`

**2. [Rule 1 - Bug] `scrollIntoView` unavailable in jsdom**
- **Found during:** Task 2 test run (7 failures on first run)
- **Issue:** `bottomRef.current.scrollIntoView()` throws in jsdom environment — method not implemented
- **Fix:** Added `typeof bottomRef.current.scrollIntoView === "function"` guard before calling it
- **Files modified:** `src/components/voice/VoicePanel.tsx`
- **Commit:** `6f875c7`

## Task 3 — Pending Human Checkpoint

Task 3 is a `checkpoint:human-verify` gate. It requires:
1. Building and starting the production server
2. Navigating to `/flow` and visually verifying the Voice Server panel
3. Confirming: gray "Inactive" dot, "No voice transcripts yet", collapsible chevron, correct dark theme styling

Resume signal: type "approved" or describe issues.

## Known Stubs

None. VoicePanel is wired to live hooks — it shows real data from `/api/voice-status` and `/api/recall?agent_id=voice`. When the Python voice server is not running, the panel correctly shows "Inactive" (not a stub).

## Threat Flags

No new threat surface beyond what was modeled in the plan. The `agent_id` filter narrows recall results (does not expose new data). The 2s polling is lightweight GET to a local proxy.

## Self-Check

- [x] `src/components/voice/VoicePanel.tsx` — exists, 148 lines (> 60 minimum)
- [x] `src/components/voice/useVoiceTranscript.ts` — exists
- [x] `src/components/voice/__tests__/VoicePanel.test.tsx` — exists, 7 tests pass
- [x] `src/app/api/voice-status/__tests__/route.test.ts` — exists, 2 tests pass
- [x] `src/app/api/recall/route.ts` — agent_id filter added
- [x] `src/lib/api-client.ts` — useVoiceStatus hook added
- [x] `src/lib/constants.ts` — POLL_INTERVALS.voice = 2000 added
- [x] `src/app/flow/page.tsx` — VoicePanel imported and rendered
- [x] Commit `89303d3` exists (Task 1)
- [x] Commit `6f875c7` exists (Task 2)
- [x] TypeScript: no errors in any modified files

## Self-Check: PASSED
