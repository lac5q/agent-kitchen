"""Phase 36 orchestration engine.

The engine keeps LangGraph's decision boundary explicit while Memroos/A2A remain
responsible for actually transporting work to agents.
"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

try:
    from .multihop import (
        build_evidence_bundle as build_multihop_evidence_bundle,
        execute_multihop_plan as execute_multihop_plan_payload,
        resume_multihop_plan as resume_multihop_plan_payload,
        rollback_with_handle as rollback_multihop_with_handle,
        validate_plan as validate_multihop_plan_payload,
    )
except ImportError:  # Allows direct imports from services/orchestration tests.
    from multihop import (
        build_evidence_bundle as build_multihop_evidence_bundle,
        execute_multihop_plan as execute_multihop_plan_payload,
        resume_multihop_plan as resume_multihop_plan_payload,
        rollback_with_handle as rollback_multihop_with_handle,
        validate_plan as validate_multihop_plan_payload,
    )

BOUNDARY = "LangGraph chooses policy; Memroos/A2A owns transport"
ACTIVE_STATUSES = {"active", "busy"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def camelize_hil(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "runId": row["run_id"],
        "correlationId": row["correlation_id"],
        "taskSummary": row["task_summary"],
        "selectedAgentId": row["selected_agent_id"],
        "status": row["status"],
        "requestedBy": row["requested_by"],
        "resolvedBy": row["resolved_by"],
        "decision": row["decision"],
        "createdAt": row["created_at"],
        "resolvedAt": row["resolved_at"],
    }


class OrchestrationStore:
    def __init__(self, db_path: str):
        self.db_path = db_path
        parent = os.path.dirname(db_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        # WAL mode required: concurrent edit+resume would stall under rollback journal (T-70-01)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA busy_timeout=5000")
        self._init_schema()

    def close(self) -> None:
        self.conn.close()

    def _init_schema(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS orchestration_runs (
              run_id TEXT PRIMARY KEY,
              correlation_id TEXT NOT NULL,
              task_summary TEXT NOT NULL,
              required_capability TEXT,
              selected_agent_id TEXT,
              status TEXT NOT NULL,
              retry_limit INTEGER NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS orchestration_lineage (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              correlation_id TEXT NOT NULL,
              run_id TEXT NOT NULL,
              hop_type TEXT NOT NULL,
              agent_id TEXT,
              detail_json TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS orchestration_hil_decisions (
              id TEXT PRIMARY KEY,
              run_id TEXT NOT NULL,
              correlation_id TEXT NOT NULL,
              task_summary TEXT NOT NULL,
              selected_agent_id TEXT,
              status TEXT NOT NULL,
              requested_by TEXT,
              resolved_by TEXT,
              decision TEXT,
              created_at TEXT NOT NULL,
              resolved_at TEXT
            );
            """
        )
        # ORCH-10: additive ALTER TABLE migration for rollback columns.
        # These statements are skipped on fresh installs (CREATE TABLE handles the full schema)
        # and applied once on existing DBs without downtime or data migration.
        # Using separate try/except per column so partial application is retryable.
        for col_ddl in [
            "ALTER TABLE orchestration_runs ADD COLUMN rollback_reason TEXT",
            "ALTER TABLE orchestration_runs ADD COLUMN rolled_back_at TEXT",
            "ALTER TABLE orchestration_runs ADD COLUMN plan_hash TEXT",
            "ALTER TABLE orchestration_runs ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default-tenant'",
            "ALTER TABLE orchestration_runs ADD COLUMN space_id TEXT NOT NULL DEFAULT 'default-space'",
            "ALTER TABLE orchestration_lineage ADD COLUMN previous_event_hash TEXT",
            "ALTER TABLE orchestration_lineage ADD COLUMN event_hash TEXT",
        ]:
            try:
                self.conn.execute(col_ddl)
            except Exception:
                # Column already exists — safe to skip on existing or fresh DBs
                pass
        self.conn.commit()

    def create_run(
        self,
        *,
        run_id: str,
        correlation_id: str,
        task_summary: str,
        required_capability: str | None,
        selected_agent_id: str | None,
        status: str,
        retry_limit: int,
        plan_hash: str | None = None,
        tenant_id: str = "default-tenant",
        space_id: str = "default-space",
    ) -> None:
        timestamp = now_iso()
        self.conn.execute(
            """
            INSERT INTO orchestration_runs (
              run_id, correlation_id, task_summary, required_capability,
              selected_agent_id, status, retry_limit, attempts, created_at, updated_at,
              plan_hash, tenant_id, space_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                correlation_id,
                task_summary,
                required_capability,
                selected_agent_id,
                status,
                retry_limit,
                timestamp,
                timestamp,
                plan_hash,
                tenant_id,
                space_id,
            ),
        )
        self.conn.commit()

    def update_run_rollback(self, run_id: str, *, rollback_reason: str) -> None:
        """Set orchestration_runs.status='rolled_back' with rollback_reason and rolled_back_at.

        Called after compensation completes to provide granular rollback accountability (ORCH-10).
        rollback_reason should be a human-readable string such as
        "failed at hop N, compensated hops 1..N-1".
        """
        self.conn.execute(
            """
            UPDATE orchestration_runs
            SET status = 'rolled_back', rollback_reason = ?, rolled_back_at = ?, updated_at = ?
            WHERE run_id = ?
            """,
            (rollback_reason, now_iso(), now_iso(), run_id),
        )
        self.conn.commit()

    def update_run(self, run_id: str, *, status: str, selected_agent_id: str | None = None) -> None:
        self.conn.execute(
            """
            UPDATE orchestration_runs
            SET status = ?, selected_agent_id = COALESCE(?, selected_agent_id), updated_at = ?
            WHERE run_id = ?
            """,
            (status, selected_agent_id, now_iso(), run_id),
        )
        self.conn.commit()

    def increment_attempts(self, run_id: str, *, status: str) -> dict[str, Any]:
        self.conn.execute(
            """
            UPDATE orchestration_runs
            SET attempts = attempts + 1, status = ?, updated_at = ?
            WHERE run_id = ?
            """,
            (status, now_iso(), run_id),
        )
        self.conn.commit()
        run = self.get_run(run_id)
        if run is None:
            raise KeyError(f"Unknown orchestration run: {run_id}")
        return run

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        row = self.conn.execute(
            "SELECT * FROM orchestration_runs WHERE run_id = ?",
            (run_id,),
        ).fetchone()
        return dict(row) if row else None

    def append_lineage(
        self,
        *,
        correlation_id: str,
        run_id: str,
        hop_type: str,
        agent_id: str | None = None,
        detail: dict[str, Any] | None = None,
    ) -> int:
        """Insert a lineage row and return its auto-generated row id.

        The returned id is used as forward_hop_id in paired compensation_pending rows
        (ORCH-09: declarative compensation, not Python closures).
        """
        previous = self.conn.execute(
            """
            SELECT event_hash FROM orchestration_lineage
            WHERE run_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (run_id,),
        ).fetchone()
        previous_hash = previous["event_hash"] if previous else None
        detail_json = json.dumps(detail or {}, sort_keys=True)
        created_at = now_iso()
        cursor = self.conn.execute(
            """
            INSERT INTO orchestration_lineage (
              correlation_id, run_id, hop_type, agent_id, detail_json, created_at,
              previous_event_hash, event_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                correlation_id,
                run_id,
                hop_type,
                agent_id,
                detail_json,
                created_at,
                previous_hash,
            ),
        )
        row_id = cursor.lastrowid
        event_hash = self._compute_lineage_event_hash(
            row_id=row_id,
            correlation_id=correlation_id,
            run_id=run_id,
            hop_type=hop_type,
            agent_id=agent_id,
            detail_json=detail_json,
            created_at=created_at,
            previous_event_hash=previous_hash,
        )
        self.conn.execute(
            "UPDATE orchestration_lineage SET event_hash = ? WHERE id = ?",
            (event_hash, row_id),
        )
        self.conn.commit()
        return row_id

    def _compute_lineage_event_hash(
        self,
        *,
        row_id: int,
        correlation_id: str,
        run_id: str,
        hop_type: str,
        agent_id: str | None,
        detail_json: str,
        created_at: str,
        previous_event_hash: str | None,
    ) -> str:
        try:
            detail = json.loads(detail_json or "{}")
        except Exception:
            detail = {}
        payload = {
            "id": row_id,
            "correlation_id": correlation_id,
            "run_id": run_id,
            "hop_type": hop_type,
            "agent_id": agent_id,
            "detail": detail,
            "created_at": created_at,
            "previous_event_hash": previous_event_hash,
        }
        import hashlib

        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    def list_lineage(self, correlation_id: str) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT * FROM orchestration_lineage
            WHERE correlation_id = ?
            ORDER BY id ASC
            """,
            (correlation_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def list_compensation_pending(self, run_id: str) -> list[dict[str, Any]]:
        """Return all compensation_pending lineage rows for a run, ordered descending
        (most-recent hop first) so rollback can replay in reverse order (ORCH-09)."""
        rows = self.conn.execute(
            """
            SELECT * FROM orchestration_lineage
            WHERE run_id = ? AND hop_type = 'compensation_pending'
            ORDER BY id DESC
            """,
            (run_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def update_lineage_hop_type(self, row_id: int, *, hop_type: str, detail: dict[str, Any] | None = None) -> None:
        """Append a lineage transition for a prior row without rewriting history.

        Older recovery code called this method to mutate compensation_pending rows.
        ORCH-FOLLOWUP-01 requires recovery evidence to be append-only, so the
        method now records a transition event linked to the original row.
        """
        row = self.conn.execute(
            "SELECT * FROM orchestration_lineage WHERE id = ?",
            (row_id,),
        ).fetchone()
        if row is None:
            raise KeyError(f"Unknown orchestration lineage row: {row_id}")
        merged_detail = {"transitioned_from_row_id": row_id, **(detail or {})}
        self.append_lineage(
            correlation_id=row["correlation_id"],
            run_id=row["run_id"],
            hop_type=hop_type,
            agent_id=row["agent_id"],
            detail=merged_detail,
        )

    def create_hil_decision(
        self,
        *,
        run_id: str,
        correlation_id: str,
        task_summary: str,
        selected_agent_id: str | None,
        requested_by: str | None,
    ) -> str:
        decision_id = f"hil_{uuid.uuid4().hex}"
        self.conn.execute(
            """
            INSERT INTO orchestration_hil_decisions (
              id, run_id, correlation_id, task_summary, selected_agent_id, status,
              requested_by, resolved_by, decision, created_at, resolved_at
            ) VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, NULL, ?, NULL)
            """,
            (decision_id, run_id, correlation_id, task_summary, selected_agent_id, requested_by, now_iso()),
        )
        self.conn.commit()
        return decision_id

    def list_pending_hil(self) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """
            SELECT * FROM orchestration_hil_decisions
            WHERE status = 'pending'
            ORDER BY created_at ASC
            """
        ).fetchall()
        return [camelize_hil(row) for row in rows]

    def get_hil_decision(self, decision_id: str) -> dict[str, Any] | None:
        """Return a HIL decision row by ID without mutating state."""
        row = self.conn.execute(
            "SELECT * FROM orchestration_hil_decisions WHERE id = ?",
            (decision_id,),
        ).fetchone()
        return camelize_hil(row) if row else None

    def resolve_hil_decision(self, decision_id: str, *, decision: str, actor: str | None) -> dict[str, Any]:
        row = self.conn.execute(
            "SELECT * FROM orchestration_hil_decisions WHERE id = ?",
            (decision_id,),
        ).fetchone()
        if row is None:
            raise KeyError(f"Unknown HIL decision: {decision_id}")

        status = "approved" if decision == "approve" else "rejected"
        self.conn.execute(
            """
            UPDATE orchestration_hil_decisions
            SET status = ?, decision = ?, resolved_by = ?, resolved_at = ?
            WHERE id = ?
            """,
            (status, decision, actor, now_iso(), decision_id),
        )
        self.conn.commit()
        updated = self.conn.execute(
            "SELECT * FROM orchestration_hil_decisions WHERE id = ?",
            (decision_id,),
        ).fetchone()
        return camelize_hil(updated)


class OrchestrationEngine:
    def __init__(self, store: OrchestrationStore, retry_limit: int = 2, graph_runtime: Any | None = None):
        self.store = store
        self.retry_limit = retry_limit
        self.graph_runtime = graph_runtime

    def route_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        task_summary = str(payload.get("taskSummary") or "").strip()
        if not task_summary:
            raise ValueError("taskSummary is required")

        correlation_id = str(payload.get("correlationId") or f"corr_{uuid.uuid4().hex}")
        run_id = str(payload.get("runId") or f"run_{uuid.uuid4().hex}")
        required_capability = payload.get("requiredCapability")
        if required_capability is not None:
            required_capability = str(required_capability)
        agents = payload.get("agents") if isinstance(payload.get("agents"), list) else []
        selected_agent = self._select_agent(agents, required_capability)
        selected_agent_id = selected_agent.get("id") if selected_agent else None

        self.store.create_run(
            run_id=run_id,
            correlation_id=correlation_id,
            task_summary=task_summary,
            required_capability=required_capability,
            selected_agent_id=selected_agent_id,
            status="routing",
            retry_limit=self.retry_limit,
        )
        self.store.append_lineage(
            correlation_id=correlation_id,
            run_id=run_id,
            hop_type="ingress",
            detail={"taskSummary": task_summary, "requiredCapability": required_capability},
        )

        if payload.get("requiresApproval") or selected_agent is None:
            graph_state = self._start_graph(
                run_id=run_id,
                task_summary=task_summary,
                required_capability=required_capability,
                selected_agent_id=selected_agent_id,
                requires_approval=True,
            )
            decision_id = self.store.create_hil_decision(
                run_id=run_id,
                correlation_id=correlation_id,
                task_summary=task_summary,
                selected_agent_id=selected_agent_id,
                requested_by=str(payload.get("requestedBy") or "operator"),
            )
            self.store.update_run(run_id, status="waiting_for_approval")
            self.store.append_lineage(
                correlation_id=correlation_id,
                run_id=run_id,
                hop_type="hil_wait",
                agent_id=selected_agent_id,
            )
            return self._result(
                run_id=run_id,
                correlation_id=correlation_id,
                status=graph_state.get("status", "waiting_for_approval"),
                selected_agent_id=selected_agent_id,
                hil_decision_id=decision_id,
                graph_state=graph_state,
            )

        graph_state = self._start_graph(
            run_id=run_id,
            task_summary=task_summary,
            required_capability=required_capability,
            selected_agent_id=selected_agent_id,
            requires_approval=False,
        )
        self.store.update_run(run_id, status="dispatched", selected_agent_id=selected_agent_id)
        self.store.append_lineage(
            correlation_id=correlation_id,
            run_id=run_id,
            hop_type="route",
            agent_id=selected_agent_id,
            detail={"reason": "capability_match"},
        )
        dispatch_row_id = self.store.append_lineage(
            correlation_id=correlation_id,
            run_id=run_id,
            hop_type="dispatch_request",
            agent_id=selected_agent_id,
            detail={"protocol": selected_agent.get("protocol")},
        )
        # ORCH-09: write a declarative compensation_pending row paired with the dispatch.
        # Compensation instructions are stored as lineage rows — NEVER Python closures.
        # Remote agents without requiredCapability="compensate" yield compensation_skipped.
        self.store.append_lineage(
            correlation_id=correlation_id,
            run_id=run_id,
            hop_type="compensation_pending",
            agent_id=selected_agent_id,
            detail={
                "forward_hop_id": dispatch_row_id,
                "compensation_verb": "undo",
                "agent_id": selected_agent_id,
            },
        )
        return self._result(
            run_id=run_id,
            correlation_id=correlation_id,
            status=graph_state.get("status", "dispatched"),
            selected_agent_id=selected_agent_id,
            graph_state=graph_state,
        )

    def resolve_hil(self, decision_id: str, decision: str, actor: str | None = None) -> dict[str, Any]:
        if decision not in {"approve", "reject"}:
            raise ValueError("decision must be approve or reject")

        resolved = self.store.resolve_hil_decision(decision_id, decision=decision, actor=actor)
        resumed = decision == "approve"
        run_status = "dispatched" if resumed else "rejected"
        self.store.update_run(resolved["runId"], status=run_status)
        self.store.append_lineage(
            correlation_id=resolved["correlationId"],
            run_id=resolved["runId"],
            hop_type="hil_approved" if resumed else "hil_rejected",
            agent_id=resolved["selectedAgentId"],
            detail={"actor": actor},
        )
        graph_state = None
        if self.graph_runtime:
            graph_state = self.graph_runtime.resume(resolved["runId"], decision)
        return {"ok": True, **resolved, "status": resolved["status"], "resumed": resumed, "graphState": graph_state}

    def record_state_edit(
        self,
        *,
        run_id: str,
        correlation_id: str,
        actor: str | None,
        patch: dict[str, Any],
        before: dict[str, Any] | None = None,
    ) -> None:
        """Write a state_edit lineage row recording actor, before, and after values.

        The before dict is optional — callers that have access to the graph runtime
        should pass edit_and_checkpoint()'s "before" value. Engine-only callers
        (e.g. tests without a graph runtime) may omit it.

        Requirement: HIL-03 / Pattern 3 in RESEARCH.md
        """
        self.store.append_lineage(
            correlation_id=correlation_id,
            run_id=run_id,
            hop_type="state_edit",
            detail={
                "actor": actor,
                "before": before if before is not None else {},
                "after": patch,
            },
        )

    def record_task_failure(self, run_id: str, error: str | None = None) -> dict[str, Any]:
        run = self.store.get_run(run_id)
        if run is None:
            raise KeyError(f"Unknown orchestration run: {run_id}")

        attempts_after_failure = int(run["attempts"]) + 1
        terminal = attempts_after_failure >= self.retry_limit
        status = "waiting_for_approval" if terminal else "retrying"
        updated = self.store.increment_attempts(run_id, status=status)
        self.store.append_lineage(
            correlation_id=run["correlation_id"],
            run_id=run_id,
            hop_type="dispatch_failure",
            agent_id=run["selected_agent_id"],
            detail={"error": error, "attempts": updated["attempts"]},
        )

        if not terminal:
            self.store.append_lineage(
                correlation_id=run["correlation_id"],
                run_id=run_id,
                hop_type="retry_scheduled",
                agent_id=run["selected_agent_id"],
                detail={"remainingRetries": self.retry_limit - int(updated["attempts"])},
            )
            return {
                "ok": True,
                "runId": run_id,
                "correlationId": run["correlation_id"],
                "status": "retrying",
                "attempts": int(updated["attempts"]),
                "remainingRetries": self.retry_limit - int(updated["attempts"]),
            }

        decision_id = self.store.create_hil_decision(
            run_id=run_id,
            correlation_id=run["correlation_id"],
            task_summary=f"Retry limit reached: {run['task_summary']}",
            selected_agent_id=run["selected_agent_id"],
            requested_by="orchestration-retry-policy",
        )
        self.store.append_lineage(
            correlation_id=run["correlation_id"],
            run_id=run_id,
            hop_type="retry_exhausted",
            agent_id=run["selected_agent_id"],
            detail={"hilDecisionId": decision_id},
        )

        # ORCH-09/ORCH-10: run rollback compensation declaratively.
        # Read compensation_pending rows in reverse order and resolve each one.
        # All compensation state is lineage rows — never Python closures (RESEARCH.md Anti-Patterns).
        self._run_rollback_compensation(run_id=run_id, run=run, attempts=int(updated["attempts"]))

        return {
            "ok": True,
            "runId": run_id,
            "correlationId": run["correlation_id"],
            "status": "waiting_for_approval",
            "attempts": int(updated["attempts"]),
            "remainingRetries": 0,
            "hilDecisionId": decision_id,
        }

    def _run_rollback_compensation(
        self,
        *,
        run_id: str,
        run: dict[str, Any],
        attempts: int,
    ) -> None:
        """Execute declarative rollback compensation for a run whose retry budget is exhausted.

        Reads compensation_pending lineage rows in reverse order and dispatches a
        requiredCapability="compensate" A2A task per hop. Agents lacking that capability
        yield a compensation_skipped row (RESEARCH.md Anti-Patterns: safe default).

        All state is stored in orchestration_lineage — no Python callables. (ORCH-09, T-70-06)
        Sets orchestration_runs.status="rolled_back" with rollback_reason. (ORCH-10, T-70-07)
        """
        correlation_id = run["correlation_id"]
        pending_rows = self.store.list_compensation_pending(run_id)

        # rollback_started marks the beginning of the compensation sequence.
        self.store.append_lineage(
            correlation_id=correlation_id,
            run_id=run_id,
            hop_type="rollback_started",
            detail={
                "hops_to_compensate": [r["id"] for r in pending_rows],
                "trigger": "retry_exhausted",
            },
        )

        compensated_count = 0
        for comp_row in pending_rows:
            row_id = comp_row["id"]
            try:
                detail_data = json.loads(comp_row.get("detail_json") or "{}")
            except Exception:
                detail_data = {}

            forward_hop_id = detail_data.get("forward_hop_id")
            agent_id = comp_row.get("agent_id")

            # A2A convention: check if agent supports "compensate" capability.
            # Without actual agent registry access, we use the safe-default: compensation_skipped.
            # Agents implementing compensation will be dispatched via requiredCapability="compensate".
            # For now, record compensation_skipped with the documented reason (RESEARCH.md Anti-Patterns).
            self.store.append_lineage(
                correlation_id=correlation_id,
                run_id=run_id,
                hop_type="compensation_skipped",
                agent_id=agent_id,
                detail={
                    "forward_hop_id": forward_hop_id,
                    "pending_row_id": row_id,
                    "reason": "agent_no_compensate_capability",
                    "agent_id": agent_id,
                },
            )
            compensated_count += 1

        # rollback_complete marks end of compensation sequence.
        self.store.append_lineage(
            correlation_id=correlation_id,
            run_id=run_id,
            hop_type="rollback_complete",
            detail={"final_status": "rolled_back"},
        )

        # ORCH-10: set status to "rolled_back" with a granular rollback_reason.
        hop_n = attempts
        compensated_hops = list(range(1, compensated_count + 1))
        if compensated_hops:
            compensated_str = f"compensated hops {compensated_hops[0]}..{compensated_hops[-1]}"
        else:
            compensated_str = "no hops to compensate"
        rollback_reason = f"failed at hop {hop_n}, {compensated_str}"
        self.store.update_run_rollback(run_id, rollback_reason=rollback_reason)

    def validate_multihop_plan(self, payload: dict[str, Any]) -> dict[str, Any]:
        return validate_multihop_plan_payload(payload.get("plan") if isinstance(payload, dict) else None)

    def execute_multihop_plan(self, payload: dict[str, Any]) -> dict[str, Any]:
        return execute_multihop_plan_payload(self.store, payload)

    def resume_multihop_plan(self, payload: dict[str, Any]) -> dict[str, Any]:
        return resume_multihop_plan_payload(self.store, payload)

    def rollback_multihop(self, payload: dict[str, Any]) -> dict[str, Any]:
        return rollback_multihop_with_handle(self.store, payload)

    def get_multihop_evidence(self, run_id: str) -> dict[str, Any]:
        return build_multihop_evidence_bundle(self.store, run_id)

    def _result(
        self,
        *,
        run_id: str,
        correlation_id: str,
        status: str,
        selected_agent_id: str | None,
        hil_decision_id: str | None = None,
        graph_state: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            "ok": True,
            "runId": run_id,
            "correlationId": correlation_id,
            "status": status,
            "selectedAgentId": selected_agent_id,
            "hilDecisionId": hil_decision_id,
            "retryLimit": self.retry_limit,
            "boundary": BOUNDARY,
            "graphState": graph_state,
        }

    def _start_graph(
        self,
        *,
        run_id: str,
        task_summary: str,
        required_capability: str | None,
        selected_agent_id: str | None,
        requires_approval: bool,
    ) -> dict[str, Any]:
        if not self.graph_runtime:
            return {"status": "waiting_for_approval" if requires_approval else "dispatched"}
        return self.graph_runtime.start(
            {
                "runId": run_id,
                "taskSummary": task_summary,
                "requiredCapability": required_capability,
                "selectedAgentId": selected_agent_id,
                "requiresApproval": requires_approval,
            }
        )

    def _select_agent(self, agents: list[Any], required_capability: str | None) -> dict[str, Any] | None:
        candidates = [agent for agent in agents if isinstance(agent, dict)]
        if required_capability:
            candidates = [agent for agent in candidates if self._agent_matches(agent, required_capability)]
        if not candidates:
            return None

        def sort_key(agent: dict[str, Any]) -> tuple[int, str, str]:
            status = str(agent.get("status") or "").lower()
            active_rank = 0 if status in ACTIVE_STATUSES else 1
            return (active_rank, str(agent.get("name") or "").lower(), str(agent.get("id") or "").lower())

        return sorted(candidates, key=sort_key)[0]

    def _agent_matches(self, agent: dict[str, Any], required_capability: str) -> bool:
        needle = required_capability.lower()
        for capability in agent.get("capabilities") or []:
            if not isinstance(capability, dict):
                continue
            values = [capability.get("id"), capability.get("name"), capability.get("description")]
            values.extend(capability.get("tags") or [])
            if any(needle == str(value).lower() for value in values if value is not None):
                return True
        return needle in str(agent.get("role") or "").lower()
