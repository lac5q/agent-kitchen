# Backlog

Items waiting to be planned into a phase.

---

## BACK-01 — Flow: Memory Direction Toggle (Write vs Consume)

**Summary:** Add a Write | Consume toggle button on The Flow page.

**Write mode (default):** Shows edges where agents and User/Telegram *store* data into memory systems (mem0, QMD, Qdrant, Obsidian). Edge direction points toward storage nodes.

**Consume mode:** Shows edges where agents *query* memory systems for context before responding. Edge direction points from storage toward agents. If live consumption data is unavailable, fall back to Write mode.

**Rules:**
- Toggle: Write | Consume (not simultaneous — one mode at a time)
- If Consume data unavailable → must show Write
- "User / Telegram" is the human-facing node (not a separate "You" node)
- Edge color and direction change per mode

**Origin:** User request 2026-04-10

---
