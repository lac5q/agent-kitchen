# Milestones

## v1.1 Knowledge Architecture + Dashboard Polish (Shipped: 2026-04-11)

**Phases completed:** 5 phases (Phases 1-5), 12 plans, 154 files changed, 33,429 insertions
**Timeline:** 2026-04-08 → 2026-04-11 (3 days)
**Audit:** `.planning/milestones/v1.1-MILESTONE-AUDIT.md` — 12/12 requirements satisfied

**Key accomplishments:**

1. **Knowledge Foundations (Phase 1):** Obsidian vault + fixed llm-wiki basePath registered in Library; `CollectionCard` freshness date via TDD; `gitnexus-index.sh` wired into weekly refresh cron with non-fatal guard
2. **Knowledge Curator Agent (Phase 2):** Nightly `knowledge-curator.sh` orchestrates 5-step pipeline (gitnexus, llm-wiki check, mem0 export, QMD+Qdrant indexing, transcript ingestion); 3,115+ Qdrant Cloud points indexed; cron at `0 2 * * *`
3. **Agent Awareness (Phase 3):** Global SessionStart hook queries mem0 at session start — dual `agent_id` search (claude + shared), fail-safe exit 0, startup-only gate; agents no longer start cold
4. **Flow Diagram Upgrade (Phase 4):** 4-row layout (21 nodes, 720px canvas), label truncation fixed, Knowledge Curator + Obsidian nodes with 9 new data-flow edges, heartbeat panel with path traversal guard, activity feed noise-stripping (regex pipeline)
5. **Personal Knowledge Ingestion Pipeline (Phase 5):** Email threads (replied-to) ingested to Obsidian daily notes + Qdrant; calendar events to mem0; Google Meet + Spark transcript pipeline; 6-hour email cron; nightly transcript cron via Step 5 of knowledge-curator.sh

---

## v1.2 Live Data + Knowledge Sync (Shipped: 2026-04-12)

**Phases completed:** 6 phases (Phases 6-11), 7 plans
**Timeline:** 2026-04-12 → 2026-04-13

**Key accomplishments:**

1. **Library Config Fixes (Phase 6):** Fixed meet-recordings basePath (105 → 100 docs); added mem0-exports collection card to Library (22 docs, category=agents)
2. **Live Heartbeat (Phase 7):** `checkServiceTristate()` pattern added; obsidianStatus() checks today's journal existence; curatorStatus() reads /tmp/knowledge-curator.log with 26h window; 9 unit tests passing
3. **Bidirectional Knowledge Sync (Phase 8):** obsidian-to-mem0.py fixed (agent_id, state file, docstring); 4 journal entries synced to mem0; idempotency confirmed (3 loop guards active); 10/10 pytest scenarios passing
4. **Skill Management Dashboard (Phase 9):** JSONL bridge activated in skill-sync.py; /api/skills live route (248 skills); Cookbooks 5-row stats panel; dashed cyan edges (alba→cookbooks→gateways); 13/13 tests passing
5. **Flow Diagram UX (Phase 10):** smoothstep edges (cross-row) + straight (same-row); animated:true only on request-flow edges (~80% motion noise cut); fitViewOptions padding=0.2 duration=200; 4/4 edge-structure tests passing
6. **Gwen Self-Improving Loop (Phase 11):** self-improving-agent SKILL.md installed; staging pickup block in skill-sync.py (365-day grace); gwen-reflection.json at 0 3 * * * (no collision with Hermes 4am); 6/6 TDD scenarios passing

---
