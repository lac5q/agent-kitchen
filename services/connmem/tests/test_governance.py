"""CONNMEM-08 — Governance (auth + privacy + retention + deletion) tests."""
from __future__ import annotations

import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import TestCase, main

from services.connmem.canonical_envelope import CanonicalRecord
from services.connmem.governance import (
    DeletionReceipt,
    Identity,
    PurgePlanner,
    RetentionPolicy,
    default_ttl_days,
    is_visible_to,
    sign_receipt,
)
from services.connmem.sync_ledger import SyncLedger


def make_record(**overrides) -> CanonicalRecord:
    base = dict(
        source="linear",
        workspace_id="team-001",
        object_type="issue",
        source_id="ACM-1",
        source_url="https://linear.app/acme/issue/ACM-1",
        created_at="2024-01-01T00:00:00.000Z",
        updated_at="2024-01-02T00:00:00.000Z",
        deleted_at=None,
        content_hash="a" * 64,
        parent_ids=(),
        participants=("u-1",),
        owners=("u-0",),
        visibility="team",
        sensitivity="safe",  # default TTL is 2y for safe; tests use this
        captured_at="2024-01-02T00:00:01.000Z",
        schema_version="connmem/canonical-envelope/v1",
    )
    base.update(overrides)
    return CanonicalRecord(**base)


class VisibilityTests(TestCase):
    def test_admin_sees_everything(self) -> None:
        record = make_record(visibility="private")
        self.assertTrue(is_visible_to(record=record, identity=Identity("u", "admin")))

    def test_system_sees_everything(self) -> None:
        record = make_record(visibility="private")
        self.assertTrue(is_visible_to(record=record, identity=Identity("sys", "system")))

    def test_agent_does_not_see_private(self) -> None:
        record = make_record(visibility="private", workspace_id="team-001")
        identity = Identity("u", "agent", workspaces=("team-001",))
        self.assertFalse(is_visible_to(record=record, identity=identity))

    def test_agent_sees_team_visible(self) -> None:
        record = make_record(visibility="team", workspace_id="team-001")
        identity = Identity("u", "agent", workspaces=("team-001",))
        self.assertTrue(is_visible_to(record=record, identity=identity))

    def test_operator_sees_only_assigned_workspaces(self) -> None:
        record = make_record(workspace_id="team-001")
        op_no_access = Identity("u", "operator", workspaces=("team-002",))
        op_with_access = Identity("u", "operator", workspaces=("team-001",))
        self.assertFalse(is_visible_to(record=record, identity=op_no_access))
        self.assertTrue(is_visible_to(record=record, identity=op_with_access))

    def test_operator_sees_private_only_in_assigned_workspaces(self) -> None:
        record = make_record(visibility="private", workspace_id="team-001")
        op_no_access = Identity("u", "operator", workspaces=("team-002",))
        op_with_access = Identity("u", "operator", workspaces=("team-001",))
        self.assertFalse(is_visible_to(record=record, identity=op_no_access))
        self.assertTrue(is_visible_to(record=record, identity=op_with_access))


