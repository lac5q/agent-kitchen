"""CONNMEM-07 — Unified recall + cross-source linking tests."""
from __future__ import annotations

from pathlib import Path
from unittest import TestCase, main

from services.connmem.canonical_envelope import CanonicalRecord
from services.connmem.projections import Projector
from services.connmem.recall import Recall, RecallHit, ReviewableLink
from services.connmem.tests.test_projections import MemFs


def write_record(proj: Projector, **overrides) -> CanonicalRecord:
    record = CanonicalRecord(
        source="linear",
        workspace_id="team-001",
        object_type="issue",
        source_id="ACM-101",
        source_url="https://linear.app/acme/issue/ACM-101",
        created_at="2026-07-21T08:30:00.000Z",
        updated_at="2026-07-21T09:15:00.000Z",
        deleted_at=None,
        content_hash=("a" * 64),
        parent_ids=(),
        participants=("u-1",),
        owners=("u-0",),
        visibility="team",
        sensitivity="sensitive",
        captured_at="2026-07-21T09:15:01.000Z",
        schema_version="connmem/canonical-envelope/v1",
    )
    # Apply overrides.
    for k, v in overrides.items():
        setattr(record, k, v)
    proj.project(record)
    return record


class SearchTests(TestCase):
    def _setup(self) -> tuple[Projector, Recall]:
        fs = MemFs()
        proj = Projector(root=Path("/mem"), fs=fs)
        # Two distinct records under different workspaces.
        proj.project(
            CanonicalRecord(
                source="linear",
                workspace_id="team-001",
                object_type="issue",
                source_id="ACM-101",
                source_url="https://linear.app/acme/issue/ACM-101",
                created_at="2026-07-21T08:30:00.000Z",
                updated_at="2026-07-21T09:15:00.000Z",
                deleted_at=None,
                content_hash="a" * 64,
                parent_ids=(),
                participants=("u-1",),
                owners=("u-0",),
                visibility="team",
                sensitivity="sensitive",
                captured_at="2026-07-21T09:15:01.000Z",
                schema_version="connmem/canonical-envelope/v1",
            )
        )
        proj.project(
            CanonicalRecord(
                source="circleback",
                workspace_id="default",
                object_type="meeting",
                source_id="m-7",
                source_url="https://app.circleback.com/meetings/m-7",
                created_at="2026-07-20T10:00:00.000Z",
                updated_at="2026-07-20T11:00:00.000Z",
                deleted_at=None,
                content_hash="b" * 64,
                parent_ids=(),
                participants=("u-0", "u-1"),
                owners=("u-0",),
                visibility="internal",
                sensitivity="safe",
                captured_at="2026-07-20T11:00:01.000Z",
                schema_version="connmem/canonical-envelope/v1",
            )
        )
        return proj, Recall(root=Path("/mem"), fs=fs, projector=proj)

    def test_search_returns_ranked_hits(self) -> None:
        _, recall = self._setup()
        hits = recall.search("meeting", include_deleted=False)
        self.assertGreater(len(hits), 0)
        # Higher-scoring hits first.
        scores = [h.score for h in hits]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_search_filters_by_source(self) -> None:
        _, recall = self._setup()
        hits = recall.search("u-0", sources=["linear"])
        self.assertTrue(all(h.source == "linear" for h in hits))
        self.assertEqual(len(hits), 0)  # The body doesn't contain "u-0"

    def test_search_filters_by_object_type(self) -> None:
        _, recall = self._setup()
        hits = recall.search("issue", object_types=["issue"])
        self.assertTrue(all(h.object_type == "issue" for h in hits))

    def test_search_filters_by_workspace(self) -> None:
        _, recall = self._setup()
        hits = recall.search("team", workspace_id="team-001")
        self.assertTrue(all(h.workspace_id == "team-001" for h in hits))

    def test_search_excludes_deleted_by_default(self) -> None:
        fs = MemFs()
        proj = Projector(root=Path("/mem"), fs=fs)
        # Write a deleted record.
        proj.project(
            CanonicalRecord(
                source="linear",
                workspace_id="team-001",
                object_type="issue",
                source_id="TOMBSTONED-1",
                source_url="https://linear.app/acme/issue/TOMBSTONED-1",
                created_at="2026-07-21T08:30:00.000Z",
                updated_at="2026-07-21T09:15:00.000Z",
                deleted_at="2026-07-22T00:00:00.000Z",
                content_hash="c" * 64,
                parent_ids=(),
                participants=(),
                owners=(),
                visibility="team",
                sensitivity="sensitive",
                captured_at="2026-07-21T09:15:01.000Z",
                schema_version="connmem/canonical-envelope/v1",
            )
        )
        recall = Recall(root=Path("/mem"), fs=fs, projector=proj)
        hits = recall.search("issue", include_deleted=False)
        self.assertEqual(len(hits), 0)
        hits_with_deleted = recall.search("issue", include_deleted=True)
        self.assertEqual(len(hits_with_deleted), 1)

    def test_search_returns_empty_for_no_match(self) -> None:
        _, recall = self._setup()
        hits = recall.search("nonexistent_token_xyz")
        self.assertEqual(hits, [])

    def test_search_returns_empty_for_empty_query(self) -> None:
        _, recall = self._setup()
        self.assertEqual(recall.search(""), [])
        self.assertEqual(recall.search("   "), [])

    def test_hit_includes_provenance(self) -> None:
        _, recall = self._setup()
        hits = recall.search("issue", sources=["linear"])
        self.assertEqual(len(hits), 1)
        h = hits[0]
        self.assertEqual(h.source, "linear")
        self.assertEqual(h.object_type, "issue")
        self.assertEqual(h.source_id, "ACM-101")
        self.assertEqual(h.source_url, "https://linear.app/acme/issue/ACM-101")
        self.assertEqual(h.content_hash, "a" * 64)
        self.assertEqual(h.workspace_id, "team-001")
        self.assertIn("path", h.to_dict())


