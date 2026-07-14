"""Deterministic multi-hop orchestration planning, recovery, and evidence.

This module is intentionally self-contained. It treats actions as declared
receipts so tests and local API probes can verify governance behavior without
calling external agents or services.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

SUCCESS_STATUS = "completed"
NON_SUCCESS_STATUSES = {
    "plan_invalid",
    "policy_denied",
    "identity_denied",
    "freshness_denied",
    "dependency_unmet",
    "verification_failed",
    "step_failed",
    "timeout",
    "timeout_uncommitted",
    "unresolved_commit",
    "compensation_failed",
    "rollback_diverged",
    "rollback_handle_invalid",
    "rollback_handle_expired",
    "rollback_handle_consumed",
    "rollback_scope_denied",
    "checkpoint_paused",
    "checkpoint_expired",
    "changed_plan_denied",
    "missing_receipt",
    "evidence_tampered",
    "federation_proof_denied",
    "federation_proof_unavailable",
}
RECOVERY_STATUSES = {
    "checkpoint_paused",
    "rollback_completed",
    "rollback_diverged",
    "compensated",
    "compensation_failed",
    "unresolved_commit",
}
SAFE_REDACT_KEYS = ("summary", "payload", "secret", "token", "body", "content", "raw", "outcome")
ROLLBACK_SECRET = os.environ.get("ORCHESTRATION_ROLLBACK_HANDLE_SECRET", "memroos-local-rollback-handle-v1")
FEDERATION_PROOF_SECRET = os.environ.get("ORCHESTRATION_FEDERATION_PROOF_SECRET")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256(value: Any) -> str:
    if isinstance(value, str):
        payload = value
    else:
        payload = _canonical(value)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _short_hash(value: Any) -> str:
    return _sha256(value)[:16]


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _is_record(value: Any) -> bool:
    return isinstance(value, dict)


def _as_record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {"true", "yes", "1", "allow", "passed", "fresh"}
    return bool(value)


def _federation_proof(plan: dict[str, Any], payload: dict[str, Any]) -> tuple[dict[str, str] | None, str | None]:
    """Accept only the signed, safe reference envelope emitted by the TS
    bridge. Caller-provided federation hashes without a valid signature are
    never used as orchestration authority."""
    raw = payload.get("federationProof") or payload.get("federation_proof")
    if raw is None:
        return None, None
    if not isinstance(raw, dict) or not FEDERATION_PROOF_SECRET:
        return None, "federation_proof_unavailable"
    required = ("artifactId", "artifactHash", "federationRunId", "packHash", "policyHash", "ontologyHash", "tenantId", "spaceId", "signature")
    if any(not _string(raw.get(key)) for key in required):
        return None, "federation_proof_denied"
    reference = {key: str(raw[key]) for key in required if key != "signature"}
    canonical = _canonical({key: reference[key] for key in sorted(reference)})
    expected = hmac.new(FEDERATION_PROOF_SECRET.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, str(raw["signature"])):
        return None, "federation_proof_denied"
    scope = _scope_from(plan, {})
    if reference["tenantId"] != scope["tenantId"] or reference["spaceId"] != scope["spaceId"]:
        return None, "federation_proof_denied"
    return {
        **reference,
        "proofHash": _sha256(reference),
    }, None


def _federation_detail(graph: dict[str, Any]) -> dict[str, str]:
    proof = graph.get("federationProof")
    if not isinstance(proof, dict):
        return {}
    return {
        "federationArtifactId": str(proof.get("artifactId")),
        "federationProofHash": str(proof.get("proofHash")),
        "federationRunId": str(proof.get("federationRunId")),
        "federationPackHash": str(proof.get("packHash")),
        "federationPolicyHash": str(proof.get("policyHash")),
        "federationOntologyHash": str(proof.get("ontologyHash")),
    }


def _bound_plan_hash(plan_hash: str, proof: dict[str, str] | None) -> str:
    return _sha256({"planHash": plan_hash, "federationProofHash": proof["proofHash"]}) if proof else plan_hash


def _redact_detail(value: Any) -> Any:
    if isinstance(value, list):
        return [_redact_detail(item) for item in value]
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            if any(marker in str(key).lower() for marker in SAFE_REDACT_KEYS):
                redacted[key] = {"redacted": True, "sha256": _sha256(str(item))}
            else:
                redacted[key] = _redact_detail(item)
        return redacted
    return value


def _scope_from(plan: dict[str, Any], step: dict[str, Any]) -> dict[str, Any]:
    plan_scope = _as_record(plan.get("scope"))
    step_scope = _as_record(step.get("scope"))
    tenant_id = _string(step_scope.get("tenantId") or step_scope.get("tenant_id") or plan.get("tenantId") or plan.get("tenant_id") or plan_scope.get("tenantId") or plan_scope.get("tenant_id") or "default-tenant")
    space_id = _string(step_scope.get("spaceId") or step_scope.get("space_id") or plan.get("spaceId") or plan.get("space_id") or plan_scope.get("spaceId") or plan_scope.get("space_id") or "default-space")
    purpose = _string(step_scope.get("purpose") or plan_scope.get("purpose") or plan.get("purpose") or "orchestration")
    actor_id = _string(step_scope.get("actorId") or step_scope.get("actor_id") or plan_scope.get("actorId") or plan_scope.get("actor_id") or plan.get("actorId") or plan.get("actor_id") or "operator")
    return {"tenantId": tenant_id, "spaceId": space_id, "purpose": purpose, "actorId": actor_id}


def _dependencies(step: dict[str, Any]) -> list[str]:
    raw = step.get("dependsOn")
    if raw is None:
        raw = step.get("dependencies")
    if raw is None:
        raw = step.get("deps")
    return [str(item) for item in _as_list(raw)]


def _side_effect(step: dict[str, Any]) -> dict[str, Any]:
    raw = step.get("sideEffect") if "sideEffect" in step else step.get("side_effect")
    effect_kind = str(step.get("effect") or step.get("actionKind") or "").lower()
    declared = False
    data: dict[str, Any] = {}
    if isinstance(raw, dict):
        declared = True
        data = raw
    elif raw is True:
        declared = True
    elif effect_kind in {"write", "mutate", "mutation", "delete", "external_write", "side_effect"}:
        declared = False
        data = {}
    resource_id = _string(data.get("resourceId") or data.get("resource_id") or step.get("resourceId") or step.get("resource_id"))
    version = _string(data.get("version") or data.get("resourceVersion") or data.get("resource_version") or step.get("resourceVersion") or step.get("resource_version") or "v1")
    boundary = data.get("boundary") or step.get("rollbackBoundary") or step.get("rollback_boundary") or {}
    compensation = data.get("compensation") or step.get("compensation")
    return {
        "declared": declared,
        "looksLikeSideEffect": effect_kind in {"write", "mutate", "mutation", "delete", "external_write", "side_effect"} or raw is True or isinstance(raw, dict),
        "resourceId": resource_id,
        "version": version,
        "boundary": boundary if isinstance(boundary, dict) else {},
        "compensation": compensation if isinstance(compensation, dict) else None,
    }


def _checkpoint_declared(plan: dict[str, Any], step: dict[str, Any], step_id: str) -> dict[str, Any] | None:
    checkpoint = step.get("checkpoint")
    if isinstance(checkpoint, dict):
        return checkpoint
    if checkpoint is True:
        return {}
    checkpoints = plan.get("checkpoints")
    if isinstance(checkpoints, dict) and step_id in checkpoints:
        value = checkpoints.get(step_id)
        return value if isinstance(value, dict) else {}
    if isinstance(checkpoints, list) and step_id in {str(item) for item in checkpoints}:
        return {}
    return None


def _step_budget_calls(step: dict[str, Any]) -> int:
    budget = _as_record(step.get("budget") or step.get("budgets"))
    raw = budget.get("calls") or budget.get("maxCalls") or step.get("calls") or 1
    try:
        calls = int(raw)
    except Exception:
        calls = 1
    return max(calls, 0)


def _normalize_step(plan: dict[str, Any], step: dict[str, Any], index: int) -> tuple[dict[str, Any] | None, list[dict[str, str]]]:
    errors: list[dict[str, str]] = []
    step_id = _string(step.get("id") or step.get("stepId") or step.get("step_id"))
    if not step_id:
        errors.append({"code": "missing_step_id", "message": f"step at index {index} is missing id"})
        return None, errors

    scope = _scope_from(plan, step)
    hashes = step.get("hashes") if isinstance(step.get("hashes"), dict) else {}
    input_hash = _string(step.get("inputHash") or step.get("input_hash") or hashes.get("input"))
    action_hash = _string(step.get("actionHash") or step.get("action_hash") or hashes.get("action"))
    side_effect = _side_effect(step)
    checkpoint = _checkpoint_declared(plan, step, step_id)

    if not input_hash:
        errors.append({"code": "missing_input_hash", "stepId": step_id, "message": "step must declare inputHash"})
    if not action_hash:
        errors.append({"code": "missing_action_hash", "stepId": step_id, "message": "step must declare actionHash"})
    if not scope.get("tenantId") or not scope.get("spaceId"):
        errors.append({"code": "missing_scope", "stepId": step_id, "message": "step must declare tenant and space scope"})
    if side_effect["looksLikeSideEffect"] and not side_effect["declared"]:
        errors.append({"code": "undeclared_side_effect", "stepId": step_id, "message": "mutating step must declare sideEffect"})
    if side_effect["declared"]:
        if not side_effect.get("resourceId"):
            errors.append({"code": "missing_resource", "stepId": step_id, "message": "sideEffect must declare resourceId"})
        if not side_effect.get("compensation"):
            errors.append({"code": "missing_compensation", "stepId": step_id, "message": "sideEffect must declare compensation"})
    if checkpoint is None:
        errors.append({"code": "missing_checkpoint", "stepId": step_id, "message": "step must declare checkpoint behavior"})

    gate = _as_record(step.get("gate") or step.get("gates"))
    simulate = _as_record(step.get("simulate") or step.get("simulation"))
    rollback = _as_record(step.get("rollback") or step.get("rollbackHandle") or step.get("rollback_handle"))
    normalized = {
        "id": step_id,
        "index": index,
        "dependencies": _dependencies(step),
        "scope": scope,
        "scopeHash": _sha256(scope),
        "inputHash": input_hash,
        "actionHash": action_hash,
        "sideEffect": {
            "declared": bool(side_effect["declared"]),
            "resourceId": side_effect.get("resourceId"),
            "version": side_effect.get("version"),
            "boundaryHash": _sha256(side_effect.get("boundary") or {}),
            "compensationHash": _sha256(side_effect.get("compensation") or {}),
        },
        "checkpoint": {
            "declared": checkpoint is not None,
            "expiresAt": _string((checkpoint or {}).get("expiresAt") or (checkpoint or {}).get("expires_at")),
        },
        "budgetCalls": _step_budget_calls(step),
        "gate": gate,
        "simulate": {
            "outcome": _string(simulate.get("outcome") or simulate.get("status") or step.get("outcome")),
            "commitLookup": _string(simulate.get("commitLookup") or simulate.get("commit_lookup") or step.get("commitLookup")),
            "compensationOutcome": _string(simulate.get("compensationOutcome") or simulate.get("compensation_outcome")),
        },
        "rollback": rollback,
    }
    return normalized, errors


def _topological_order(steps: list[dict[str, Any]]) -> tuple[list[str], list[dict[str, str]]]:
    errors: list[dict[str, str]] = []
    step_by_id = {step["id"]: step for step in steps}
    for step in steps:
        for dep in step["dependencies"]:
            if dep not in step_by_id:
                errors.append({"code": "unknown_dependency", "stepId": step["id"], "dependency": dep, "message": "dependency is not declared"})
    visited: set[str] = set()
    visiting: set[str] = set()
    order: list[str] = []

    def visit(step_id: str) -> None:
        if step_id in visited:
            return
        if step_id in visiting:
            errors.append({"code": "cycle", "stepId": step_id, "message": "plan dependency graph contains a cycle"})
            return
        visiting.add(step_id)
        for dep_id in step_by_id[step_id]["dependencies"]:
            if dep_id in step_by_id:
                visit(dep_id)
        visiting.remove(step_id)
        visited.add(step_id)
        order.append(step_id)

    for step in steps:
        visit(step["id"])
    return order, errors


def validate_plan(plan: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(plan, dict):
        return {
            "ok": False,
            "status": "invalid",
            "planHash": None,
            "normalizedGraph": None,
            "validationReceipt": {
                "receiptId": "orch-plan-validation:invalid-shape",
                "errors": [{"code": "invalid_plan", "message": "plan must be an object"}],
                "actionEvents": 0,
            },
        }

    errors: list[dict[str, str]] = []
    raw_steps = _as_list(plan.get("steps"))
    if not raw_steps:
        errors.append({"code": "missing_steps", "message": "plan must contain at least one step"})

    normalized_steps: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, raw_step in enumerate(raw_steps):
        if not isinstance(raw_step, dict):
            errors.append({"code": "invalid_step", "message": f"step at index {index} must be an object"})
            continue
        step, step_errors = _normalize_step(plan, raw_step, index)
        errors.extend(step_errors)
        if step is None:
            continue
        if step["id"] in seen:
            errors.append({"code": "duplicate_step_id", "stepId": step["id"], "message": "step ids must be unique"})
        seen.add(step["id"])
        normalized_steps.append(step)

    order, graph_errors = _topological_order(normalized_steps)
    errors.extend(graph_errors)

    budgets = _as_record(plan.get("budgets") or plan.get("budget") or plan.get("bounds"))
    if not budgets:
        errors.append({"code": "missing_budget", "message": "plan must declare budgets"})
    max_steps = budgets.get("maxSteps") or budgets.get("max_steps")
    max_calls = budgets.get("maxCalls") or budgets.get("max_calls")
    max_side_effects = budgets.get("maxSideEffects") or budgets.get("max_side_effects")
    try:
        max_steps_int = int(max_steps)
    except Exception:
        max_steps_int = None
    try:
        max_calls_int = int(max_calls)
    except Exception:
        max_calls_int = None
    try:
        max_side_effects_int = int(max_side_effects)
    except Exception:
        max_side_effects_int = None
    if max_steps_int is None:
        errors.append({"code": "missing_max_steps", "message": "budget.maxSteps is required"})
    elif len(normalized_steps) > max_steps_int:
        errors.append({"code": "over_budget_steps", "message": "step count exceeds maxSteps"})
    total_calls = sum(int(step.get("budgetCalls") or 0) for step in normalized_steps)
    if max_calls_int is None:
        errors.append({"code": "missing_max_calls", "message": "budget.maxCalls is required"})
    elif total_calls > max_calls_int:
        errors.append({"code": "over_budget_calls", "message": "step call budget exceeds maxCalls"})
    side_effect_count = sum(1 for step in normalized_steps if step["sideEffect"]["declared"])
    if max_side_effects_int is None:
        errors.append({"code": "missing_max_side_effects", "message": "budget.maxSideEffects is required"})
    elif side_effect_count > max_side_effects_int:
        errors.append({"code": "over_budget_side_effects", "message": "side effect count exceeds maxSideEffects"})

    graph_for_hash = {
        "planId": _string(plan.get("id") or plan.get("planId") or plan.get("plan_id")) or "anonymous-plan",
        "tenantId": _scope_from(plan, {}).get("tenantId"),
        "spaceId": _scope_from(plan, {}).get("spaceId"),
        "budgets": {
            "maxSteps": max_steps_int,
            "maxCalls": max_calls_int,
            "maxSideEffects": max_side_effects_int,
            "totalCalls": total_calls,
            "sideEffects": side_effect_count,
        },
        "stepOrder": order,
        "steps": [
            {
                "id": step["id"],
                "dependencies": step["dependencies"],
                "scopeHash": step["scopeHash"],
                "inputHash": step["inputHash"],
                "actionHash": step["actionHash"],
                "sideEffect": {k: v for k, v in step["sideEffect"].items() if k != "declared"} | {"declared": step["sideEffect"]["declared"]},
                "checkpointDeclared": step["checkpoint"]["declared"],
                "budgetCalls": step["budgetCalls"],
            }
            for step in normalized_steps
        ],
    }
    plan_hash = _sha256(graph_for_hash)
    ok = len(errors) == 0
    receipt = {
        "receiptId": f"orch-plan-validation:{plan_hash[:16]}",
        "planHash": plan_hash,
        "status": "valid" if ok else "invalid",
        "errors": errors,
        "actionEvents": 0,
    }
    return {
        "ok": ok,
        "status": "valid" if ok else "invalid",
        "planHash": plan_hash,
        "normalizedGraph": graph_for_hash | {"executionSteps": normalized_steps},
        "validationReceipt": receipt,
    }


def _lineage_rows(store: Any, run_id: str) -> list[dict[str, Any]]:
    rows = store.conn.execute(
        "SELECT * FROM orchestration_lineage WHERE run_id = ? ORDER BY id ASC",
        (run_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def _parse_detail(row: dict[str, Any]) -> dict[str, Any]:
    try:
        parsed = json.loads(row.get("detail_json") or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _computed_event_hash(row: dict[str, Any]) -> str:
    return _sha256(
        {
            "id": row.get("id"),
            "correlation_id": row.get("correlation_id"),
            "run_id": row.get("run_id"),
            "hop_type": row.get("hop_type"),
            "agent_id": row.get("agent_id"),
            "detail": _parse_detail(row),
            "created_at": row.get("created_at"),
            "previous_event_hash": row.get("previous_event_hash"),
        }
    )


def verify_lineage_chain(store: Any, run_id: str) -> dict[str, Any]:
    errors: list[dict[str, Any]] = []
    previous: str | None = None
    for row in _lineage_rows(store, run_id):
        row_hash = row.get("event_hash")
        if row.get("previous_event_hash") != previous:
            errors.append({"code": "previous_hash_mismatch", "eventId": row.get("id")})
        if not row_hash:
            errors.append({"code": "missing_event_hash", "eventId": row.get("id")})
        else:
            expected = _computed_event_hash(row)
            if row_hash != expected:
                errors.append({"code": "event_hash_mismatch", "eventId": row.get("id")})
        previous = row_hash
    return {"valid": not errors, "errors": errors}


def _ordered_steps(graph: dict[str, Any]) -> list[dict[str, Any]]:
    by_id = {step["id"]: step for step in graph.get("executionSteps") or []}
    return [by_id[step_id] for step_id in graph.get("stepOrder") or [] if step_id in by_id]


def _completed_step_ids(store: Any, run_id: str) -> set[str]:
    completed: set[str] = set()
    for row in _lineage_rows(store, run_id):
        detail = _parse_detail(row)
        if row.get("hop_type") in {"step_committed", "step_read_completed"} and detail.get("stepId"):
            completed.add(str(detail["stepId"]))
    return completed


def _federation_detail_for_run(store: Any, run_id: str) -> dict[str, str]:
    for row in _lineage_rows(store, run_id):
        if row.get("hop_type") != "plan_validated":
            continue
        detail = _parse_detail(row)
        if detail.get("federationProofHash"):
            return {
                key: str(detail[key])
                for key in ("federationArtifactId", "federationProofHash", "federationRunId", "federationPackHash", "federationPolicyHash", "federationOntologyHash")
                if detail.get(key) is not None
            }
    return {}


def _committed_steps(store: Any, run_id: str) -> list[dict[str, Any]]:
    committed: list[dict[str, Any]] = []
    for row in _lineage_rows(store, run_id):
        if row.get("hop_type") == "step_committed":
            detail = _parse_detail(row)
            committed.append({"eventId": row.get("id"), **detail})
    return committed


def _finalize(store: Any, run: dict[str, Any], status: str, reason: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    store.update_run(run["run_id"], status=status)
    store.append_lineage(
        correlation_id=run["correlation_id"],
        run_id=run["run_id"],
        hop_type="run_finalized",
        detail={
            "status": status,
            "success": status == SUCCESS_STATUS,
            "reason": reason,
            **(extra or {}),
        },
    )
    return _result_payload(store, run["run_id"], status, status == SUCCESS_STATUS, reason)


def _result_payload(store: Any, run_id: str, status: str, ok: bool, reason: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    bundle = build_evidence_bundle(store, run_id)
    payload = {
        "ok": ok,
        "success": status == SUCCESS_STATUS,
        "runId": run_id,
        "status": status,
        "reason": reason,
        "evidenceBundleHash": bundle.get("bundle", {}).get("bundleHash"),
        "evidenceVerified": bundle.get("bundle", {}).get("verification", {}).get("valid", False),
    }
    if extra:
        payload.update(extra)
    return payload


def _gate_value(source: dict[str, Any], *names: str) -> Any:
    current: Any = source
    for name in names:
        if not isinstance(current, dict):
            return None
        current = current.get(name)
    return current


def _evaluate_gate(step: dict[str, Any], run: dict[str, Any], completed: set[str]) -> dict[str, Any]:
    gate = _as_record(step.get("gate"))
    policy_decision = _string(
        gate.get("policyDecision")
        or gate.get("policy_decision")
        or _gate_value(gate, "policy", "decision")
        or _gate_value(gate, "policy", "status")
    )
    identity = _as_record(gate.get("identity"))
    freshness = gate.get("freshness")
    if isinstance(freshness, dict):
        freshness_value = freshness.get("status") or freshness.get("decision") or freshness.get("fresh")
    else:
        freshness_value = freshness
    verification = gate.get("verification")
    if isinstance(verification, dict):
        verification_value = verification.get("status") or verification.get("decision") or verification.get("passed")
    else:
        verification_value = verification

    reasons: list[str] = []
    policy_ok = policy_decision == "allow"
    if not policy_ok:
        reasons.append("policy_unavailable" if policy_decision is None else f"policy_{policy_decision}")
    identity_ok = (
        _string(identity.get("tenantId") or identity.get("tenant_id")) == step["scope"].get("tenantId")
        and _string(identity.get("spaceId") or identity.get("space_id")) == step["scope"].get("spaceId")
        and step["scope"].get("tenantId") == run.get("tenant_id")
        and step["scope"].get("spaceId") == run.get("space_id")
    )
    if not identity_ok:
        reasons.append("identity_scope_mismatch")
    freshness_ok = freshness_value == "fresh" or freshness_value is True
    if not freshness_ok:
        reasons.append("freshness_unavailable" if freshness_value is None else "freshness_stale")
    dependency_ok = all(dep in completed for dep in step["dependencies"])
    if not dependency_ok:
        reasons.append("dependency_unmet")
    verification_ok = verification_value == "passed" or verification_value is True
    if not verification_ok:
        reasons.append("verification_unavailable" if verification_value is None else "verification_failed")

    decision = policy_ok and identity_ok and freshness_ok and dependency_ok and verification_ok
    if not decision:
        if any(reason.startswith("policy_") for reason in reasons):
            status = "policy_denied"
        elif "identity_scope_mismatch" in reasons:
            status = "identity_denied"
        elif any(reason.startswith("freshness_") for reason in reasons):
            status = "freshness_denied"
        elif "dependency_unmet" in reasons:
            status = "dependency_unmet"
        else:
            status = "verification_failed"
    else:
        status = "passed"
    return {
        "stepId": step["id"],
        "decision": "allow" if decision else "deny",
        "status": status,
        "reasons": reasons,
        "policyDecision": policy_decision or "unavailable",
        "identityHash": _sha256(identity) if identity else None,
        "freshness": freshness_value or "unavailable",
        "dependencyStepIds": step["dependencies"],
        "inputHash": step["inputHash"],
        "verification": verification_value or "unavailable",
        "freshEvaluationId": f"gate:{step['id']}:{uuid.uuid4().hex}",
    }


def _rollback_payload_for(run: dict[str, Any], plan_hash: str, step: dict[str, Any]) -> dict[str, Any]:
    expires_at = _string(step.get("rollback", {}).get("expiresAt") or step.get("rollback", {}).get("expires_at"))
    if not expires_at:
        expires_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat().replace("+00:00", "Z")
    return {
        "runId": run["run_id"],
        "planHash": plan_hash,
        "tenantId": run.get("tenant_id") or step["scope"].get("tenantId"),
        "spaceId": run.get("space_id") or step["scope"].get("spaceId"),
        "stepId": step["id"],
        "resourceId": step["sideEffect"].get("resourceId"),
        "resourceVersion": step["sideEffect"].get("version"),
        "boundaryHash": step["sideEffect"].get("boundaryHash"),
        "expiresAt": expires_at,
    }


def make_rollback_handle(payload: dict[str, Any]) -> str:
    payload_json = _canonical(payload).encode("utf-8")
    encoded = _b64url(payload_json)
    sig = _sha256(f"{encoded}.{ROLLBACK_SECRET}")
    return f"rbh_v1.{encoded}.{sig}"


def parse_rollback_handle(handle: str) -> tuple[dict[str, Any] | None, str | None]:
    parts = str(handle or "").split(".")
    if len(parts) != 3 or parts[0] != "rbh_v1":
        return None, "malformed"
    encoded, signature = parts[1], parts[2]
    expected = _sha256(f"{encoded}.{ROLLBACK_SECRET}")
    if signature != expected:
        return None, "tampered"
    try:
        payload = json.loads(_b64url_decode(encoded).decode("utf-8"))
    except Exception:
        return None, "malformed"
    if not isinstance(payload, dict):
        return None, "malformed"
    return payload, None


def _append_checkpoint(store: Any, run: dict[str, Any], plan_hash: str, step: dict[str, Any], completed: set[str]) -> None:
    checkpoint_expires = step.get("checkpoint", {}).get("expiresAt")
    checkpoint_payload = {
        "runId": run["run_id"],
        "planHash": plan_hash,
        "lastStepId": step["id"],
        "completedStepIds": sorted(completed),
        "expiresAt": checkpoint_expires,
        **_federation_detail(step.get("_graph") or {}),
    }
    checkpoint_hash = _sha256(checkpoint_payload)
    store.append_lineage(
        correlation_id=run["correlation_id"],
        run_id=run["run_id"],
        hop_type="checkpoint_saved",
        detail={**checkpoint_payload, "checkpointHash": checkpoint_hash},
    )


def _compensation_already_done(store: Any, run_id: str, step_id: str) -> bool:
    for row in _lineage_rows(store, run_id):
        if row.get("hop_type") == "compensation_committed" and _parse_detail(row).get("stepId") == step_id:
            return True
    return False


def _compensate_committed(store: Any, run: dict[str, Any], graph: dict[str, Any], reason: str, failed_step_id: str | None = None) -> str:
    steps_by_id = {step["id"]: step for step in graph.get("executionSteps") or []}
    completed = _completed_step_ids(store, run["run_id"])
    committed = _committed_steps(store, run["run_id"])
    committed_ids = [str(item["stepId"]) for item in committed if item.get("stepId")]
    reverse_committed = list(reversed(committed_ids))
    store.append_lineage(
        correlation_id=run["correlation_id"],
        run_id=run["run_id"],
        hop_type="rollback_started",
        detail={"reason": reason, "committedStepIds": reverse_committed, "failedStepId": failed_step_id, **_federation_detail(graph)},
    )

    compensation_failed = False
    completed_order = [step["id"] for step in _ordered_steps(graph) if step["id"] in completed]
    for step_id in reversed(completed_order):
        step = steps_by_id.get(step_id)
        if step and not step["sideEffect"]["declared"]:
            store.append_lineage(
                correlation_id=run["correlation_id"],
                run_id=run["run_id"],
                hop_type="compensation_skipped",
                detail={"stepId": step_id, "reason": "read_only", **_federation_detail(graph)},
            )
    if failed_step_id:
        store.append_lineage(
            correlation_id=run["correlation_id"],
            run_id=run["run_id"],
            hop_type="compensation_skipped",
            detail={"stepId": failed_step_id, "reason": "uncommitted", **_federation_detail(graph)},
        )

    for step_id in reverse_committed:
        step = steps_by_id.get(step_id)
        if not step:
            continue
        if _compensation_already_done(store, run["run_id"], step_id):
            store.append_lineage(
                correlation_id=run["correlation_id"],
                run_id=run["run_id"],
                hop_type="compensation_replayed",
                detail={"stepId": step_id, "reason": "already_compensated", **_federation_detail(graph)},
            )
            continue
        store.append_lineage(
            correlation_id=run["correlation_id"],
            run_id=run["run_id"],
            hop_type="compensation_gate",
            detail={
                "stepId": step_id,
                "scopeHash": step["scopeHash"],
                "inputHash": step["inputHash"],
                "actionHash": step["actionHash"],
                "decision": "allow",
                "authorization": "original_scope_hash",
                **_federation_detail(graph),
            },
        )
        if step.get("simulate", {}).get("compensationOutcome") == "failed":
            compensation_failed = True
            store.append_lineage(
                correlation_id=run["correlation_id"],
                run_id=run["run_id"],
                hop_type="compensation_failed",
                detail={"stepId": step_id, "resourceId": step["sideEffect"].get("resourceId"), "reason": "simulated_failure"},
            )
            continue
        store.append_lineage(
            correlation_id=run["correlation_id"],
            run_id=run["run_id"],
            hop_type="compensation_committed",
            detail={
                "stepId": step_id,
                "resourceId": step["sideEffect"].get("resourceId"),
                "resourceVersion": step["sideEffect"].get("version"),
                "originalScopeHash": step["scopeHash"],
                "originalInputHash": step["inputHash"],
                "reversalId": f"comp:{run['run_id']}:{step_id}",
                **_federation_detail(graph),
            },
        )
    final_status = "compensation_failed" if compensation_failed else "compensated"
    store.append_lineage(
        correlation_id=run["correlation_id"],
        run_id=run["run_id"],
        hop_type="rollback_complete",
        detail={"status": final_status, "reason": reason, **_federation_detail(graph)},
    )
    return final_status


def _continue_plan(store: Any, run: dict[str, Any], graph: dict[str, Any], *, payload: dict[str, Any], resume: bool = False) -> dict[str, Any]:
    completed = _completed_step_ids(store, run["run_id"])
    plan_hash = graph["planHash"] if "planHash" in graph else _sha256({k: v for k, v in graph.items() if k != "executionSteps"})
    crash_after = _string(payload.get("crashAfterStepId") or payload.get("crash_after_step_id"))
    rollback_handles: list[dict[str, str]] = []
    for step in graph.get("executionSteps") or []:
        step["_graph"] = graph

    for step in _ordered_steps(graph):
        if step["id"] in completed:
            continue
        gate_receipt = _evaluate_gate(step, run, completed)
        gate_receipt.update(_federation_detail(graph))
        store.append_lineage(
            correlation_id=run["correlation_id"],
            run_id=run["run_id"],
            hop_type="step_gate",
            agent_id=_string(step.get("gate", {}).get("agentId") or step.get("gate", {}).get("agent_id")),
            detail=gate_receipt,
        )
        if gate_receipt["decision"] != "allow":
            recovery_status = _compensate_committed(store, run, graph, gate_receipt["status"], failed_step_id=step["id"])
            final_status = gate_receipt["status"] if recovery_status == "compensated" else recovery_status
            return _finalize(store, run, final_status, ";".join(gate_receipt["reasons"]), {"recoveryStatus": recovery_status})

        store.append_lineage(
            correlation_id=run["correlation_id"],
            run_id=run["run_id"],
            hop_type="step_action_invoked",
            detail={
                "stepId": step["id"],
                "inputHash": step["inputHash"],
                "actionHash": step["actionHash"],
                "sideEffectDeclared": step["sideEffect"]["declared"],
                **_federation_detail(graph),
            },
        )
        outcome = step.get("simulate", {}).get("outcome") or ("committed" if step["sideEffect"]["declared"] else "read")
        if outcome in {"failed", "failed_before_commit", "verification_failed"}:
            hop_type = "step_verification_failed" if outcome == "verification_failed" else "step_failed"
            status = "verification_failed" if outcome == "verification_failed" else "step_failed"
            store.append_lineage(
                correlation_id=run["correlation_id"],
                run_id=run["run_id"],
                hop_type=hop_type,
                detail={"stepId": step["id"], "committed": False, "outcome": outcome},
            )
            recovery_status = _compensate_committed(store, run, graph, status, failed_step_id=step["id"])
            final_status = status if recovery_status == "compensated" else recovery_status
            return _finalize(store, run, final_status, status, {"recoveryStatus": recovery_status})

        if outcome in {"timeout", "timeout_after_commit", "ambiguous_commit", "timeout_unknown_commit"}:
            store.append_lineage(
                correlation_id=run["correlation_id"],
                run_id=run["run_id"],
                hop_type="commit_ambiguous",
                detail={
                    "stepId": step["id"],
                    "resourceId": step["sideEffect"].get("resourceId"),
                    "idempotencyKey": f"idem:{run['run_id']}:{step['id']}",
                    "lookupBeforeMutation": True,
                    **_federation_detail(graph),
                },
            )
            lookup = step.get("simulate", {}).get("commitLookup") or ("committed" if outcome == "timeout_after_commit" else "unknown")
            store.append_lineage(
                correlation_id=run["correlation_id"],
                run_id=run["run_id"],
                hop_type="commit_reconciled" if lookup != "unknown" else "commit_unresolved",
                detail={"stepId": step["id"], "lookupResult": lookup, "mutationAttemptedBeforeLookup": False, **_federation_detail(graph)},
            )
            if lookup == "committed":
                outcome = "committed"
            elif lookup == "not_committed":
                recovery_status = _compensate_committed(store, run, graph, "timeout_uncommitted", failed_step_id=step["id"])
                return _finalize(store, run, "timeout_uncommitted" if recovery_status == "compensated" else recovery_status, "commit_lookup_not_committed", {"recoveryStatus": recovery_status})
            else:
                recovery_status = _compensate_committed(store, run, graph, "unresolved_commit", failed_step_id=step["id"])
                return _finalize(store, run, "unresolved_commit" if recovery_status == "compensated" else recovery_status, "commit_lookup_unknown", {"recoveryStatus": recovery_status})

        if step["sideEffect"]["declared"] and outcome == "committed":
            rollback_payload = _rollback_payload_for(run, plan_hash, step)
            handle = make_rollback_handle(rollback_payload)
            handle_hash = _sha256(handle)
            rollback_handles.append({"stepId": step["id"], "handle": handle, "handleHash": handle_hash})
            store.append_lineage(
                correlation_id=run["correlation_id"],
                run_id=run["run_id"],
                hop_type="step_committed",
                detail={
                    "stepId": step["id"],
                    "resourceId": step["sideEffect"].get("resourceId"),
                    "resourceVersion": step["sideEffect"].get("version"),
                    "commitReceiptHash": _sha256({"runId": run["run_id"], "stepId": step["id"], "actionHash": step["actionHash"]}),
                    "rollbackHandleHash": handle_hash,
                    "rollbackHandleMetadata": rollback_payload,
                    **_federation_detail(graph),
                },
            )
        else:
            store.append_lineage(
                correlation_id=run["correlation_id"],
                run_id=run["run_id"],
                hop_type="step_read_completed",
                detail={"stepId": step["id"], "readOnly": True, **_federation_detail(graph)},
            )
        completed.add(step["id"])
        _append_checkpoint(store, run, plan_hash, step, completed)
        if crash_after == step["id"]:
            store.update_run(run["run_id"], status="checkpoint_paused")
            store.append_lineage(
                correlation_id=run["correlation_id"],
                run_id=run["run_id"],
                hop_type="checkpoint_paused",
                detail={"status": "checkpoint_paused", "lastStepId": step["id"], "success": False},
            )
            return _result_payload(store, run["run_id"], "checkpoint_paused", False, "crash_after_checkpoint", {"rollbackHandles": rollback_handles})

    result = _finalize(store, run, SUCCESS_STATUS, "all_steps_completed", {"resumed": resume})
    result["rollbackHandles"] = rollback_handles
    return result


def execute_multihop_plan(store: Any, payload: dict[str, Any]) -> dict[str, Any]:
    plan = payload.get("plan") if isinstance(payload, dict) else None
    if not isinstance(plan, dict):
        return {"ok": False, "success": False, "status": "plan_invalid"}
    federation_proof, federation_error = _federation_proof(plan, payload)
    if federation_error:
        return {
            "ok": False,
            "success": False,
            "status": federation_error,
            "reason": federation_error,
        }
    validation = validate_plan(plan)
    if not validation["ok"]:
        return {**validation, "ok": False, "success": False, "status": "plan_invalid"}

    graph = validation["normalizedGraph"]
    graph["planHash"] = _bound_plan_hash(validation["planHash"], federation_proof)
    if federation_proof:
        graph["federationProof"] = federation_proof
    run_id = _string(payload.get("runId") or plan.get("runId") or plan.get("run_id")) or f"run_{uuid.uuid4().hex}"
    correlation_id = _string(payload.get("correlationId") or plan.get("correlationId") or plan.get("correlation_id")) or f"corr_{uuid.uuid4().hex}"
    tenant_id = graph.get("tenantId") or "default-tenant"
    space_id = graph.get("spaceId") or "default-space"
    store.create_run(
        run_id=run_id,
        correlation_id=correlation_id,
        task_summary=f"multihop:{graph.get('planId')}",
        required_capability=None,
        selected_agent_id=None,
        status="running",
        retry_limit=1,
        plan_hash=graph["planHash"],
        tenant_id=tenant_id,
        space_id=space_id,
    )
    run = store.get_run(run_id)
    store.append_lineage(
        correlation_id=correlation_id,
        run_id=run_id,
        hop_type="plan_validated",
        detail={
            "planHash": graph["planHash"],
            "basePlanHash": validation["planHash"],
            "normalizedGraph": {k: v for k, v in graph.items() if k != "executionSteps"},
            "validationReceipt": validation["validationReceipt"],
            **_federation_detail(graph),
        },
    )
    return _continue_plan(store, run, graph, payload=payload, resume=False)


def _last_checkpoint(store: Any, run_id: str) -> dict[str, Any] | None:
    checkpoints = [row for row in _lineage_rows(store, run_id) if row.get("hop_type") == "checkpoint_saved"]
    return checkpoints[-1] if checkpoints else None


def resume_multihop_plan(store: Any, payload: dict[str, Any]) -> dict[str, Any]:
    run_id = _string(payload.get("runId") or payload.get("run_id"))
    if not run_id:
        return {"ok": False, "success": False, "status": "missing_receipt", "reason": "runId is required"}
    run = store.get_run(run_id)
    if not run:
        return {"ok": False, "success": False, "status": "missing_receipt", "reason": "run not found"}
    plan = payload.get("plan")
    federation_proof, federation_error = _federation_proof(plan if isinstance(plan, dict) else {}, payload)
    if federation_error:
        store.append_lineage(correlation_id=run["correlation_id"], run_id=run_id, hop_type="resume_denied", detail={"status": federation_error, "reason": federation_error})
        return _finalize(store, run, federation_error, federation_error)
    validation = validate_plan(plan)
    if not validation["ok"]:
        store.append_lineage(correlation_id=run["correlation_id"], run_id=run_id, hop_type="resume_denied", detail={"status": "plan_invalid", "errors": validation["validationReceipt"]["errors"]})
        return _finalize(store, run, "plan_invalid", "resume_plan_invalid")
    bound_plan_hash = _bound_plan_hash(validation["planHash"], federation_proof)
    if bound_plan_hash != run.get("plan_hash"):
        store.append_lineage(
            correlation_id=run["correlation_id"],
            run_id=run_id,
            hop_type="resume_denied",
            detail={"status": "changed_plan_denied", "expectedPlanHash": run.get("plan_hash"), "actualPlanHash": bound_plan_hash},
        )
        return _finalize(store, run, "changed_plan_denied", "plan_hash_mismatch")
    chain = verify_lineage_chain(store, run_id)
    if not chain["valid"]:
        store.append_lineage(correlation_id=run["correlation_id"], run_id=run_id, hop_type="resume_denied", detail={"status": "evidence_tampered", "errors": chain["errors"]})
        return _finalize(store, run, "evidence_tampered", "checkpoint_chain_invalid")
    checkpoint = _last_checkpoint(store, run_id)
    if not checkpoint:
        store.append_lineage(correlation_id=run["correlation_id"], run_id=run_id, hop_type="resume_denied", detail={"status": "missing_receipt", "reason": "no checkpoint"})
        return _finalize(store, run, "missing_receipt", "checkpoint_missing")
    checkpoint_detail = _parse_detail(checkpoint)
    expires_at = _parse_time(checkpoint_detail.get("expiresAt"))
    if expires_at is not None and expires_at < datetime.now(timezone.utc):
        store.append_lineage(correlation_id=run["correlation_id"], run_id=run_id, hop_type="resume_denied", detail={"status": "checkpoint_expired", "checkpointHash": checkpoint_detail.get("checkpointHash")})
        return _finalize(store, run, "checkpoint_expired", "checkpoint_expired")
    graph = validation["normalizedGraph"]
    graph["planHash"] = bound_plan_hash
    if federation_proof:
        graph["federationProof"] = federation_proof
    completed = sorted(_completed_step_ids(store, run_id))
    store.append_lineage(
        correlation_id=run["correlation_id"],
        run_id=run_id,
        hop_type="resume_reconciled",
        detail={"planHash": bound_plan_hash, "completedStepIds": completed, "checkpointHash": checkpoint_detail.get("checkpointHash"), **_federation_detail(graph)},
    )
    if len(completed) == len(graph.get("executionSteps") or []):
        return _result_payload(store, run_id, run.get("status") or SUCCESS_STATUS, run.get("status") == SUCCESS_STATUS, "resume_idempotent")
    store.update_run(run_id, status="resuming")
    run = store.get_run(run_id)
    return _continue_plan(store, run, graph, payload=payload, resume=True)


def _handle_consumed(store: Any, run_id: str, handle_hash: str) -> bool:
    for row in _lineage_rows(store, run_id):
        if row.get("hop_type") == "rollback_handle_consumed" and _parse_detail(row).get("handleHash") == handle_hash:
            return True
    return False


def rollback_with_handle(store: Any, payload: dict[str, Any]) -> dict[str, Any]:
    handle = _string(payload.get("handle") or payload.get("rollbackHandle") or payload.get("rollback_handle"))
    parsed, error = parse_rollback_handle(handle or "")
    if error or not parsed:
        return {"ok": False, "success": False, "status": "rollback_handle_invalid", "reason": error or "invalid"}
    requested_run_id = _string(payload.get("runId") or payload.get("run_id"))
    if requested_run_id and requested_run_id != parsed.get("runId"):
        return {"ok": False, "success": False, "status": "rollback_handle_invalid", "reason": "run_boundary_mismatch"}
    run = store.get_run(str(parsed.get("runId")))
    if not run:
        return {"ok": False, "success": False, "status": "missing_receipt", "reason": "run not found"}
    handle_hash = _sha256(handle)
    federation_detail = _federation_detail_for_run(store, run["run_id"])
    request_tenant = _string(payload.get("tenantId") or payload.get("tenant_id") or parsed.get("tenantId"))
    request_space = _string(payload.get("spaceId") or payload.get("space_id") or parsed.get("spaceId"))
    if request_tenant != parsed.get("tenantId") or request_space != parsed.get("spaceId"):
        store.append_lineage(correlation_id=run["correlation_id"], run_id=run["run_id"], hop_type="rollback_denied", detail={"status": "rollback_scope_denied", "handleHash": handle_hash, **federation_detail})
        return _finalize(store, run, "rollback_scope_denied", "foreign_scope")
    expires_at = _parse_time(str(parsed.get("expiresAt")))
    if expires_at and expires_at < datetime.now(timezone.utc):
        store.append_lineage(correlation_id=run["correlation_id"], run_id=run["run_id"], hop_type="rollback_denied", detail={"status": "rollback_handle_expired", "handleHash": handle_hash, **federation_detail})
        return _finalize(store, run, "rollback_handle_expired", "handle_expired")
    if _handle_consumed(store, run["run_id"], handle_hash):
        store.append_lineage(correlation_id=run["correlation_id"], run_id=run["run_id"], hop_type="rollback_denied", detail={"status": "rollback_handle_consumed", "handleHash": handle_hash, **federation_detail})
        return _finalize(store, run, "rollback_handle_consumed", "handle_already_consumed")
    committed = [detail for detail in _committed_steps(store, run["run_id"]) if detail.get("rollbackHandleHash") == handle_hash]
    if not committed:
        store.append_lineage(correlation_id=run["correlation_id"], run_id=run["run_id"], hop_type="rollback_denied", detail={"status": "missing_receipt", "handleHash": handle_hash, **federation_detail})
        return _finalize(store, run, "missing_receipt", "rollback_receipt_missing")
    current_version = _string(payload.get("currentResourceVersion") or payload.get("current_resource_version") or parsed.get("resourceVersion"))
    if current_version != parsed.get("resourceVersion"):
        store.append_lineage(
            correlation_id=run["correlation_id"],
            run_id=run["run_id"],
            hop_type="rollback_divergence",
            detail={
                "status": "rollback_diverged",
                "handleHash": handle_hash,
                "resourceId": parsed.get("resourceId"),
                "expectedVersion": parsed.get("resourceVersion"),
                "actualVersion": current_version,
                "residualDivergence": True,
                **federation_detail,
            },
        )
        return _finalize(store, run, "rollback_diverged", "resource_version_diverged")
    store.append_lineage(
        correlation_id=run["correlation_id"],
        run_id=run["run_id"],
        hop_type="rollback_action_committed",
        detail={
            "handleHash": handle_hash,
            "stepId": parsed.get("stepId"),
            "resourceId": parsed.get("resourceId"),
            "resourceVersion": parsed.get("resourceVersion"),
            "boundaryHash": parsed.get("boundaryHash"),
            **federation_detail,
        },
    )
    store.append_lineage(
        correlation_id=run["correlation_id"],
        run_id=run["run_id"],
        hop_type="rollback_handle_consumed",
        detail={"handleHash": handle_hash, "consumedAt": _now(), "stepId": parsed.get("stepId"), **federation_detail},
    )
    return _finalize(store, run, "rollback_completed", "rollback_boundary_restored", {"recovery": True})


def build_evidence_bundle(store: Any, run_id: str) -> dict[str, Any]:
    run = store.get_run(run_id)
    if not run:
        return {"ok": False, "status": "missing_receipt", "bundle": None}
    rows = _lineage_rows(store, run_id)
    chain = verify_lineage_chain(store, run_id)
    final_events = [row for row in rows if row.get("hop_type") == "run_finalized"]
    status_errors: list[dict[str, Any]] = []
    if final_events:
        last_final = _parse_detail(final_events[-1])
        if last_final.get("status") != run.get("status"):
            status_errors.append({"code": "final_status_mismatch", "runStatus": run.get("status"), "eventStatus": last_final.get("status")})
        if run.get("status") in NON_SUCCESS_STATUSES | RECOVERY_STATUSES and last_final.get("success") is True:
            status_errors.append({"code": "non_success_marked_success", "runStatus": run.get("status")})
    verification = {"valid": chain["valid"] and not status_errors, "errors": [*chain["errors"], *status_errors]}
    events = [
        {
            "id": row.get("id"),
            "hopType": row.get("hop_type"),
            "agentId": row.get("agent_id"),
            "detail": _redact_detail(_parse_detail(row)),
            "createdAt": row.get("created_at"),
            "previousEventHash": row.get("previous_event_hash"),
            "eventHash": row.get("event_hash"),
        }
        for row in rows
    ]
    bundle_core = {
        "schema": "orch.evidence.bundle.v1",
        "run": {
            "runId": run.get("run_id"),
            "correlationId": run.get("correlation_id"),
            "tenantId": run.get("tenant_id"),
            "spaceId": run.get("space_id"),
            "status": run.get("status"),
            "success": run.get("status") == SUCCESS_STATUS,
            "planHash": run.get("plan_hash"),
            "taskSummaryHash": _sha256(str(run.get("task_summary") or "")),
        },
        "events": events,
        "federationProof": _federation_detail_for_run(store, run_id) or None,
        "residualRisks": [event["detail"] for event in events if event["hopType"] in {"rollback_divergence", "commit_unresolved", "compensation_failed"}],
    }
    bundle_hash = _sha256(bundle_core)
    bundle = {**bundle_core, "bundleHash": bundle_hash, "verification": verification}
    return {"ok": verification["valid"], "status": run.get("status"), "bundle": bundle}
