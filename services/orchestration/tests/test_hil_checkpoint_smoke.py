"""HIL checkpoint smoke test — Phase 144 (FLEET-12).

Verifies the full interrupt → resume cycle with checkpoint persistence:

  a. Creates a LangGraphRuntime with a temp DB.
  b. Starts a graph with requiresApproval=True and asserts status is
     waiting_for_approval and checkpointed: True.
  c. Resumes with approve and asserts status becomes approved.
  d. Verifies the checkpoint row exists in the SQLite DB.
  e. Verifies that after resume, the graph state contains the approval decision.
"""

import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from graph import LangGraphRuntime


class HilCheckpointSmokeTest(unittest.TestCase):
    """Phase 144 — multi-step graph interrupt → resume with operator-visible receipt."""

    def test_hil_interrupt_resume_with_checkpoint_verification(self):
        # (a) Create a LangGraphRuntime with a temp DB.
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "orchestration.db")
            runtime = LangGraphRuntime(db_path)

            # (b) Start a graph with requiresApproval=True.
            first = runtime.start(
                {
                    "runId": "run-smoke-144",
                    "taskSummary": "Phase 144 HIL checkpoint smoke",
                    "requiredCapability": "research",
                    "selectedAgentId": "agent-smoke",
                    "requiresApproval": True,
                }
            )

            # Assert status is waiting_for_approval and checkpointed: True.
            self.assertEqual(first["status"], "waiting_for_approval")
            self.assertTrue(first["checkpointed"], "graph must be checkpointed after interrupt")
            self.assertTrue(first["interrupts"], "interrupt list must be non-empty")
            self.assertEqual(first["runId"], "run-smoke-144")
            self.assertEqual(first["selectedAgentId"], "agent-smoke")

            # (d-pre) Verify the checkpoint row exists in the SQLite DB
            # BEFORE resume — the interrupt should have persisted a checkpoint.
            with sqlite3.connect(db_path) as conn:
                checkpoint_rows = conn.execute(
                    "SELECT COUNT(*) FROM checkpoints WHERE thread_id = ?",
                    ("run-smoke-144",),
                ).fetchone()[0]
            self.assertGreater(
                checkpoint_rows, 0, "checkpoint row must exist in DB after interrupt"
            )

            # (c) Resume with approve.
            resumed = runtime.resume("run-smoke-144", "approve")

            # Assert status becomes approved.
            self.assertEqual(resumed["status"], "approved")

            # (e) Verify that after resume, the graph state contains the approval decision.
            self.assertEqual(resumed["approvalDecision"], "approve")
            self.assertEqual(resumed["selectedAgentId"], "agent-smoke")
            self.assertEqual(resumed["interrupts"], [], "interrupts must clear after resume")

            # (d-post) Verify the checkpoint row still exists after resume.
            with sqlite3.connect(db_path) as conn:
                checkpoint_rows_after = conn.execute(
                    "SELECT COUNT(*) FROM checkpoints WHERE thread_id = ?",
                    ("run-smoke-144",),
                ).fetchone()[0]
            self.assertGreater(
                checkpoint_rows_after, 0, "checkpoint row must persist after resume"
            )

            # Verify the writes table also has entries (LangGraph checkpoint replay log).
            with sqlite3.connect(db_path) as conn:
                writes_count = conn.execute(
                    "SELECT COUNT(*) FROM writes WHERE thread_id = ?",
                    ("run-smoke-144",),
                ).fetchone()[0]
            self.assertGreater(
                writes_count, 0, "writes table must have entries for the checkpointed thread"
            )

    def test_hil_reject_sets_rejected_status_and_decision(self):
        """Verify that a reject decision produces a rejected status with the decision field."""
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "orchestration.db")
            runtime = LangGraphRuntime(db_path)

            first = runtime.start(
                {
                    "runId": "run-smoke-reject",
                    "taskSummary": "Phase 144 HIL reject smoke",
                    "requiredCapability": "research",
                    "selectedAgentId": "agent-smoke",
                    "requiresApproval": True,
                }
            )
            self.assertEqual(first["status"], "waiting_for_approval")

            resumed = runtime.resume("run-smoke-reject", "reject")
            self.assertEqual(resumed["status"], "rejected")
            self.assertEqual(resumed["approvalDecision"], "reject")

            # Checkpoint must persist even on reject.
            with sqlite3.connect(db_path) as conn:
                checkpoint_rows = conn.execute(
                    "SELECT COUNT(*) FROM checkpoints WHERE thread_id = ?",
                    ("run-smoke-reject",),
                ).fetchone()[0]
            self.assertGreater(checkpoint_rows, 0, "checkpoint must persist after reject")


if __name__ == "__main__":
    unittest.main()
