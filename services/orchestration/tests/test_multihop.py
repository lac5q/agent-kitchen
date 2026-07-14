import json
import hashlib
import hmac
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import OrchestrationEngine, OrchestrationStore
import multihop


def make_step(
    step_id,
    *,
    deps=None,
    effect=True,
    outcome=None,
    commit_lookup=None,
    compensation_outcome=None,
    checkpoint=None,
    gate=None,
    rollback=None,
):
    step = {
        "id": step_id,
        "dependsOn": deps or [],
        "scope": {"tenantId": "tenant-a", "spaceId": "space-a", "purpose": "validation"},
        "inputHash": f"input-{step_id}",
        "actionHash": f"action-{step_id}",
        "checkpoint": {} if checkpoint is None else checkpoint,
        "gate": gate
        or {
            "policyDecision": "allow",
            "identity": {"tenantId": "tenant-a", "spaceId": "space-a"},
            "freshness": "fresh",
            "verification": "passed",
        },
    }
    if effect:
        step["sideEffect"] = {
            "resourceId": f"resource-{step_id}",
            "version": "v1",
            "boundary": {"resourceId": f"resource-{step_id}", "field": "declared-only"},
            "compensation": {"verb": "undo", "resourceId": f"resource-{step_id}"},
        }
    if rollback is not None:
        step["rollback"] = rollback
    if outcome or commit_lookup or compensation_outcome:
        step["simulate"] = {}
        if outcome:
            step["simulate"]["outcome"] = outcome
        if commit_lookup:
            step["simulate"]["commitLookup"] = commit_lookup
        if compensation_outcome:
            step["simulate"]["compensationOutcome"] = compensation_outcome
    return step


def make_plan(steps):
    return {
        "id": "plan-a",
        "scope": {"tenantId": "tenant-a", "spaceId": "space-a", "purpose": "validation"},
        "budgets": {"maxSteps": 10, "maxCalls": 10, "maxSideEffects": 10},
        "steps": steps,
    }


class MultihopOrchestrationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "orchestration.db")
        self.store = OrchestrationStore(self.db_path)
        self.engine = OrchestrationEngine(self.store, retry_limit=2)

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def lineage(self, run_id):
        rows = self.store.conn.execute(
            "SELECT * FROM orchestration_lineage WHERE run_id = ? ORDER BY id ASC",
            (run_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def detail(self, row):
        return json.loads(row["detail_json"])

    def test_plan_graph_validation_rejects_cycles_unknown_dependencies_and_budgets_before_actions(self):
        invalid = make_plan(
            [
                make_step("a", deps=["b"]),
                make_step("b", deps=["a"]),
                make_step("c", deps=["missing"]),
            ]
        )
        invalid["budgets"] = {"maxSteps": 2, "maxCalls": 2, "maxSideEffects": 2}

        validation = self.engine.validate_multihop_plan({"plan": invalid})
        self.assertFalse(validation["ok"])
        error_codes = {error["code"] for error in validation["validationReceipt"]["errors"]}
        self.assertIn("cycle", error_codes)
        self.assertIn("unknown_dependency", error_codes)
        self.assertIn("over_budget_steps", error_codes)

        result = self.engine.execute_multihop_plan({"plan": invalid, "runId": "invalid-run"})
        self.assertEqual(result["status"], "plan_invalid")
        run_count = self.store.conn.execute("SELECT COUNT(*) FROM orchestration_runs").fetchone()[0]
        lineage_count = self.store.conn.execute("SELECT COUNT(*) FROM orchestration_lineage").fetchone()[0]
        self.assertEqual(run_count, 0)
        self.assertEqual(lineage_count, 0, "invalid plans must not create action events")

    def test_each_side_effect_gets_fresh_gate_and_failed_gate_blocks_later_actions(self):
        denied_gate = {
            "policyDecision": "deny",
            "identity": {"tenantId": "tenant-a", "spaceId": "space-a"},
            "freshness": "fresh",
            "verification": "passed",
        }
        plan = make_plan([make_step("a"), make_step("b", deps=["a"], gate=denied_gate), make_step("c", deps=["b"])])

        result = self.engine.execute_multihop_plan({"plan": plan, "runId": "gate-run", "correlationId": "gate-corr"})

        self.assertEqual(result["status"], "policy_denied")
        self.assertFalse(result["success"])
        rows = self.lineage("gate-run")
        gate_rows = [self.detail(row) for row in rows if row["hop_type"] == "step_gate"]
        action_rows = [self.detail(row) for row in rows if row["hop_type"] == "step_action_invoked"]
        self.assertEqual([gate["stepId"] for gate in gate_rows], ["a", "b"])
        self.assertEqual([action["stepId"] for action in action_rows], ["a"])
        self.assertNotEqual(gate_rows[0]["freshEvaluationId"], gate_rows[1]["freshEvaluationId"])
        self.assertEqual(gate_rows[1]["decision"], "deny")

    def test_compensation_covers_only_committed_effects_in_reverse_order(self):
        plan = make_plan(
            [
                make_step("a"),
                make_step("b", deps=["a"]),
                make_step("read", deps=["b"], effect=False),
                make_step("c", deps=["read"], outcome="failed_before_commit"),
            ]
        )

        result = self.engine.execute_multihop_plan({"plan": plan, "runId": "comp-run", "correlationId": "comp-corr"})

        self.assertEqual(result["status"], "step_failed")
        rows = self.lineage("comp-run")
        compensation = [self.detail(row) for row in rows if row["hop_type"] == "compensation_committed"]
        skipped = [self.detail(row) for row in rows if row["hop_type"] == "compensation_skipped"]
        self.assertEqual([entry["stepId"] for entry in compensation], ["b", "a"])
        self.assertIn({"stepId": "read", "reason": "read_only"}, skipped)
        self.assertIn({"stepId": "c", "reason": "uncommitted"}, skipped)

    def test_ambiguous_commit_reconciles_by_lookup_before_mutation_and_unresolved_is_not_success(self):
        committed_lookup = make_plan([make_step("a", outcome="timeout_after_commit", commit_lookup="committed")])
        committed = self.engine.execute_multihop_plan({"plan": committed_lookup, "runId": "ambig-committed"})
        self.assertTrue(committed["success"])
        committed_rows = self.lineage("ambig-committed")
        hop_types = [row["hop_type"] for row in committed_rows]
        self.assertLess(hop_types.index("commit_reconciled"), hop_types.index("step_committed"))
        ambiguous = [self.detail(row) for row in committed_rows if row["hop_type"] == "commit_ambiguous"][0]
        self.assertTrue(ambiguous["lookupBeforeMutation"])

        unresolved_plan = make_plan([make_step("a", outcome="ambiguous_commit", commit_lookup="unknown")])
        unresolved = self.engine.execute_multihop_plan({"plan": unresolved_plan, "runId": "ambig-unknown"})
        self.assertEqual(unresolved["status"], "unresolved_commit")
        self.assertFalse(unresolved["success"])
        bundle = self.engine.get_multihop_evidence("ambig-unknown")["bundle"]
        self.assertFalse(bundle["run"]["success"])
        self.assertEqual(bundle["run"]["status"], "unresolved_commit")

    def test_rollback_handles_are_scoped_expiring_consumed_and_tamper_checked(self):
        plan = make_plan([make_step("a")])
        result = self.engine.execute_multihop_plan({"plan": plan, "runId": "rollback-run"})
        handle = result["rollbackHandles"][0]["handle"]

        rollback = self.engine.rollback_multihop(
            {
                "runId": "rollback-run",
                "handle": handle,
                "tenantId": "tenant-a",
                "spaceId": "space-a",
                "currentResourceVersion": "v1",
            }
        )
        self.assertEqual(rollback["status"], "rollback_completed")

        reused = self.engine.rollback_multihop(
            {
                "runId": "rollback-run",
                "handle": handle,
                "tenantId": "tenant-a",
                "spaceId": "space-a",
                "currentResourceVersion": "v1",
            }
        )
        self.assertEqual(reused["status"], "rollback_handle_consumed")
        tampered = self.engine.rollback_multihop(
            {"runId": "rollback-run", "handle": handle[:-1] + "x", "tenantId": "tenant-a", "spaceId": "space-a"}
        )
        self.assertEqual(tampered["status"], "rollback_handle_invalid")

        expired_plan = make_plan([make_step("a", rollback={"expiresAt": "2000-01-01T00:00:00Z"})])
        expired_run = self.engine.execute_multihop_plan({"plan": expired_plan, "runId": "expired-run"})
        expired = self.engine.rollback_multihop(
            {
                "runId": "expired-run",
                "handle": expired_run["rollbackHandles"][0]["handle"],
                "tenantId": "tenant-a",
                "spaceId": "space-a",
                "currentResourceVersion": "v1",
            }
        )
        self.assertEqual(expired["status"], "rollback_handle_expired")

        divergent_run = self.engine.execute_multihop_plan({"plan": plan, "runId": "divergent-run"})
        divergent = self.engine.rollback_multihop(
            {
                "runId": "divergent-run",
                "handle": divergent_run["rollbackHandles"][0]["handle"],
                "tenantId": "tenant-a",
                "spaceId": "space-a",
                "currentResourceVersion": "v2",
            }
        )
        self.assertEqual(divergent["status"], "rollback_diverged")

    def test_checkpoint_resume_reconciles_committed_work_idempotently(self):
        plan = make_plan([make_step("a"), make_step("b", deps=["a"])])
        paused = self.engine.execute_multihop_plan(
            {"plan": plan, "runId": "resume-run", "crashAfterStepId": "a"}
        )
        self.assertEqual(paused["status"], "checkpoint_paused")
        before_resume = [self.detail(row)["stepId"] for row in self.lineage("resume-run") if row["hop_type"] == "step_action_invoked"]
        self.assertEqual(before_resume, ["a"])

        resumed = self.engine.resume_multihop_plan({"runId": "resume-run", "plan": plan})
        self.assertTrue(resumed["success"])
        after_resume = [self.detail(row)["stepId"] for row in self.lineage("resume-run") if row["hop_type"] == "step_action_invoked"]
        self.assertEqual(after_resume, ["a", "b"])

        replay = self.engine.resume_multihop_plan({"runId": "resume-run", "plan": plan})
        self.assertTrue(replay["success"])
        after_replay = [self.detail(row)["stepId"] for row in self.lineage("resume-run") if row["hop_type"] == "step_action_invoked"]
        self.assertEqual(after_replay, ["a", "b"], "resume replay must not duplicate actions")

        changed_plan = make_plan([make_step("a"), make_step("b", deps=["a"]), make_step("c", deps=["b"])])
        changed = self.engine.resume_multihop_plan({"runId": "resume-run", "plan": changed_plan})
        self.assertEqual(changed["status"], "changed_plan_denied")
        self.assertFalse(changed["success"])

    def test_evidence_bundle_is_deterministic_tamper_evident_redacted_and_run_scoped(self):
        plan = make_plan([make_step("a"), make_step("b", deps=["a"], outcome="failed_before_commit")])
        self.engine.execute_multihop_plan({"plan": plan, "runId": "evidence-run", "correlationId": "evidence-corr"})
        first = self.engine.get_multihop_evidence("evidence-run")
        second = self.engine.get_multihop_evidence("evidence-run")
        self.assertTrue(first["bundle"]["verification"]["valid"])
        self.assertEqual(first["bundle"]["bundleHash"], second["bundle"]["bundleHash"])
        self.assertNotIn("failed_before_commit", json.dumps(first["bundle"]))

        other_plan = make_plan([make_step("x")])
        self.engine.execute_multihop_plan({"plan": other_plan, "runId": "other-run"})
        scoped_ids = {event["detail"].get("stepId") for event in first["bundle"]["events"] if isinstance(event.get("detail"), dict)}
        self.assertNotIn("x", scoped_ids)

        row = self.store.conn.execute(
            "SELECT id, detail_json FROM orchestration_lineage WHERE run_id = ? AND hop_type = 'step_gate' LIMIT 1",
            ("evidence-run",),
        ).fetchone()
        detail = json.loads(row["detail_json"])
        detail["policyDecision"] = "tampered"
        self.store.conn.execute("UPDATE orchestration_lineage SET detail_json = ? WHERE id = ?", (json.dumps(detail), row["id"]))
        self.store.conn.commit()
        tampered = self.engine.get_multihop_evidence("evidence-run")
        self.assertFalse(tampered["bundle"]["verification"]["valid"])
        self.assertIn("event_hash_mismatch", {error["code"] for error in tampered["bundle"]["verification"]["errors"]})

    def test_recovery_evidence_is_append_only_and_partial_states_are_never_success(self):
        plan = make_plan([make_step("a"), make_step("b", deps=["a"], outcome="failed_before_commit")])
        result = self.engine.execute_multihop_plan({"plan": plan, "runId": "append-run"})
        self.assertFalse(result["success"])
        rows = self.lineage("append-run")
        committed_row = next(row for row in rows if row["hop_type"] == "step_committed")
        self.assertEqual(committed_row["hop_type"], "step_committed")
        self.assertIn("compensation_committed", [row["hop_type"] for row in rows])
        bundle = self.engine.get_multihop_evidence("append-run")["bundle"]
        self.assertFalse(bundle["run"]["success"])
        self.assertEqual(bundle["run"]["status"], "step_failed")
        self.assertTrue(bundle["verification"]["valid"])

    def test_signed_federation_proof_is_bound_to_steps_checkpoints_recovery_and_evidence(self):
        secret = "federation-test-secret"
        previous_secret = multihop.FEDERATION_PROOF_SECRET
        multihop.FEDERATION_PROOF_SECRET = secret
        try:
            plan = make_plan([make_step("a"), make_step("b", deps=["a"], outcome="failed_before_commit")])
            reference = {
                "artifactId": "artifact-1",
                "artifactHash": "sha256:artifact",
                "federationRunId": "federation-run-1",
                "packHash": "sha256:pack",
                "policyHash": "sha256:policy",
                "ontologyHash": "sha256:ontology",
                "tenantId": "tenant-a",
                "spaceId": "space-a",
            }
            signature = hmac.new(
                secret.encode("utf-8"),
                json.dumps({key: reference[key] for key in sorted(reference)}, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
            forged = self.engine.execute_multihop_plan({
                "plan": plan,
                "runId": "forged-federation-run",
                "federationProof": {**reference, "signature": "forged"},
            })
            self.assertEqual(forged["status"], "federation_proof_denied")
            self.assertEqual(self.store.conn.execute("SELECT COUNT(*) FROM orchestration_runs WHERE run_id = 'forged-federation-run'").fetchone()[0], 0)

            result = self.engine.execute_multihop_plan({
                "plan": plan,
                "runId": "federation-run",
                "federationProof": {**reference, "signature": signature},
            })
            self.assertEqual(result["status"], "step_failed")
            rows = self.lineage("federation-run")
            bound = [self.detail(row) for row in rows if row["hop_type"] in {
                "plan_validated", "step_gate", "step_action_invoked", "checkpoint_saved",
                "compensation_gate", "compensation_committed", "rollback_complete",
            }]
            self.assertGreater(len(bound), 0)
            self.assertTrue(all(row.get("federationProofHash") for row in bound))
            evidence = self.engine.get_multihop_evidence("federation-run")["bundle"]
            self.assertTrue(evidence["verification"]["valid"])
            self.assertIn("sha256:pack", json.dumps(evidence))
        finally:
            multihop.FEDERATION_PROOF_SECRET = previous_secret


if __name__ == "__main__":
    unittest.main()
