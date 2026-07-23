"""CONNMEM-05 — Reconciler tests."""
from __future__ import annotations

import tempfile
from pathlib import Path
from unittest import TestCase, main

from services.connmem.adapters.linear import IngestResult, LinearAdapter, LinearCli
from services.connmem.canonical_envelope import CanonicalRecord
from services.connmem.reconciler import Reconciler
from services.connmem.sync_ledger import SyncLedger


SOURCE = "linear"
WORKSPACE = "team-001"


def make_issue(mid: str, **overrides) -> dict:
    base = {
        "id": mid,
        "identifier": f"ACM-{mid}",
        "title": f"Issue {mid}",
        "description": "body",
        "url": f"https://linear.app/acm/issue/{mid}",
        "createdAt": "2026-01-15T10:00:00Z",
        "updatedAt": "2026-01-15T11:00:00Z",
        "archivedAt": None,
        "priority": 2,
        "state": {"name": "Todo", "type": "unstarted"},
        "team": {"id": WORKSPACE, "key": "ACM"},
        "assignee": {"id": "u-1", "name": "Alice", "email": "alice@acm.example"},
        "creator": {"id": "u-0", "name": "Founder", "email": "founder@acm.example"},
        "labels": {"nodes": []},
        "project": None,
        "cycle": None,
        "parent": None,
    }
    base.update(overrides)
    return base


class FakeLinearCli(LinearCli):
    def __init__(self, *, issues_by_team: dict[str, list[dict]] | None = None) -> None:
        self._issues_by_team = issues_by_team or {}

    def viewer(self) -> dict:
        return {"id": "u-0", "email": "x@x", "name": "X"}

    def teams(self, *, page_size: int = 50) -> list[dict]:
        return [{"id": tid, "key": tid.upper(), "name": tid} for tid in self._issues_by_team]

    def issues(self, *, team_id: str, page_size: int = 50, include_archived: bool = False) -> list[dict]:
        return list(self._issues_by_team.get(team_id, []))

    def comments(self, *, issue_id: str, page_size: int = 50) -> list[dict]:
        return []

    def projects(self, *, team_id: str, page_size: int = 50, include_archived: bool = False) -> list[dict]:
        return []

    def raw_introspect(self) -> dict:
        return {"data": {"__schema": {"queryType": {"name": "Query"}}}}


class ReconcilerTests(TestCase):
    def _setup(
        self,
        *,
        issues_by_team: dict[str, list[dict]] | None = None,
        source_provider_pairs: dict[str, list[str]] | None = None,
    ) -> tuple[Reconciler, SyncLedger, FakeLinearCli]:
        tmpdir = Path(tempfile.mkdtemp(prefix="connmem-recon-test-"))
        ledger = SyncLedger(tmpdir / "ledger.db")
        cli = FakeLinearCli(issues_by_team=issues_by_team or {})
        adapter = LinearAdapter(ledger=ledger, cli=cli)
        reconciler = Reconciler(
            ledger=ledger,
            adapters={"linear": adapter},
            source_provider_pairs=source_provider_pairs or {},
        )
        return reconciler, ledger, cli

    def test_known_source_walks_teams_and_captures(self) -> None:
        reconciler, ledger, _ = self._setup(
            issues_by_team={"team-001": [make_issue("i-1"), make_issue("i-2")]},
            source_provider_pairs={"linear": ["team-001"]},
        )
        report = reconciler.run(source="linear")
        self.assertEqual(report.captured, 2)
        self.assertEqual(report.failure_count, 0)
        # Both issues are in the ledger.
        self.assertIsNotNone(ledger.get("linear", "team-001", "i-1"))
        self.assertIsNotNone(ledger.get("linear", "team-001", "i-2"))

    def test_tombstones_rows_missing_from_live_listing(self) -> None:
        # Two issues in the ledger; only one in the live listing.
        reconciler, ledger, cli = self._setup(
            issues_by_team={"team-001": [make_issue("i-1")]},
            source_provider_pairs={"linear": ["team-001"]},
        )
        # Pre-seed a row for i-2 so the reconciler has to tombstone it.
        from services.connmem.adapters.linear import project_issue_to_canonical

        record = project_issue_to_canonical(issue=make_issue("i-2"), workspace_id=WORKSPACE)
        assert record is not None
        ledger.upsert(record, status="captured_unrouted")
        self.assertEqual(
            ledger.count_by_status("linear").get("captured_unrouted", 0), 1
        )

        report = reconciler.run(source="linear")
        self.assertEqual(report.tombstoned, 1)
        tombstoned_row = ledger.get("linear", "team-001", "i-2")
        assert tombstoned_row is not None
        self.assertEqual(tombstoned_row["status"], "tombstoned")
        self.assertEqual(tombstoned_row["tombstone"], True)

    def test_empty_live_listing_does_not_tombstone(self) -> None:
        # Live listing is empty (network failure); reconciler should NOT
        # mass-tombstone rows.
        reconciler, ledger, _ = self._setup(
            issues_by_team={"team-001": []},
            source_provider_pairs={"linear": ["team-001"]},
        )
        from services.connmem.adapters.linear import project_issue_to_canonical

        for mid in ("i-1", "i-2"):
            r = project_issue_to_canonical(issue=make_issue(mid), workspace_id=WORKSPACE)
            assert r is not None
            ledger.upsert(r, status="captured_unrouted")

        report = reconciler.run(source="linear")
        # No mass-deletion.
        self.assertEqual(report.tombstoned, 0)
        for mid in ("i-1", "i-2"):
            row = ledger.get("linear", "team-001", mid)
            assert row is not None
            self.assertEqual(row["status"], "captured_unrouted")

    def test_unknown_source_raises(self) -> None:
        reconciler, _, _ = self._setup()
        with self.assertRaises(ValueError):
            reconciler.run(source="notion")

    def test_idempotent_re_run_does_not_double_count_tombstones(self) -> None:
        reconciler, ledger, _ = self._setup(
            issues_by_team={"team-001": [make_issue("i-1")]},
            source_provider_pairs={"linear": ["team-001"]},
        )
        from services.connmem.adapters.linear import project_issue_to_canonical
        record = project_issue_to_canonical(issue=make_issue("i-2"), workspace_id=WORKSPACE)
        assert record is not None
        ledger.upsert(record, status="captured_unrouted")
        # First run tombstones i-2.
        r1 = reconciler.run(source="linear")
        self.assertEqual(r1.tombstoned, 1)
        # Second run: i-2 is already tombstoned, should not re-tombstone.
        r2 = reconciler.run(source="linear")
        self.assertEqual(r2.tombstoned, 0)

    def test_reports_cursor_after_pass(self) -> None:
        reconciler, _, _ = self._setup(
            issues_by_team={"team-001": [make_issue("i-1")]},
            source_provider_pairs={"linear": ["team-001"]},
        )
        report = reconciler.run(source="linear")
        self.assertTrue(report.cursor.startswith("linear#teams="))
        self.assertIn("team-001", report.cursor)


if __name__ == "__main__":
    main()