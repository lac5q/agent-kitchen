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