class RetentionPolicyTests(TestCase):
    def test_default_ttl_lookup(self) -> None:
        self.assertEqual(default_ttl_days(source="linear", sensitivity="safe"), 365 * 2)
        self.assertEqual(default_ttl_days(source="circleback", sensitivity="sensitive"), 365 * 3)
        self.assertEqual(default_ttl_days(source="unknown", sensitivity="unknown"), 365 * 2)

    def test_record_older_than_ttl_is_expired(self) -> None:
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        record = make_record(
            created_at=(now - timedelta(days=1000)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        policy = RetentionPolicy(now=now)
        self.assertTrue(policy.is_expired(record=record, now=now))

    def test_record_newer_than_ttl_is_not_expired(self) -> None:
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        record = make_record(
            created_at=(now - timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        policy = RetentionPolicy(now=now)
        self.assertFalse(policy.is_expired(record=record, now=now))

    def test_legal_hold_overrides_ttl(self) -> None:
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        record = make_record(
            created_at=(now - timedelta(days=1000)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        base = RetentionPolicy(now=now)
        held = base.with_legal_hold(
            source=record.source,
            workspace_id=record.workspace_id,
            source_id=record.source_id,
        )
        self.assertFalse(held.is_expired(record=record, now=now))
        # But the underlying TTL still applies without the hold.
        self.assertTrue(base.is_expired(record=record, now=now))


class PurgePlannerTests(TestCase):
    def _setup(self, *, now: datetime | None = None):
        tmpdir = Path(tempfile.mkdtemp(prefix="connmem-purge-test-"))
        ledger = SyncLedger(tmpdir / "ledger.db")
        policy = RetentionPolicy(now=now)
        planner = PurgePlanner(ledger=ledger, policy=policy, now=now)
        return planner, ledger, tmpdir

    def test_plan_is_dry_run_by_default(self) -> None:
        planner, ledger, _ = self._setup()
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        # Seed an expired record.
        expired = make_record(
            source_id="EXPIRED",
            created_at=(now - timedelta(days=1000)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        ledger.upsert(expired, status="captured_unrouted")
        # Seed a fresh record.
        fresh = make_record(
            source_id="FRESH",
            created_at=(now - timedelta(days=10)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        ledger.upsert(fresh, status="captured_unrouted")

        plan = planner.plan()
        self.assertTrue(plan.dry_run)
        self.assertEqual(plan.entry_count, 1)
        self.assertEqual(plan.by_reason.get("expired", 0), 1)
        # Ledger rows still present (dry-run).
        self.assertIsNotNone(ledger.get("linear", "team-001", "EXPIRED"))
        self.assertIsNotNone(ledger.get("linear", "team-001", "FRESH"))

    def test_execute_without_commit_is_dry_run(self) -> None:
        planner, ledger, _ = self._setup()
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        expired = make_record(
            source_id="EXPIRED",
            created_at=(now - timedelta(days=1000)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        ledger.upsert(expired, status="captured_unrouted")
        plan = planner.plan()
        receipt = planner.execute(plan, commit=False, operator_id="op-1")
        self.assertIsInstance(receipt, DeletionReceipt)
        self.assertFalse(receipt.committed)
        self.assertEqual(receipt.operator_id, "op-1")
        self.assertEqual(len(receipt.entries), 1)
        # Ledger row still present.
        self.assertIsNotNone(ledger.get("linear", "team-001", "EXPIRED"))

    def test_execute_with_commit_actually_deletes(self) -> None:
        planner, ledger, _ = self._setup()
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        expired = make_record(
            source_id="EXPIRED",
            created_at=(now - timedelta(days=1000)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        ledger.upsert(expired, status="captured_unrouted")
        plan = planner.plan()
        receipt = planner.execute(plan, commit=True, operator_id="op-1")
        self.assertTrue(receipt.committed)
        # Ledger row is gone.
        self.assertIsNone(ledger.get("linear", "team-001", "EXPIRED"))

    def test_legal_hold_excludes_from_purge(self) -> None:
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        tmpdir = Path(tempfile.mkdtemp(prefix="connmem-purge-test-"))
        ledger = SyncLedger(tmpdir / "ledger.db")
        record = make_record(
            source_id="HELD",
            created_at=(now - timedelta(days=1000)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        ledger.upsert(record, status="captured_unrouted")
        base = RetentionPolicy(now=now)
        held = base.with_legal_hold(
            source=record.source,
            workspace_id=record.workspace_id,
            source_id=record.source_id,
        )
        planner = PurgePlanner(ledger=ledger, policy=held, now=now)
        plan = planner.plan()
        self.assertEqual(plan.entry_count, 0)


class ReceiptSignatureTests(TestCase):
    def test_signature_is_deterministic_for_same_entries(self) -> None:
        from services.connmem.governance import PurgeEntry

        entries = (PurgeEntry("linear", "team-001", "ACM-1", "expired", "2026-01-01T00:00:00Z"),)
        s1 = sign_receipt(operator_id="op-1", entries=entries, committed=False)
        s2 = sign_receipt(operator_id="op-1", entries=entries, committed=False)
        self.assertEqual(s1, s2)

    def test_signature_changes_with_committed_flag(self) -> None:
        from services.connmem.governance import PurgeEntry

        entries = (PurgeEntry("linear", "team-001", "ACM-1", "expired", "2026-01-01T00:00:00Z"),)
        s1 = sign_receipt(operator_id="op-1", entries=entries, committed=False)
        s2 = sign_receipt(operator_id="op-1", entries=entries, committed=True)
        self.assertNotEqual(s1, s2)


if __name__ == "__main__":
    main()