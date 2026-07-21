"""Contract tests for SyncLedger (Phase 176 CONNMEM-02).

Run with::
    python -m pytest services/connmem/tests/test_sync_ledger.py -v
"""
from __future__ import annotations

import os
import tempfile
import unittest

from services.connmem.canonical_envelope import CanonicalRecord, to_canonical_record
from services.connmem.sync_ledger import LEDGER_STATUSES, SyncLedger


def _sample_record(source: str = "circleback", source_id: str = "m-001") -> CanonicalRecord:
    return to_canonical_record(
        source=source,
        workspace_id="acme",
        object_type="meeting",
        source_id=source_id,
        source_url=f"https://{source}.example/{source_id}",
        created_at="2026-07-21T10:00:00Z",
        updated_at="2026-07-21T10:30:00Z",
        deleted_at=None,
        content_body=f"meeting body {source_id}",
    )


class SyncLedgerTests(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False)
        self.tmp.close()
        self.db_path = self.tmp.name
        self.ledger = SyncLedger(self.db_path)

    def tearDown(self):
        os.unlink(self.db_path)

    def test_first_upsert_inserts(self):
        r = _sample_record()
        inserted = self.ledger.upsert(r)
        self.assertTrue(inserted, "first upsert should insert")

    def test_repeat_upsert_idempotent_when_content_unchanged(self):
        r = _sample_record()
        self.ledger.upsert(r)
        again = self.ledger.upsert(r)  # identical body, same hash
        self.assertFalse(again, "re-upsert with identical hash should update, not insert")

    def test_upsert_with_changed_content_updates(self):
        r1 = _sample_record()
        self.ledger.upsert(r1)
        # Same key, different body → different hash → update
        r2 = to_canonical_record(
            source=r1.source, workspace_id=r1.workspace_id,
            object_type=r1.object_type, source_id=r1.source_id,
            source_url=r1.source_url,
            created_at=r1.created_at, updated_at="2026-07-21T11:00:00Z",
            deleted_at=None,
            content_body=b"different body",  # this changes content_hash
        )
        again = self.ledger.upsert(r2)
        self.assertFalse(again, "changed content → update, not insert")
        row = self.ledger.get(r1.source, r1.workspace_id, r1.source_id)
        self.assertEqual(row["payload"]["content_hash"], r2.content_hash)

    def test_get_returns_payload_for_known_key(self):
        r = _sample_record(source_id="m-known")
        self.ledger.upsert(r)
        row = self.ledger.get(r.source, r.workspace_id, r.source_id)
        self.assertIsNotNone(row)
        self.assertEqual(row["payload"]["source_id"], "m-known")
        self.assertEqual(row["status"], "captured_unrouted")

    def test_get_returns_none_for_unknown_key(self):
        row = self.ledger.get("circleback", "acme", "m-missing")
        self.assertIsNone(row)

    def test_count_by_status(self):
        self.ledger.upsert(_sample_record(source_id="a"))
        self.ledger.upsert(_sample_record(source_id="b"), status="recalled")
        self.ledger.upsert(_sample_record(source_id="c"), status="tombstoned")
        counts = self.ledger.count_by_status(source="circleback")
        self.assertEqual(counts.get("captured_unrouted"), 1)
        self.assertEqual(counts.get("recalled"), 1)
        self.assertEqual(counts.get("tombstoned"), 1)

    def test_invalid_status_rejected(self):
        with self.assertRaises(ValueError):
            self.ledger.upsert(_sample_record(), status="unknown_status")

    def test_default_status_is_captured_unrouted(self):
        self.ledger.upsert(_sample_record())
        row = self.ledger.get("circleback", "acme", "m-001")
        self.assertEqual(row["status"], "captured_unrouted")

    def test_distinct_providers_isolated(self):
        """Same source_id across two providers is two distinct rows."""
        circleback = _sample_record(source="circleback", source_id="same-id")
        linear = to_canonical_record(
            source="linear", workspace_id="acme-linear",
            object_type="issue", source_id="same-id",
            source_url="https://linear.example/same-id",
            created_at="2026-07-21T09:00:00Z",
            updated_at="2026-07-21T09:30:00Z",
            deleted_at=None,
            content_body=b"linear body",
        )
        self.ledger.upsert(circleback)
        self.ledger.upsert(linear)
        cb_row = self.ledger.get("circleback", "acme", "same-id")
        ln_row = self.ledger.get("linear", "acme-linear", "same-id")
        self.assertEqual(cb_row["payload"]["source"], "circleback")
        self.assertEqual(ln_row["payload"]["source"], "linear")


class ProviderEnumTests(unittest.TestCase):

    def test_ledger_statuses_closed_set(self):
        # The six-state enum must match memory_recall's enum shape.
        self.assertEqual(
            set(LEDGER_STATUSES),
            {
                "captured_unrouted",
                "routed_unindexed",
                "indexed_unrecalled",
                "recalled",
                "tombstoned",
                "dead_letter",
            },
        )


if __name__ == "__main__":
    unittest.main()
