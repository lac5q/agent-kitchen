"""FastAPI facade for the Phase 36 orchestration service."""

from __future__ import annotations

import os
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

try:
    from .engine import OrchestrationEngine, OrchestrationStore
    from .graph import LangGraphRuntime
except ImportError:  # Allows `uvicorn app:app` from services/orchestration.
    from engine import OrchestrationEngine, OrchestrationStore
    from graph import LangGraphRuntime


def get_engine() -> OrchestrationEngine:
    db_path = os.environ.get("ORCHESTRATION_DB_PATH", "data/orchestration.db")
    retry_limit = int(os.environ.get("ORCHESTRATION_RETRY_LIMIT", "2"))
    return OrchestrationEngine(
        OrchestrationStore(db_path),
        retry_limit=retry_limit,
        graph_runtime=LangGraphRuntime(db_path),
    )


app = FastAPI(title="MemroOS Orchestration", version="0.1.0")


class RouteTaskRequest(BaseModel):
    taskSummary: str = Field(min_length=1)
    requiredCapability: Optional[str] = None
    correlationId: Optional[str] = None
    runId: Optional[str] = None
    requiresApproval: bool = False
    requestedBy: Optional[str] = None
    agents: list[dict[str, Any]] = Field(default_factory=list)


class ResolveHilRequest(BaseModel):
    decision: str
    actor: Optional[str] = None


class HilEditRequest(BaseModel):
    """Schema-validated edit payload for PATCH /hil/{id}/edit.

    Fields mirror the editable subset of OrchestrationState.
    Immutable fields (runId) and system-managed fields (status, approvalDecision)
    are excluded. unknown keys are rejected with HTTP 422 (extra="forbid").

    Security: T-70-02 — unknown keys rejected before update_state is called.
    """

    model_config = ConfigDict(extra="forbid")

    taskSummary: Optional[str] = None
    requiredCapability: Optional[str] = None
    selectedAgentId: Optional[str] = None
    requiresApproval: Optional[bool] = None


class TaskFailureRequest(BaseModel):
    error: Optional[str] = None


class MultihopPlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: Optional[dict[str, Any]] = None


class MultihopExecuteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: Optional[dict[str, Any]] = None
    runId: Optional[str] = None
    correlationId: Optional[str] = None
    crashAfterStepId: Optional[str] = None
    federationProof: Optional[dict[str, Any]] = None


class MultihopResumeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: Optional[dict[str, Any]] = None
    federationProof: Optional[dict[str, Any]] = None


class MultihopRollbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    handle: str
    tenantId: Optional[str] = None
    spaceId: Optional[str] = None
    currentResourceVersion: Optional[str] = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true", "service": "orchestration"}


@app.post("/tasks/route")
def route_task(request: RouteTaskRequest) -> dict[str, Any]:
    engine = get_engine()
    try:
        return engine.route_task(request.model_dump())
    finally:
        engine.store.close()


@app.get("/hil")
def list_hil() -> dict[str, Any]:
    engine = get_engine()
    try:
        return {"ok": True, "decisions": engine.store.list_pending_hil()}
    finally:
        engine.store.close()


@app.post("/hil/{decision_id}/resolve")
def resolve_hil(decision_id: str, request: ResolveHilRequest) -> dict[str, Any]:
    engine = get_engine()
    try:
        return engine.resolve_hil(decision_id, request.decision, request.actor)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        engine.store.close()


@app.patch("/hil/{decision_id}/edit")
def edit_hil(
    decision_id: str,
    request: HilEditRequest,
    x_operator_id: Optional[str] = Header(default=None, alias="x-operator-id"),
) -> dict[str, Any]:
    """Patch a paused HIL thread's state fields before resuming.

    Validates the edit payload against HilEditRequest (extra keys → 422).
    Accepts edits only when the run status is "waiting_for_approval" (status CAS,
    T-70-05 mitigation). On success, writes a state_edit lineage row and returns
    {ok: true, editedFields: [...]}.

    Security note: The Python service port is internal; the TS proxy (Plan 05) adds
    authorizeRegistryWrite. This endpoint is consistent with existing /hil/{id}/resolve
    which also has no Python-level auth guard.
    """
    engine = get_engine()
    try:
        hil_decision = engine.store.get_hil_decision(decision_id)
        if hil_decision is None:
            raise HTTPException(status_code=404, detail=f"Unknown HIL decision: {decision_id}")

        run_id = hil_decision["runId"]
        correlation_id = hil_decision["correlationId"]

        # Status CAS: accept edit only when run is waiting for approval (T-70-05)
        run = engine.store.get_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail=f"Unknown orchestration run: {run_id}")
        if run["status"] != "waiting_for_approval":
            raise HTTPException(
                status_code=409,
                detail=f"Cannot edit run '{run_id}' in status '{run['status']}' — must be 'waiting_for_approval'",
            )

        # Build the patch dict from non-None editable fields
        patch = {k: v for k, v in request.model_dump().items() if v is not None}

        # Actor identity from x-operator-id header; falls back to "operator"
        actor = x_operator_id or "operator"

        # Patch the LangGraph checkpoint (edit without resuming)
        before: dict[str, Any] = {}
        if engine.graph_runtime and patch:
            edit_result = engine.graph_runtime.edit_and_checkpoint(run_id, patch)
            before = edit_result.get("before", {})

        # Write state_edit audit lineage row (HIL-03)
        if patch:
            engine.record_state_edit(
                run_id=run_id,
                correlation_id=correlation_id,
                actor=actor,
                patch=patch,
                before=before,
            )

        return {"ok": True, "editedFields": list(patch.keys())}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        engine.store.close()


@app.post("/plans/validate")
def validate_multihop_plan(request: MultihopPlanRequest) -> dict[str, Any]:
    engine = get_engine()
    try:
        return engine.validate_multihop_plan(request.model_dump())
    finally:
        engine.store.close()


@app.post("/plans/execute")
def execute_multihop_plan(request: MultihopExecuteRequest) -> dict[str, Any]:
    engine = get_engine()
    try:
        return engine.execute_multihop_plan(request.model_dump())
    finally:
        engine.store.close()


@app.post("/runs/{run_id}/resume")
def resume_multihop_plan(run_id: str, request: MultihopResumeRequest) -> dict[str, Any]:
    engine = get_engine()
    try:
        payload = request.model_dump()
        payload["runId"] = run_id
        return engine.resume_multihop_plan(payload)
    finally:
        engine.store.close()


@app.post("/runs/{run_id}/rollback")
def rollback_multihop_run(run_id: str, request: MultihopRollbackRequest) -> dict[str, Any]:
    engine = get_engine()
    try:
        payload = request.model_dump()
        payload["runId"] = run_id
        return engine.rollback_multihop(payload)
    finally:
        engine.store.close()


@app.get("/runs/{run_id}/evidence")
def get_multihop_evidence(run_id: str) -> dict[str, Any]:
    engine = get_engine()
    try:
        result = engine.get_multihop_evidence(run_id)
        if not result.get("bundle"):
            raise HTTPException(status_code=404, detail="run not found")
        return result
    finally:
        engine.store.close()


@app.post("/tasks/{run_id}/failures")
def record_task_failure(run_id: str, request: TaskFailureRequest) -> dict[str, Any]:
    engine = get_engine()
    try:
        return engine.record_task_failure(run_id, request.error)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    finally:
        engine.store.close()
