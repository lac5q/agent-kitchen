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

---

## BACK-02 — Wire all Dev Tools to mem0 + QMD

**Summary:** Claude Code, Gemini CLI, and Codex are not writing to or reading from mem0/QMD. Qwen CLI has mem0 MCP but QMD is unwired.

**Current state:**
- Claude Code: reads mem0 via session hook only (no write MCP) — gap
- Qwen CLI: mem0 MCP ✓, QMD not wired — partial
- Gemini CLI: nothing wired — gap
- Codex: nothing wired — gap

**Goal:** All 4 CLIs should write session learnings to mem0 and be able to query QMD for context.

**How to verify:** The Flow page should show active green edges from each CLI to mem0/QMD. Currently only Qwen has one edge.

**Origin:** User request 2026-04-10 — "if they are not wired then it's a failure in the stack"

