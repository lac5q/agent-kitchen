# Milestones

## v1.4 Cookbooks (Shipped: 2026-04-15)

**Phases completed:** 7 phases, 9 plans, 3 tasks

**Key accomplishments:**

- One-liner:
- One-liner:
- Path:
- 1. [Rule 1 - Bug] failureCount/topErrorType declared after nodeStats useCallback
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- Status

---

## v1.3 Advanced Observability + Knowledge Depth (Shipped: 2026-04-15)

**Phases:** 12–17 | **Plans:** 8 | **Commits:** 46 | **+6,553 lines** across 38 files | **2 days (Apr 13–15)**

**Key accomplishments:**

1. **Projects Knowledge Ingestion (Phase 12)** — Nightly mem0 ingestion of Obsidian `projects/` with SHA-256 + mtime watermark + origin-tag triple-dedup; `agent_id=shared` with per-project metadata
2. **Skill Coverage Gaps (Phase 13)** — `/api/skills` `coverageGaps` cross-references `skill_usage` dict vs skill directory to surface 30-day-dark skills; live count on Cookbooks Flow node
3. **Skill Failure Rate (Phase 14)** — Stateful `failures.log` parser with `failuresByAgent` + `failuresByErrorType`; `disk_critical` excluded; graceful empty-state handling
4. **Skill Heatmap (Phase 15)** — 30-day CSS grid heatmap with `React.memo` cells, cell-local hover state, `contributionHistory` aggregate; rendered in NodeDetailPanel Skills node
5. **Per-Node Activity Panel (Phase 16)** — Keyword-map fan-out + `AbortController` cleanup + sparse-data indicator; closes FLOW-13 with 17 new tests
6. **Collapsible Node Groups (Phase 17)** — Pure `collapse-logic.ts` (3 fns, 24 tests) + `GroupBoxNode`; parentId coordinate migration for all group children; collapse/expand with aggregate health color

---
