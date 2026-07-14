import os
import sqlite3
import tempfile
import unittest

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from app import app


AGENTS = [
    {
        "id": "graph-agent",
        "name": "Graph Agent",
        "status": "active",
        "protocol": "a2a",
        "capabilities": [{"id": "research", "name": "Research", "tags": ["research"]}],
    }
]


class OrchestrationAppTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "orchestration.db")
        self.prev_db = os.environ.get("ORCHESTRATION_DB_PATH")
        os.environ["ORCHESTRATION_DB_PATH"] = self.db_path
        self.client = TestClient(app)

    def tearDown(self):
        if self.prev_db is None:
            os.environ.pop("ORCHESTRATION_DB_PATH", None)
        else:
            os.environ["ORCHESTRATION_DB_PATH"] = self.prev_db
        self.tmp.cleanup()

    def test_route_and_resolve_hil_uses_langgraph_checkpoint(self):
        response = self.client.post(
            "/tasks/route",
            json={
                "taskSummary": "Approve through graph",
                "requiredCapability": "research",
                "agents": AGENTS,
                "requiresApproval": True,
                "correlationId": "corr-app-graph",
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "waiting_for_approval")
        self.assertEqual(body["graphState"]["status"], "waiting_for_approval")
        self.assertTrue(body["graphState"]["interrupts"])

        resolved = self.client.post(f"/hil/{body['hilDecisionId']}/resolve", json={"decision": "approve"})
        self.assertEqual(resolved.status_code, 200)
        resolved_body = resolved.json()
        self.assertEqual(resolved_body["status"], "approved")
        self.assertEqual(resolved_body["graphState"]["status"], "approved")

        with sqlite3.connect(self.db_path) as conn:
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        self.assertIn("checkpoints", tables)
        self.assertIn("orchestration_runs", tables)

    def test_reject_hil_also_resumes_langgraph_checkpoint(self):
        response = self.client.post(
            "/tasks/route",
            json={
                "taskSummary": "Reject through graph",
                "requiredCapability": "research",
                "agents": AGENTS,
                "requiresApproval": True,
                "correlationId": "corr-app-reject",
            },
        )
        body = response.json()

        rejected = self.client.post(f"/hil/{body['hilDecisionId']}/resolve", json={"decision": "reject"})

        self.assertEqual(rejected.status_code, 200)
        rejected_body = rejected.json()
        self.assertEqual(rejected_body["status"], "rejected")
        self.assertEqual(rejected_body["graphState"]["status"], "rejected")
        self.assertEqual(rejected_body["graphState"]["approvalDecision"], "reject")


    def test_multihop_plan_validate_execute_resume_rollback_and_evidence_endpoints(self):
        plan = {
            "id": "api-plan",
            "scope": {"tenantId": "tenant-a", "spaceId": "space-a", "purpose": "api"},
            "budgets": {"maxSteps": 2, "maxCalls": 2, "maxSideEffects": 2},
            "steps": [
                {
                    "id": "a",
                    "scope": {"tenantId": "tenant-a", "spaceId": "space-a", "purpose": "api"},
                    "inputHash": "input-a",
                    "actionHash": "action-a",
                    "checkpoint": {},
                    "gate": {
                        "policyDecision": "allow",
                        "identity": {"tenantId": "tenant-a", "spaceId": "space-a"},
                        "freshness": "fresh",
                        "verification": "passed",
                    },
                    "sideEffect": {
                        "resourceId": "resource-a",
                        "version": "v1",
                        "boundary": {"resourceId": "resource-a"},
                        "compensation": {"verb": "undo"},
                    },
                },
                {
                    "id": "b",
                    "dependsOn": ["a"],
                    "scope": {"tenantId": "tenant-a", "spaceId": "space-a", "purpose": "api"},
                    "inputHash": "input-b",
                    "actionHash": "action-b",
                    "checkpoint": {},
                    "gate": {
                        "policyDecision": "allow",
                        "identity": {"tenantId": "tenant-a", "spaceId": "space-a"},
                        "freshness": "fresh",
                        "verification": "passed",
                    },
                    "sideEffect": {
                        "resourceId": "resource-b",
                        "version": "v1",
                        "boundary": {"resourceId": "resource-b"},
                        "compensation": {"verb": "undo"},
                    },
                },
            ],
        }

        validation = self.client.post("/plans/validate", json={"plan": plan})
        self.assertEqual(validation.status_code, 200)
        self.assertTrue(validation.json()["ok"])

        executed = self.client.post(
            "/plans/execute",
            json={"plan": plan, "runId": "api-run", "crashAfterStepId": "a"},
        )
        self.assertEqual(executed.status_code, 200)
        self.assertEqual(executed.json()["status"], "checkpoint_paused")

        resumed = self.client.post("/runs/api-run/resume", json={"plan": plan})
        self.assertEqual(resumed.status_code, 200)
        self.assertTrue(resumed.json()["success"])

        evidence = self.client.get("/runs/api-run/evidence")
        self.assertEqual(evidence.status_code, 200)
        self.assertTrue(evidence.json()["bundle"]["verification"]["valid"])

        handle = resumed.json()["rollbackHandles"][0]["handle"]
        rollback = self.client.post(
            "/runs/api-run/rollback",
            json={"handle": handle, "tenantId": "tenant-a", "spaceId": "space-a", "currentResourceVersion": "v1"},
        )
        self.assertEqual(rollback.status_code, 200)
        self.assertEqual(rollback.json()["status"], "rollback_completed")

    # HIL-02: Unknown keys in the edit payload must be rejected with HTTP 422.
    # Tests that HilEditRequest Pydantic model on PATCH /hil/{id}/edit enforces schema.
    def test_hil_edit_validation(self):
        # REQ: HIL-02
        # First create a paused HIL task
        route_resp = self.client.post(
            "/tasks/route",
            json={
                "taskSummary": "Validate edit payload",
                "requiredCapability": "research",
                "agents": AGENTS,
                "requiresApproval": True,
                "correlationId": "corr-edit-validation",
            },
        )
        self.assertEqual(route_resp.status_code, 200)
        hil_id = route_resp.json().get("hilDecisionId")
        self.assertTrue(hil_id, "must have a hilDecisionId to edit")

        # PATCH /hil/{id}/edit does not exist yet (Wave 0 RED) — endpoint missing returns 404 or 405
        # Once HIL-02 is implemented, unknown_key must return 422
        valid_edit = self.client.patch(
            f"/hil/{hil_id}/edit",
            json={"taskSummary": "Edited summary"},
        )
        # Accept 200 (success) only after implementation. Now expects 404/405/422.
        self.assertIn(
            valid_edit.status_code,
            [200],
            f"Expected 200 for valid edit after implementation; got {valid_edit.status_code}",
        )
        # Response contract verification (Plan 05 depends on this shape)
        body = valid_edit.json()
        self.assertTrue(body.get("ok"), "Response must include ok=true")
        self.assertIn("editedFields", body, "Response must include editedFields list")
        self.assertIn("taskSummary", body["editedFields"], "Edited field must appear in editedFields")

        unknown_key_edit = self.client.patch(
            f"/hil/{hil_id}/edit",
            json={"unknown_key_that_does_not_exist": "injected_value"},
        )
        self.assertEqual(
            unknown_key_edit.status_code,
            422,
            "Unknown keys in edit payload must return 422 (Pydantic validation)",
        )


if __name__ == "__main__":
    unittest.main()
