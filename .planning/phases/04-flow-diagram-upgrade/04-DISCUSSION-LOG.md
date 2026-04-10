# Phase 4: Flow Diagram Upgrade - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 04-flow-diagram-upgrade
**Areas discussed:** Label Display, Node Detail Panel, Activity Feed, New Nodes, Layout

---

## Label Display (FLOW-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Remove `truncate`, allow wrap | Simple CSS fix, no layout impact | ✓ |
| Widen nodes | Avoid wrapping but changes canvas dimensions | |
| Tooltip on hover | Adds interaction but doesn't fix readability | |

**User's choice:** Default recommendation — remove truncate, allow wrap, minor font size reduction.
**Notes:** User chose defaults for all areas.

---

## Node Detail Panel (FLOW-02)

| Option | Description | Selected |
|--------|-------------|----------|
| HEARTBEAT_STATE.md (last 20 lines) | Shows actual last-run state, not instructions | ✓ |
| HEARTBEAT.md | Full instructions template — too long, not useful | |
| Both files | Tabs/sections — added complexity | |

**User's choice:** Default — HEARTBEAT_STATE.md, last 20 lines, graceful fallback.
**Notes:** User chose defaults for all areas.

---

## Activity Feed (FLOW-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Pattern-based cleanup (regex) | Simple, fast, no dependencies | ✓ |
| LLM-assisted summarization | Better quality but latency + cost | |
| Minimal cleanup (current) | Already partially done | |

**User's choice:** Default — pattern-based regex cleanup in API route.
**Notes:** User chose defaults for all areas.

---

## New Nodes: Knowledge Curator + Obsidian (FLOW-05, FLOW-06, FLOW-07)

| Option | Description | Selected |
|--------|-------------|----------|
| New bottom row for knowledge nodes | Adds visual row, clean separation | ✓ |
| Squeeze into existing rows | Overlap risk | |
| Obsidian as center hub | Radically different layout | |

**User's choice:** Default — new row, curator between GitNexus/LLM Wiki, Obsidian as rightmost anchor.
**Notes:** User chose defaults for all areas.

---

## Layout / No Overlap (FLOW-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Tune hardcoded coordinates | Simple, no new deps | ✓ |
| elkjs auto-layout | Automatic but adds dependency | |
| CSS grid zones | Constrains drag interaction | |

**User's choice:** Default — retune coordinates, 4-row layout, canvas height 620→720px.
**Notes:** User chose defaults for all areas.

---

## Claude's Discretion

- Exact pixel coordinates within rows
- Edge label text (keep minimal or none)
- Animation speed on new edges

## Deferred Ideas

- FLOW-08: localStorage position persistence (v2)
- FLOW-09: Multiple layout modes (v2)
- elkjs auto-layout (deferred)
