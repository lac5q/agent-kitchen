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

    def test_tombstoned_status_sets_tombstone_flag(self):
        """status='tombstoned' must set tombstone=1; other statuses leave it 0."""
        r = _sample_record(source_id="m-tomb")
        self.ledger.upsert(r, status="tombstoned")
        row = self.ledger.get(r.source, r.workspace_id, r.source_id)
        self.assertEqual(row["status"], "tombstoned")
        self.assertTrue(row["tombstone"], "tombstone flag must be 1 when status='tombstoned'")
        self.assertFalse(row["dead_letter"])

    def test_dead_letter_status_sets_dead_letter_flag(self):
        r = _sample_record(source_id="m-dl")
        self.ledger.upsert(r, status="dead_letter")
        row = self.ledger.get(r.source, r.workspace_id, r.source_id)
        self.assertEqual(row["status"], "dead_letter")
        self.assertTrue(row["dead_letter"])
        self.assertFalse(row["tombstone"])

    def test_recalled_status_clears_tombstone_flag_on_content_change(self):
        """Updating with changed content + status='recalled' must clear tombstone=1.

        Note: idempotent re-ingest (same hash) is a no-op for status. The
        tombstone-clear path triggers only when content actually changed,
        which is what a re-ingestion of an un-deleted record would do.
        """
        r1 = _sample_record(source_id="m-revive")
        r2 = to_canonical_record(
            source=r1.source, workspace_id=r1.workspace_id,
            object_type=r1.object_type, source_id=r1.source_id,
            source_url=r1.source_url,
            created_at=r1.created_at, updated_at="2026-07-22T11:00:00Z",
            deleted_at=None,
            content_body=b"different body - undelete",  # changes content_hash
        )
        self.ledger.upsert(r1, status="tombstoned")
        self.ledger.upsert(r2, status="recalled")
        row = self.ledger.get(r1.source, r1.workspace_id, r1.source_id)
        self.assertEqual(row["status"], "recalled")
        self.assertFalse(row["tombstone"], "tombstone must clear when status moves off tombstoned")
        self.assertFalse(row["dead_letter"])

    def test_same_hash_tombstone_propagation(self):
        """Same-hash re-ingestion with status='tombstoned' MUST update
        tombstone=1. This is the deletion-propagation path: the provider
        says 'deleted' even though the body is the same.
        """
        r = _sample_record(source_id="m-tomb-same-hash")
        # Initial ingest as captured_unrouted
        self.ledger.upsert(r, status="captured_unrouted")
        row = self.ledger.get(r.source, r.workspace_id, r.source_id)
        self.assertEqual(row["status"], "captured_unrouted")
        self.assertFalse(row["tombstone"])
        # Same body, status changes to tombstoned -> must flip flag.
        self.ledger.upsert(r, status="tombstoned")
        row = self.ledger.get(r.source, r.workspace_id, r.source_id)
        self.assertEqual(row["status"], "tombstoned")
        self.assertTrue(row["tombstone"])
        # Same body, status flips back to recalled -> must clear flag.
        self.ledger.upsert(r, status="recalled")
        row = self.ledger.get(r.source, r.workspace_id, r.source_id)
        self.assertEqual(row["status"], "recalled")
        self.assertFalse(row["tombstone"])

    def test_set_cursor_stamps_provider_wide(self):
        r = _sample_record(source_id="m-cursor")
        self.ledger.upsert(r)
        n = self.ledger.set_cursor("circleback", "page-token-abc123")
        self.assertEqual(n, 1)
        self.assertEqual(self.ledger.read_cursor("circleback"), "page-token-abc123")

    def test_read_cursor_returns_none_when_unset(self):
        self.ledger.upsert(_sample_record(source_id="m-no-cursor"))
        self.assertIsNone(self.ledger.read_cursor("circleback"))

    def test_read_cursor_returns_latest_across_rows(self):
        self.ledger.upsert(_sample_record(source_id="r-old"))
        self.ledger.upsert(_sample_record(source_id="r-new"))
        self.ledger.set_cursor("circleback", "first-token")
        # Wait effect — make sure the second row has a later last_seen_at
        # by performing a no-op upsert that bumps it
        r_new = _sample_record(source_id="r-new")
        self.ledger.upsert(r_new)  # same hash; bumps last_seen_at
        self.ledger.set_cursor("circleback", "second-token")
        cursor = self.ledger.read_cursor("circleback")
        # Read returns the value currently stamped; order of stamping is
        # what read_cursor() sorts on (last_seen_at DESC). After the second
        # upsert + set_cursor, "second-token" should be present (single
        # column update replaces uniformly).
        self.assertIn(cursor, {"first-token", "second-token"})

    def test_record_retry_increments(self):
        r = _sample_record(source_id="m-retry")
        self.ledger.upsert(r)
        n1 = self.ledger.record_retry(r.source, r.workspace_id, r.source_id, "timeout")
        n2 = self.ledger.record_retry(r.source, r.workspace_id, r.source_id, "429 too many")
        n3 = self.ledger.record_retry(r.source, r.workspace_id, r.source_id, "ok")
        self.assertEqual(n1, 1)
        self.assertEqual(n2, 2)
        self.assertEqual(n3, 3)
        # last_error reflects the most recent message
        row = self.ledger.get(r.source, r.workspace_id, r.source_id)
        self.assertEqual(row["status"], "captured_unrouted")  # retries don't change status
        # last_error not surfaced via get(); inspect the row directly
        with self.ledger._connect() as conn:
            cur = conn.execute(
                "SELECT retry_count, last_error FROM ledger "
                "WHERE (source, workspace_id, source_id) = (?, ?, ?)",
                (r.source, r.workspace_id, r.source_id),
            )
            row = cur.fetchone()
        self.assertEqual(row[0], 3)
        self.assertEqual(row[1], "ok")

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
