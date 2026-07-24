"""CONNMEM-03 — Circleback adapter tests.

Drives the adapter with a fake `CirclebackCli` so the production subprocess
binary is never required.
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any
from unittest import TestCase, main

from services.connmem.adapters.circleback import (
    SOURCE,
    CapabilityManifest,
    CirclebackAdapter,
    CirclebackCli,
    IngestResult,
    project_to_canonical,
)
from services.connmem.canonical_envelope import CanonicalRecord
from services.connmem.sync_ledger import SyncLedger


class FakeCirclebackCli(CirclebackCli):
    """In-memory CLI substitute — feeds canned responses into the adapter."""

    def __init__(self, *, search_pages: list[list[dict]], details: list[dict], transcripts: list[dict]) -> None:
        self._search_pages = list(search_pages)
        self._details = list(details)
        self._transcripts = list(transcripts)
        self._search_calls: list[int] = []
        self._read_calls: list[list[str]] = []
        self._transcript_calls: list[list[str]] = []

    def meetings_search(self, *, since: str, page: int) -> list[dict]:
        self._search_calls.append(page)
        if page - 1 < len(self._search_pages):
            return list(self._search_pages[page - 1])
        return []

    def meetings_read(self, ids: list[str]) -> list[dict]:
        self._read_calls.append(list(ids))
        return list(self._details)

    def transcripts_read(self, ids: list[str]) -> list[dict]:
        self._transcript_calls.append(list(ids))
        return list(self._transcripts)


def make_meeting(*, mid: str, attendees: list[str] | None = None, private: bool = False, updated: str | None = None) -> dict:
    return {
        "id": mid,
        "name": f"Meeting {mid}",
        "createdAt": "2026-01-15T10:00:00Z",
        "updatedAt": updated or "2026-01-15T10:30:00Z",
        "attendees": [{"name": a} for a in (attendees or ["alice@example.com"])],
        "private": private,
        "notes": "Standup notes",
        "actionItems": [{"text": "ship phase 179"}],
        "url": f"https://app.circleback.com/meetings/{mid}",
    }


def make_transcript(*, mid: str) -> dict:
    return {
        "meetingId": mid,
        "entries": [
            {"speaker": {"name": "Alice"}, "text": "Status update?"},
            {"speaker": {"name": "Bob"}, "text": "On track."},
            {"speaker": {"name": "Alice"}, "text": "Great."},
        ],
    }


class ProjectionTests(TestCase):
    def test_projects_meeting_with_full_shape(self) -> None:
        detail = make_meeting(mid="m-1")
        record = project_to_canonical(
            meeting_id="m-1",
            detail=detail,
            transcript_entries=[],
            workspace_id="default",
        )
        assert record is not None
        self.assertEqual(record.source, "circleback")
        self.assertEqual(record.workspace_id, "default")
        self.assertEqual(record.object_type, "meeting")
        self.assertEqual(record.source_id, "m-1")
        self.assertEqual(record.source_url, "https://app.circleback.com/meetings/m-1")
        self.assertEqual(record.created_at, "2026-01-15T10:00:00Z")
        self.assertEqual(record.updated_at, "2026-01-15T10:30:00Z")
        self.assertEqual(record.deleted_at, None)
        self.assertEqual(record.participants, ("alice@example.com",))
        self.assertEqual(record.owners, ("alice@example.com",))
        self.assertIn(record.visibility, ("private", "internal", "team", "public"))
        self.assertIn(record.sensitivity, ("safe", "sensitive", "restricted"))
        self.assertEqual(record.schema_version, "connmem/canonical-envelope/v1")
        # 64 hex chars (sha256)
        self.assertEqual(len(record.content_hash), 64)

    def test_projection_is_deterministic(self) -> None:
        detail = make_meeting(mid="m-1")
        a = project_to_canonical(meeting_id="m-1", detail=detail, transcript_entries=[], workspace_id="default")
        b = project_to_canonical(meeting_id="m-1", detail=detail, transcript_entries=[], workspace_id="default")
        assert a is not None and b is not None
        self.assertEqual(a.content_hash, b.content_hash)

    def test_different_transcript_yields_different_hash(self) -> None:
        detail = make_meeting(mid="m-1")
        a = project_to_canonical(meeting_id="m-1", detail=detail, transcript_entries=[], workspace_id="default")
        b = project_to_canonical(
            meeting_id="m-1",
            detail=detail,
            transcript_entries=[{"speaker": {"name": "X"}, "text": "y"}],
            workspace_id="default",
        )
        assert a is not None and b is not None
        self.assertNotEqual(a.content_hash, b.content_hash)

    def test_skips_record_without_timestamps(self) -> None:
        detail = {"id": "m-1", "name": "no dates"}
        record = project_to_canonical(
            meeting_id="m-1",
            detail=detail,
            transcript_entries=[],
            workspace_id="default",
        )
        self.assertIsNone(record)

    def test_private_flag_sets_visibility_private(self) -> None:
        detail = make_meeting(mid="m-1", private=True)
        record = project_to_canonical(
            meeting_id="m-1",
            detail=detail,
            transcript_entries=[],
            workspace_id="default",
        )
        assert record is not None
        self.assertEqual(record.visibility, "private")

    def test_deleted_at_parses_when_present(self) -> None:
        detail = make_meeting(mid="m-1")
        detail["deletedAt"] = "2026-02-01T00:00:00Z"
        record = project_to_canonical(
            meeting_id="m-1",
            detail=detail,
            transcript_entries=[],
            workspace_id="default",
        )
        assert record is not None
        self.assertEqual(record.deleted_at, "2026-02-01T00:00:00Z")


class IngestTests(TestCase):
    def _setup(self) -> tuple[CirclebackAdapter, FakeCirclebackCli, Path]:
        tmpdir = Path(tempfile.mkdtemp(prefix="connmem-cb-test-"))
        db = tmpdir / "ledger.db"
        ledger = SyncLedger(db)

        page1 = [make_meeting(mid="m-1"), make_meeting(mid="m-2"), make_meeting(mid="m-3")]
        details = [
            make_meeting(mid="m-1"),
            make_meeting(mid="m-2"),
            make_meeting(mid="m-3"),
        ]
        transcripts = [
            make_transcript(mid="m-1"),
            make_transcript(mid="m-2"),
            make_transcript(mid="m-3"),
        ]
        cli = FakeCirclebackCli(search_pages=[page1], details=details, transcripts=transcripts)
        adapter = CirclebackAdapter(ledger=ledger, cli=cli, workspace_id="default")
        return adapter, cli, tmpdir

    def test_ingest_captures_all_meetings_and_stops_on_short_page(self) -> None:
        adapter, cli, tmpdir = self._setup()
        result = adapter.ingest(since="2026-01-01")
        self.assertEqual(result.captured_count, 3)
        self.assertEqual(result.skipped_count, 0)
        self.assertEqual(result.failure_count, 0)
        self.assertEqual(len(cli._search_calls), 1, "should stop after one short page")
        self.assertTrue(result.cursor.startswith("2026-01-01"))

    def test_ingest_is_idempotent(self) -> None:
        adapter, _cli, tmpdir = self._setup()
        adapter.ingest(since="2026-01-01")
        # Reset the fake's call counters; run again.
        adapter2 = CirclebackAdapter(ledger=adapter._ledger, cli=_cli, workspace_id="default")  # noqa: SLF001
        result2 = adapter2.ingest(since="2026-01-01")
        self.assertEqual(result2.captured_count, 3)
        # The ledger should not have grown: all 3 are same-hash re-ingestions.
        statuses = adapter._ledger.count_by_status(SOURCE)  # noqa: SLF001
        self.assertEqual(statuses.get("captured_unrouted", 0), 3)

    def test_ingest_detects_content_update(self) -> None:
        adapter, _cli, tmpdir = self._setup()
        adapter.ingest(since="2026-01-01")
        # Mutate one meeting's detail so content_hash changes.
        new_details = [
            make_meeting(mid="m-1", updated="2026-01-15T11:00:00Z"),  # newer updatedAt
            make_meeting(mid="m-2"),
            make_meeting(mid="m-3"),
        ]
        _cli._details = new_details
        adapter2 = CirclebackAdapter(ledger=adapter._ledger, cli=_cli, workspace_id="default")  # noqa: SLF001
        result2 = adapter2.ingest(since="2026-01-01")
        self.assertEqual(result2.captured_count, 3)
        # m-1's row should be updated; m-2 + m-3 should remain same-hash no-ops.
        row_m1 = adapter._ledger.get(SOURCE, "default", "m-1")  # noqa: SLF001
        assert row_m1 is not None
        self.assertEqual(row_m1["status"], "captured_unrouted")

    def test_ingest_handles_missing_detail(self) -> None:
        tmpdir = Path(tempfile.mkdtemp(prefix="connmem-cb-test-"))
        ledger = SyncLedger(tmpdir / "ledger.db")
        page1 = [make_meeting(mid="m-1"), make_meeting(mid="m-2")]
        # Details only include m-1; m-2 will be missing.
        cli = FakeCirclebackCli(search_pages=[page1], details=[make_meeting(mid="m-1")], transcripts=[])
        adapter = CirclebackAdapter(ledger=ledger, cli=cli, workspace_id="default")
        result = adapter.ingest(since="2026-01-01")
        self.assertEqual(result.captured_count, 1)
        self.assertEqual(result.failure_count, 1)
        failed_id, _ = result.failures[0]
        self.assertEqual(failed_id, "m-2")

    def test_ingest_pages_until_short_page(self) -> None:
        tmpdir = Path(tempfile.mkdtemp(prefix="connmem-cb-test-"))
        ledger = SyncLedger(tmpdir / "ledger.db")
        # Two full pages then a short page → should stop after 3 calls.
        full_a = [make_meeting(mid=f"m-{i}") for i in range(20)]
        full_b = [make_meeting(mid=f"m-{i + 20}") for i in range(20)]
        short = [make_meeting(mid=f"m-{i + 40}") for i in range(5)]
        all_meetings = full_a + full_b + short
        # Note: details are returned as a single batch; we fake that
        # `meetings_read` returns all 45 in one call.
        details = [make_meeting(mid=m["id"]) for m in all_meetings]
        transcripts = [make_transcript(mid=m["id"]) for m in all_meetings]
        cli = FakeCirclebackCli(
            search_pages=[full_a, full_b, short],
            details=details,
            transcripts=transcripts,
        )
        adapter = CirclebackAdapter(ledger=ledger, cli=cli, workspace_id="default")
        result = adapter.ingest(since="2026-01-01")
        self.assertEqual(result.captured_count, 45)
        self.assertEqual(len(cli._search_calls), 3)


class CapabilityManifestTests(TestCase):
    def test_manifest_serializes_to_dict(self) -> None:
        m = CapabilityManifest(
            meetings_listing=True,
            meetings_detail=True,
            transcripts=True,
            has_memories_endpoint=False,
            has_organization_endpoint=False,
            has_webhook=False,
            has_deletion_feed=False,
            raw={"binary": "circleback"},
        )
        d = json.loads(json.dumps(m, default=lambda o: o.__dict__))
        self.assertTrue(d["meetings_listing"])
        self.assertFalse(d["has_webhook"])


if __name__ == "__main__":
    main()