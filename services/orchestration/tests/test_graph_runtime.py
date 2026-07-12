import os
import sqlite3
import tempfile
import unittest

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from graph import LangGraphRuntime


class LangGraphRuntimeTest(unittest.TestCase):
    def test_interrupts_and_resumes_from_sqlite_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "orchestration.db")
            runtime = LangGraphRuntime(db_path)

            first = runtime.start(
                {
                    "runId": "run-graph-1",
                    "taskSummary": "Approve graph task",
                    "requiredCapability": "research",
                    "selectedAgentId": "agent-1",
                    "requiresApproval": True,
                }
            )

            self.assertEqual(first["status"], "waiting_for_approval")
            self.assertTrue(first["checkpointed"])
            self.assertTrue(first["interrupts"])

            resumed = runtime.resume("run-graph-1", "approve")

            self.assertEqual(resumed["status"], "approved")
            self.assertEqual(resumed["approvalDecision"], "approve")
            self.assertEqual(resumed["selectedAgentId"], "agent-1")

            with sqlite3.connect(db_path) as conn:
                tables = {
                    row[0]
                    for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
                }
            self.assertIn("checkpoints", tables)
            self.assertIn("writes", tables)

    def test_routes_without_hil_through_stategraph(self):
        with tempfile.TemporaryDirectory() as tmp:
            runtime = LangGraphRuntime(os.path.join(tmp, "orchestration.db"))

            result = runtime.start(
                {
                    "runId": "run-graph-2",
                    "taskSummary": "Route graph task",
                    "selectedAgentId": "agent-2",
                    "requiresApproval": False,
                }
            )

            self.assertEqual(result["status"], "dispatched")
            self.assertEqual(result["selectedAgentId"], "agent-2")
            self.assertEqual(result["interrupts"], [])


    # HIL-01: Operator can edit declared state fields on a paused HIL thread and resume
    # to dispatch. Tests that edit_and_checkpoint() patches checkpoint without resuming,
    # and that subsequent resume() dispatches with the patched state.
    def test_hil_checkpoint_edit(self):
        # REQ: HIL-01
        with tempfile.TemporaryDirectory() as tmp:
            runtime = LangGraphRuntime(os.path.join(tmp, "orchestration.db"))

            # Start a task that requires approval (HIL interrupt)
            state = runtime.start(
                {
                    "runId": "run-hil-edit-1",
                    "taskSummary": "Deploy reviewed change",
                    "requiredCapability": "deploy",
                    "selectedAgentId": "agent-deploy",
                    "requiresApproval": True,
                }
            )
            self.assertEqual(state["status"], "waiting_for_approval")

            # Apply a state edit before resuming — this method does not exist yet (Wave 0 RED)
            edit_result = runtime.edit_and_checkpoint(
                "run-hil-edit-1",
                {"taskSummary": "Deploy reviewed change (edited)", "requiresApproval": False},
            )
            # After edit, before/after must be captured
            self.assertIn("before", edit_result)
            self.assertIn("after", edit_result)
            self.assertEqual(edit_result["after"]["requiresApproval"], False)

            # Resume should now dispatch (not approve), because requiresApproval=False
            resumed = runtime.resume("run-hil-edit-1", "approve")
            self.assertEqual(resumed["status"], "dispatched")

    def test_multihop_graph_loops_and_exposes_rollback_compensation_node(self):
        with tempfile.TemporaryDirectory() as tmp:
            runtime = LangGraphRuntime(os.path.join(tmp, "orchestration.db"))

            result = runtime.start(
                {
                    "runId": "run-graph-multihop",
                    "taskSummary": "Two hop graph task",
                    "selectedAgentId": "agent-graph",
                    "requiresApproval": False,
                    "hops": [{"id": "a"}, {"id": "b"}],
                    "currentHopIndex": 0,
                }
            )

            self.assertEqual(result["status"], "dispatched")
            with runtime._compiled() as compiled:
                self.assertIn("rollback_compensation", compiled.nodes)
                dispatch_node = compiled.nodes.get("dispatch")
                self.assertIsNotNone(dispatch_node)

    # ORCH-08: dispatch node retries up to max_attempts before exhausting the retry budget.
    # Tests that LangGraph RetryPolicy on the dispatch node causes re-execution before giving up.
    def test_dispatch_retry_policy(self):
        # REQ: ORCH-08
        with tempfile.TemporaryDirectory() as tmp:
            runtime = LangGraphRuntime(os.path.join(tmp, "orchestration.db"))

            # Start a task that bypasses HIL and dispatches directly
            state = runtime.start(
                {
                    "runId": "run-retry-1",
                    "taskSummary": "Retry policy test",
                    "selectedAgentId": "agent-retry",
                    "requiresApproval": False,
                }
            )

            # RetryPolicy on dispatch node requires langgraph >= 1.2.
            # _compiled() is a context manager — use it as one to access the compiled graph.
            with runtime._compiled() as compiled:
                dispatch_node = compiled.nodes.get("dispatch")
                self.assertIsNotNone(dispatch_node, "dispatch node must exist in compiled graph")
                # In LangGraph 1.2, retry_policy on a PregelNode is a tuple of RetryPolicy objects.
                retry_policy_tuple = getattr(dispatch_node, "retry_policy", None)
                self.assertIsNotNone(retry_policy_tuple, "dispatch node must have a RetryPolicy (ORCH-08)")
                # Unwrap tuple — retry_policy is (RetryPolicy(...),)
                retry_policy = retry_policy_tuple[0] if isinstance(retry_policy_tuple, tuple) else retry_policy_tuple
                self.assertGreater(retry_policy.max_attempts, 1, "max_attempts must be > 1")


if __name__ == "__main__":
    unittest.main()
