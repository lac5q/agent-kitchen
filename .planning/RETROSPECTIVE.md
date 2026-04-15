# Retrospective: Agent Kitchen

---

## Milestone: v1.3 — Advanced Observability + Knowledge Depth

**Shipped:** 2026-04-15
**Phases:** 6 (12–17) | **Plans:** 8 | **Commits:** 46 | **+6,553 lines** | **2 days**

### What Was Built

- Projects/ mem0 ingestion with triple-dedup (Phase 12)
- Skill coverage gaps + failure rate on `/api/skills` (Phases 13–14)
- 30-day CSS grid heatmap with React.memo cells (Phase 15)
- Per-node activity panel with AbortController + keyword map (Phase 16)
- Collapsible group nodes with pure collapse-logic module (Phase 17)

### What Worked

- **TDD discipline held** — every phase started with RED tests, made them GREEN, then integrated. Zero regressions introduced.
- **Pure modules** — `collapse-logic.ts` and `node-keyword-map.ts` as side-effect-free modules made testing fast and refactoring safe.
- **Two-wave approach for Phase 17** — splitting parentId migration (wave 1) from collapse toggle (wave 2) avoided a complex, hard-to-test single change.
- **Incremental API extension** — adding fields to `/api/skills` rather than new routes kept the frontend polling pattern simple.

### What Was Inefficient

- **ROADMAP/STATE not updated by worktree merges** — 6 phases were completed in worktrees but planning docs weren't updated on merge. Required manual reconciliation at milestone close. Cost: ~1 session of confusion.
- **`collections.config.json` missing `knowledge` collection** — went unnoticed until user spotted it in the UI. Should be caught by a Library smoke test.
- **gsd-tools one-liner extraction failed** — SUMMARY.md format didn't match expected `one_liner` field pattern; CLI extracted garbage. Accomplishments had to be reconstructed manually.

### Patterns Established

- Group children should always use `parentId` + `extent:'parent'` in React Flow — never absolute coordinates for grouped nodes.
- Triple-dedup pattern (content-hash + mtime watermark + origin tag) is the standard for any mem0 ingestion script.
- `AbortController` is mandatory in any `useEffect` that fetches — enforced in NodeDetailPanel, carry forward.

### Key Lessons

- **Worktree merges delete planning files** — always run `git diff main..HEAD --name-only | grep .planning` after merge to catch dropped docs.
- **`collections.config.json` is a manifest** — any new knowledge collection added to QMD must also be added here or the Library undercounts.
- **Skills features are in The Flow, not a sidebar** — users expect a dedicated `/skills` page; the Cookbooks node in canvas is not discoverable enough. Add to v1.4.

---

## Milestone: v1.4 — Cookbooks

**Shipped:** 2026-04-15
**Phases:** 1 (Phase 18) | **Plans:** 1

### What Was Built

- Dedicated `/cookbooks` sidebar page with gaps/health panel, 30-day heatmap, full 254-skill list
- Real model usage tracking in The Ledger — reads `~/.claude/projects/**/*.jsonl`, aggregates per model with dedup by `requestId`
- Fixed GitNexus API field names (meta.stats.nodes/edges/communities)

### What Worked

- **Reuse over rebuild** — SkillHeatmap component dropped in without modification; `/api/skills` extended with one new field rather than a new endpoint

### What Was Inefficient

- Phase 18 had no formal GSD artifacts (PLAN.md/SUMMARY.md) — shipped directly then retroactively documented at close

### Key Lessons

- Model mix data was always available in JSONL session logs — just needed a readline parser; no external telemetry required
- `qwen3.5-plus` appearing in Claude Code JSONL suggests some sessions route through non-Claude models

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Days | LOC Added | Key Theme |
|-----------|--------|-------|------|-----------|-----------|
| v1.1 | 5 | 12 | 3 | ~3,000 | Knowledge architecture foundations |
| v1.2 | 6 | 8 | 2 | ~4,500 | Live data + sync pipelines |
| v1.3 | 6 | 8 | 2 | +6,553 | Observability depth + canvas UX |
| v1.4 | 1 | 1 | 1 | ~500 | Cookbooks page + model usage tracking |