class CrossSourceLinkTests(TestCase):
    def test_meeting_quote_with_linear_url_produces_link(self) -> None:
        fs = MemFs()
        proj = Projector(root=Path("/mem"), fs=fs)
        # Linear issue.
        proj.project(
            CanonicalRecord(
                source="linear",
                workspace_id="team-001",
                object_type="issue",
                source_id="ACM-101",
                source_url="https://linear.app/acme/issue/ACM-101",
                created_at="2026-07-21T08:30:00.000Z",
                updated_at="2026-07-21T09:15:00.000Z",
                deleted_at=None,
                content_hash="a" * 64,
                parent_ids=(),
                participants=("u-1",),
                owners=("u-0",),
                visibility="team",
                sensitivity="sensitive",
                captured_at="2026-07-21T09:15:01.000Z",
                schema_version="connmem/canonical-envelope/v1",
            )
        )
        # Circleback meeting whose claim `quote` references the Linear URL.
        proj.project(
            CanonicalRecord(
                source="circleback",
                workspace_id="default",
                object_type="meeting",
                source_id="m-7",
                source_url="https://app.circleback.com/meetings/m-7",
                created_at="2026-07-20T10:00:00.000Z",
                updated_at="2026-07-20T11:00:00.000Z",
                deleted_at=None,
                content_hash="b" * 64,
                parent_ids=("ACM-101",),  # meeting recorded as child_of issue (rare)
                participants=("u-0",),
                owners=("u-0",),
                visibility="internal",
                sensitivity="safe",
                captured_at="2026-07-20T11:00:01.000Z",
                schema_version="connmem/canonical-envelope/v1",
            )
        )
        # Manually inject a claim whose quote contains the Linear URL.
        from services.connmem.projections import claims_path

        claim_path = claims_path(root=Path("/mem"), source="circleback")
        fs.append_text(
            path=claim_path,
            content=(
                '{"claim_id":"c1","source":"circleback","source_id":"m-7",'
                '"source_url":"https://app.circleback.com/meetings/m-7",'
                '"predicate":"references","subject":"m-7","object":"ACM-101",'
                '"quote":"follow-up: see https://linear.app/acme/issue/ACM-101",'
                '"extraction_version":"connmem/claim-extraction/v1",'
                '"observed_at":"2026-07-20T11:00:01.000Z","content_hash":"b"}\n'
            ),
        )
        recall = Recall(root=Path("/mem"), fs=fs, projector=proj)
        links = recall.reviewable_links()
        self.assertGreater(len(links), 0)
        link = next(
            (l for l in links if l.from_source == "circleback" and l.to_source == "linear"),
            None,
        )
        assert link is not None
        self.assertEqual(link.from_source_id, "m-7")
        self.assertEqual(link.to_source_id, "ACM-101")
        self.assertEqual(link.evidence_url, "https://linear.app/acme/issue/ACM-101")
        self.assertEqual(link.predicate, "references")
        self.assertGreaterEqual(link.confidence, 0.5)

    def test_no_link_when_no_url_overlap(self) -> None:
        fs = MemFs()
        proj = Projector(root=Path("/mem"), fs=fs)
        proj.project(
            CanonicalRecord(
                source="circleback",
                workspace_id="default",
                object_type="meeting",
                source_id="m-9",
                source_url="https://app.circleback.com/meetings/m-9",
                created_at="2026-07-20T10:00:00.000Z",
                updated_at="2026-07-20T11:00:00.000Z",
                deleted_at=None,
                content_hash="9" * 64,
                parent_ids=(),
                participants=("u-0",),
                owners=("u-0",),
                visibility="internal",
                sensitivity="safe",
                captured_at="2026-07-20T11:00:01.000Z",
                schema_version="connmem/canonical-envelope/v1",
            )
        )
        recall = Recall(root=Path("/mem"), fs=fs, projector=proj)
        self.assertEqual(recall.reviewable_links(), [])

    def test_min_confidence_filter_applies(self) -> None:
        fs = MemFs()
        proj = Projector(root=Path("/mem"), fs=fs)
        proj.project(
            CanonicalRecord(
                source="linear",
                workspace_id="team-001",
                object_type="issue",
                source_id="ACM-1",
                source_url="https://linear.app/acme/issue/ACM-1",
                created_at="2026-07-21T08:30:00.000Z",
                updated_at="2026-07-21T09:15:00.000Z",
                deleted_at=None,
                content_hash="a" * 64,
                parent_ids=(),
                participants=(),
                owners=("u-0",),
                visibility="team",
                sensitivity="sensitive",
                captured_at="2026-07-21T09:15:01.000Z",
                schema_version="connmem/canonical-envelope/v1",
            )
        )
        from services.connmem.projections import claims_path

        claim_path = claims_path(root=Path("/mem"), source="linear")
        fs.append_text(
            path=claim_path,
            content=(
                '{"claim_id":"c1","source":"linear","source_id":"ACM-1",'
                '"source_url":"https://linear.app/acme/issue/ACM-1",'
                '"predicate":"references","subject":"ACM-1","object":"ACM-1",'
                '"quote":"see https://linear.app/acme/issue/ACM-1",'
                '"extraction_version":"v1","observed_at":"2026-07-21T09:15:01.000Z",'
                '"content_hash":"a"}\n'
            ),
        )
        recall = Recall(root=Path("/mem"), fs=fs, projector=proj)
        # Same-source link (linear -> linear) is excluded.
        self.assertEqual(recall.reviewable_links(min_confidence=0.5), [])


if __name__ == "__main__":
    main()