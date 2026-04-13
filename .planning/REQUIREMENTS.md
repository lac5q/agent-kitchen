# Requirements: Agent Kitchen v1.3

**Defined:** 2026-04-13
**Core Value:** Every agent and knowledge system is visible, connected, and self-improving — so Luis can see what's happening and fix problems before they compound.

## v1.3 Requirements

### FLOW — Advanced Flow Diagram UX

- [ ] **FLOW-12**: User can collapse an inactive agent node group in the Flow diagram to a single summary box, and expand it again — reducing visual clutter when agents are dormant
  - _Scope: GroupBoxNode becomes interactive with toggle; child nodes use `parentId` + `extent:"parent"` with recalculated relative coordinates; collapse uses `hidden:true` on children (not array removal) to preserve edge state_

- [ ] **FLOW-13**: User can see the last 10 activity events for a specific node inline when that node is selected in the Flow diagram
  - _Scope: Extend existing `NodeDetailPanel` (already filters events by nodeId, shows up to 15); trim to 10, tighten layout, add AbortController cleanup; sidebar enhancement (not canvas popover). Note: event coverage sparse for nodes without keyword mapping — document, don't fake._

### SKILL — Extended Skill Tracking

- [ ] **SKILL-06**: Dashboard shows skill failure rate — count of failed skill invocations by agent and error type, sourced from `failures.log`
  - _Scope: Stateful log parser required (multi-line tracebacks in log); two-commit sequence: parser+data route first, then UI. Attribution by agent_id/error_type (not per-skill — `failures.log` has no skill name field). Filter out `disk_critical` noise events._

- [ ] **SKILL-07**: Dashboard shows skills with zero usage in the last 30 days (coverage gaps report), sourced from `~/.openclaw/skill-sync-state.json`'s `skill_usage` dict
  - _Scope: Read `skill_usage` timestamps from state file, cross-reference against full skill list from `readdir`, surface as a panel in the Cookbooks node or Library view_

- [ ] **SKILL-08**: Dashboard shows a per-skill contribution heatmap visualizing sync activity over time
  - _Scope: Contribution-over-time from `skill-contributions.jsonl` (Scope A — not invocation telemetry, which doesn't exist yet). CSS grid implementation, no new chart library. 30-day view, daily columns._

### KNOW — Extended Knowledge Sync

- [ ] **KNOW-08**: Obsidian `projects/` subdirectory markdown files are ingested into mem0 nightly alongside daily journals
  - _Scope: New `projects-to-mem0.py` sibling script (not extending obsidian-to-mem0.py to avoid guard contamination). Follows same 3-guard pattern: origin tag + content-hash dedup + mtime watermark per project dir. Activated as Step 7 in `knowledge-curator.sh`._

- [ ] **KNOW-09**: Each `projects/` subdirectory is ingested with consistent agent_id routing and project metadata tagging
  - _Scope: Use `agent_id="shared"` (not per-project namespaces — avoids 429 quota errors from 46+ agent_id namespaces). Tag memories with `metadata.project=<dirname>` for filtering. Per-project overrides dict for exceptions._

## Future Requirements (deferred to v1.4+)

### SKILL — Deep Invocation Telemetry
- **SKILL-09**: Per-skill invocation failure rate (blocked — requires skill name field in failures.log or new invocation logging)
- **SKILL-10**: Real skill usage heatmap from invocation telemetry (blocked — no invocation logging exists yet)

### FLOW — Enhanced Node Interaction
- **FLOW-14**: On-node canvas popover for activity (FLOW-13 Scope B — higher complexity than sidebar enhancement)

### KNOW — Advanced Routing
- **KNOW-10**: Per-project agent_id routing once quota architecture is designed (deferred from KNOW-09 — needs mem0 namespace scaling solution)

## Out of Scope

| Feature | Reason |
|---------|--------|
| qmd embed anywhere | Forbidden per architecture — all semantic search via Qdrant Cloud |
| execSync/exec in any new code | Security constraint — use execFileSync or pure fs/promises |
| Per-skill invocation heatmap | No invocation telemetry exists — deferred to v1.4 |
| Per-project mem0 agent_id namespaces | 46+ namespaces triggers 429 quota errors; use shared + metadata |
| Cognee-OpenClaw for Gwen | Still conflicts with Qdrant/mem0 architecture |
| Write operations from UI | Read-only dashboard — no mutations |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FLOW-12 | Phase ? | Planned |
| FLOW-13 | Phase ? | Planned |
| SKILL-06 | Phase ? | Planned |
| SKILL-07 | Phase ? | Planned |
| SKILL-08 | Phase ? | Planned |
| KNOW-08 | Phase ? | Planned |
| KNOW-09 | Phase ? | Planned |

**Coverage:**
- v1.3 requirements: 7 total
- Mapped to phases: 0 (roadmap pending)
- Unmapped: 7 (to be filled by roadmapper)

---
*Requirements defined: 2026-04-13*
*Last updated: 2026-04-13 after v1.3 research synthesis*
