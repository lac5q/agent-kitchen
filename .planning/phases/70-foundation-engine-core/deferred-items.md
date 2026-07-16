# Deferred Items — Phase 70 Foundation Engine Core

Items discovered during plan execution that are out of scope for the originating plan.
These must be addressed in a future plan before the deferred capability is considered complete.

Backlog status: promoted to `.planning/REQUIREMENTS.md` as `ORCH-FOLLOWUP-01` and to `.planning/ROADMAP.md` under Future Milestone Priority / Later Ideas.

**Update (2026-07-16):** `ORCH-FOLLOWUP-01` residual gaps **DEFERRED-70-03-C** and **DEFERRED-70-03-D** are closed. Graph topology items **A/B** were already present in `services/orchestration/graph.py` (multi-hop dispatch loop + `rollback_compensation` node). Remaining limitation: default A2A compensate transport is a local acknowledged receipt unless `compensate_dispatcher` is injected.

---

## From 70-03: Multi-hop retry + declarative rollback

### DEFERRED-70-03-A: rollback_compensation LangGraph graph node — CLOSED (graph.py)

- **Originating plan:** 70-03, Task 2
- **Plan artifact spec:** `graph.py` must provide "Multi-hop topology with RetryPolicy on dispatch + rollback_compensation node + expanded OrchestrationState"
- **Current state (2026-07-16):** `build_langgraph()` includes `rollback_compensation` node and conditional routing from `after_dispatch` when `rollbackReason` + `compensate_and_fail` are set. Engine-side compensation still runs in `_run_rollback_compensation` for lineage accountability.
- **Remaining note:** Full move of engine compensation *into* the graph node action (checkpoint-visible compensation state) is optional polish; lineage + DB rows remain the source of truth.

### DEFERRED-70-03-B: Multi-hop chain topology in graph.py — CLOSED (graph.py)

- **Originating plan:** 70-03, Task 1 objective
- **Plan spec:** "Expand the single-hop orchestration graph into a multi-hop chain"
- **Current state (2026-07-16):** `after_dispatch` loops `dispatch → dispatch` while `currentHopIndex < len(hops)`. Covered by `test_multihop_graph_loops_and_exposes_rollback_compensation_node` (requires langgraph).

### DEFERRED-70-03-C: Per-hop attempt tracking in detail_json["attempts_per_hop"] — CLOSED 2026-07-16

- **Originating plan:** 70-03, Task 1 done criteria
- **RESEARCH.md reference:** Pitfall 3 — "Per-hop retry counts must live in orchestration_lineage.detail_json['attempts_per_hop'], NOT in orchestration_runs.attempts"
- **Resolution:** `record_task_failure(..., hop_lineage_id=)` increments `detail_json["attempts_per_hop"][lineage_row_id]` on `dispatch_failure` / `retry_scheduled` / `retry_exhausted` rows. `orchestration_runs.attempts` remains the top-level total. Test: `test_attempts_per_hop_are_tracked_separately_from_run_attempts`.

### DEFERRED-70-03-D: A2A compensate dispatch in _run_rollback_compensation — CLOSED 2026-07-16

- **Originating plan:** 70-03, Task 2 behavior spec
- **Plan spec:** "Each compensation dispatches an A2A task with requiredCapability='compensate'; agents without that capability yield a compensation_skipped row"
- **Resolution:** `_run_rollback_compensation` resolves agent capabilities from the in-process registry (or the `agent_capabilities` snapshot on `compensation_pending`) and:
  1. dispatches via `compensate_dispatcher` → `compensation_done` on acknowledgement
  2. writes `compensation_skipped` with `agent_no_compensate_capability` (or dispatch-not-acknowledged) when compensate is unavailable
- Multi-hop plan engine (`multihop._compensate_committed`) records `compensation_dispatched` before `compensation_committed` when a compensate target exists, and skips honestly when capability/action is missing.
- **Remaining limitation:** Default dispatcher emits a local acknowledged receipt (`transport: local_receipt`). Inject a live A2A transport with `OrchestrationEngine(compensate_dispatcher=...)` for remote agents.
