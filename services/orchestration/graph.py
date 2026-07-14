"""LangGraph runtime for Phase 36 orchestration policy.

A2A/Memroos owns transport. This graph owns policy state, approval pauses,
and checkpoint resume semantics.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional, TypedDict

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, Interrupt, RetryPolicy, interrupt

# ORCHESTRATION_RETRY_LIMIT controls per-hop max_attempts for the RetryPolicy
# on the dispatch node. Default: 3 (matches RESEARCH.md ORCH-08 guidance).
# Bounded at 1 minimum to satisfy RetryPolicy's max_attempts > 0 invariant.
_RETRY_LIMIT = max(1, int(os.environ.get("ORCHESTRATION_RETRY_LIMIT", "3")))


class OrchestrationState(TypedDict, total=False):
    # Existing fields (Phase 36):
    runId: str
    taskSummary: str
    requiredCapability: str
    selectedAgentId: Optional[str]
    requiresApproval: bool
    status: str
    approvalDecision: str
    # New fields (Phase 70 — ORCH-08..10):
    hops: List[Dict[str, Any]]       # per-hop dispatch records [{agent_id, hop_id, attempts, ...}]
    currentHopIndex: int             # 0-based index into hops list
    rollbackPolicy: str              # "compensate_and_fail" | "fail_fast" | "ignore"
    rollbackReason: Optional[str]    # set by rollback_compensation node


def _interrupts_from_result(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw_interrupts = result.get("__interrupt__") or []
    interrupts: List[Dict[str, Any]] = []
    for raw in raw_interrupts:
        if isinstance(raw, Interrupt):
            interrupts.append({"id": raw.id, "value": raw.value})
        elif hasattr(raw, "id") and hasattr(raw, "value"):
            interrupts.append({"id": raw.id, "value": raw.value})
        else:
            interrupts.append({"id": None, "value": raw})
    return interrupts


def _public_state(result: Dict[str, Any]) -> Dict[str, Any]:
    interrupts = _interrupts_from_result(result)
    status = "waiting_for_approval" if interrupts else result.get("status", "dispatched")
    return {
        "runId": result.get("runId"),
        "taskSummary": result.get("taskSummary"),
        "requiredCapability": result.get("requiredCapability"),
        "selectedAgentId": result.get("selectedAgentId"),
        "status": status,
        "approvalDecision": result.get("approvalDecision"),
        "interrupts": interrupts,
        "checkpointed": True,
    }


def build_langgraph(checkpointer: SqliteSaver) -> Any:
    def route_policy(state: OrchestrationState) -> OrchestrationState:
        return {**state, "status": "routed"}

    def needs_approval(state: OrchestrationState) -> str:
        return "approval" if state.get("requiresApproval") else "dispatch"

    def approval(state: OrchestrationState) -> OrchestrationState:
        decision = interrupt(
            {
                "kind": "operator_approval",
                "runId": state.get("runId"),
                "taskSummary": state.get("taskSummary"),
                "selectedAgentId": state.get("selectedAgentId"),
            }
        )
        status = "approved" if decision == "approve" else "rejected"
        return {**state, "approvalDecision": decision, "status": status}

    def dispatch(state: OrchestrationState) -> OrchestrationState:
        # Advance currentHopIndex through the hops list for multi-hop support.
        # Per-hop attempt counts are tracked in orchestration_lineage.detail_json
        # keyed by lineage row id — NOT in orchestration_runs.attempts (RESEARCH.md Pitfall 3).
        hop_index = int(state.get("currentHopIndex") or 0)
        hops = list(state.get("hops") or [])
        return {**state, "status": "dispatched", "currentHopIndex": hop_index + 1, "hops": hops}

    def after_dispatch(state: OrchestrationState) -> str:
        hops = list(state.get("hops") or [])
        current = int(state.get("currentHopIndex") or 0)
        if hops and current < len(hops):
            return "dispatch"
        if state.get("rollbackReason") and state.get("rollbackPolicy") == "compensate_and_fail":
            return "rollback_compensation"
        return "end"

    def rollback_compensation(state: OrchestrationState) -> OrchestrationState:
        reason = state.get("rollbackReason") or "rollback_requested"
        return {**state, "status": "rollback_compensating", "rollbackReason": reason}

    graph = StateGraph(OrchestrationState)
    graph.add_node("route_policy", route_policy)
    graph.add_node("approval", approval)
    # RetryPolicy on dispatch: max_attempts reads from ORCHESTRATION_RETRY_LIMIT env var.
    # Exhausted budget surfaces as a terminal error — caller (engine) triggers compensation.
    # ORCH-08: per-hop retry budget configurable, not hardcoded.
    # Using retry_policy (not deprecated `retry`) per LangGraph 1.2 API.
    graph.add_node(
        "dispatch",
        dispatch,
        retry_policy=RetryPolicy(max_attempts=_RETRY_LIMIT, retry_on=[Exception]),
    )
    graph.add_node("rollback_compensation", rollback_compensation)
    graph.add_edge(START, "route_policy")
    graph.add_conditional_edges(
        "route_policy",
        needs_approval,
        {"approval": "approval", "dispatch": "dispatch"},
    )
    graph.add_edge("approval", END)
    graph.add_conditional_edges(
        "dispatch",
        after_dispatch,
        {"dispatch": "dispatch", "rollback_compensation": "rollback_compensation", "end": END},
    )
    graph.add_edge("rollback_compensation", END)
    return graph.compile(checkpointer=checkpointer)


class LangGraphRuntime:
    def __init__(self, db_path: str):
        self.db_path = db_path

    @contextmanager
    def _compiled(self) -> Iterator[Any]:
        with SqliteSaver.from_conn_string(self.db_path) as checkpointer:
            yield build_langgraph(checkpointer)

    def start(self, state: Dict[str, Any]) -> Dict[str, Any]:
        run_id = str(state["runId"])
        config = {"configurable": {"thread_id": run_id}}
        with self._compiled() as graph:
            result = graph.invoke(state, config=config)
        return _public_state(result)

    def resume(self, run_id: str, decision: str) -> Dict[str, Any]:
        if decision not in {"approve", "reject"}:
            raise ValueError("decision must be approve or reject")
        config = {"configurable": {"thread_id": run_id}}
        with self._compiled() as graph:
            result = graph.invoke(Command(resume=decision), config=config)
        return _public_state(result)

    def edit_and_checkpoint(self, run_id: str, patch: Dict[str, Any]) -> Dict[str, Any]:
        """Patch a paused HIL thread's checkpoint state without resuming.

        Uses as_node="route_policy" so that a subsequent resume() re-enters the
        needs_approval conditional and routes to dispatch rather than END.

        Security: as_node is hardcoded — never sourced from caller input (T-70-03).
        Caller must invoke resume() separately to continue graph execution.

        Returns {"before": {...}, "after": {...}} with pre- and post-edit values.
        """
        config = {"configurable": {"thread_id": run_id}}
        with self._compiled() as graph:
            current = graph.get_state(config)
            before = {k: current.values.get(k) for k in patch}
            # as_node="route_policy" ensures resume re-enters the needs_approval
            # conditional and dispatches when requiresApproval=False. Never use
            # as_node="approval" — approval's only successor is END. (HIL-P1)
            graph.update_state(config, patch, as_node="route_policy")
        return {"before": before, "after": patch}
