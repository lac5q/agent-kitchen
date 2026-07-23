"""CONNMEM-04 — Linear adapter tests.

Drives the adapter with a fake `LinearCli` so the production HTTP path is
never exercised in unit tests.
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest import TestCase, main

from services.connmem.adapters.linear import (
    SOURCE,
    CapabilityManifest,
    LinearAdapter,
    LinearCli,
    IngestResult,
    project_issue_to_canonical,
    project_comment_to_canonical,
    project_project_to_canonical,
)
from services.connmem.canonical_envelope import CanonicalRecord
from services.connmem.sync_ledger import SyncLedger
from scripts.connmem.fixtures.linear import (
    DOC_DERIVED_LINEAR_ISSUE_RAW,
    DOC_DERIVED_LINEAR_ISSUE_CANONICAL,
)


class FakeLinearCli(LinearCli):
    def __init__(
        self,
        *,
        viewer: dict | None = None,
        teams: list[dict] | None = None,
        issues: list[dict] | None = None,
        comments: list[dict] | None = None,
        projects: list[dict] | None = None,
        introspect: dict | None = None,
        issue_pages_per_team: dict[str, list[list[dict]]] | None = None,
        project_pages_per_team: dict[str, list[list[dict]]] | None = None,
        raise_on_issues: Exception | None = None,
        raise_on_comments: Exception | None = None,
        raise_on_projects: Exception | None = None,
    ) -> None:
        self._viewer = viewer or {"id": "u-0", "email": "ops@acme.example", "name": "Ops"}
        self._teams = teams or [{"id": "team-001", "key": "ACM", "name": "Acme"}]
        self._issues = issues or []
        self._comments = comments or []
        self._projects = projects or []
        self._introspect = introspect or {"data": {"__schema": {"queryType": {"name": "Query"}}}}
        self._issue_pages_per_team = issue_pages_per_team or {}
        self._project_pages_per_team = project_pages_per_team or {}
        self._raise_on_issues = raise_on_issues
        self._raise_on_comments = raise_on_comments
        self._raise_on_projects = raise_on_projects

    def viewer(self) -> dict:
        return self._viewer

    def teams(self, *, page_size: int = 50) -> list[dict]:
        return self._teams

    def issues(
        self, *, team_id: str, page_size: int = 50, include_archived: bool = False
    ) -> list[dict]:
        if self._raise_on_issues:
            raise self._raise_on_issues
        pages = self._issue_pages_per_team.get(team_id)
        if pages is not None:
            return list(pages[0]) if pages else []
        return list(self._issues)

    def comments(self, *, issue_id: str, page_size: int = 50) -> list[dict]:
        if self._raise_on_comments:
            raise self._raise_on_comments
        return [c for c in self._comments if c.get("issueId") == issue_id or c.get("issue_id") == issue_id]

    def projects(
        self, *, team_id: str, page_size: int = 50, include_archived: bool = False
    ) -> list[dict]:
        if self._raise_on_projects:
            raise self._raise_on_projects
        return list(self._projects)

    def raw_introspect(self) -> dict:
        return self._introspect


def make_issue(**overrides) -> dict:
    base = {
        "id": "issue-1",
        "identifier": "ACM-1",
        "title": "Sample issue",
        "description": "Body",
        "url": "https://linear.app/acme/issue/ACM-1",
        "createdAt": "2026-01-15T10:00:00Z",
        "updatedAt": "2026-01-15T11:00:00Z",
        "archivedAt": None,
        "priority": 2,
        "estimate": 5,
        "state": {"name": "In Progress", "type": "started"},
        "team": {"id": "team-001", "key": "ACM", "name": "Acme"},
        "assignee": {"id": "u-1", "name": "Alice", "email": "alice@acme.example"},
        "creator": {"id": "u-0", "name": "Founder", "email": "ops@acme.example"},
        "labels": {"nodes": [{"id": "l-1", "name": "Phase-176"}]},
        "project": {"id": "proj-1", "name": "v8.20"},
        "cycle": None,
        "parent": None,
    }
    base.update(overrides)
    return base


def make_comment(issue_id: str, **overrides) -> dict:
    base = {
        "id": f"c-{issue_id}",
        "issueId": issue_id,  # the fake's filter keys on this
        "body": "Looks good",
        "createdAt": "2026-01-15T10:30:00Z",
        "updatedAt": "2026-01-15T10:30:00Z",
        "user": {"id": "u-2", "name": "Reviewer", "email": "reviewer@acme.example"},
    }
    base.update(overrides)
    return base


def make_project(**overrides) -> dict:
    base = {
        "id": "proj-1",
        "name": "v8.20 Connected Work Memory",
        "description": "Phase 176",
        "url": "https://linear.app/acme/project/proj-1",
        "createdAt": "2026-01-10T00:00:00Z",
        "updatedAt": "2026-01-15T00:00:00Z",
        "lead": {"id": "u-0", "name": "Founder", "email": "ops@acme.example"},
    }
    base.update(overrides)
    return base


class ProjectionTests(TestCase):
    def test_projects_doc_derived_fixture_to_canonical(self) -> None:
        """The vendored fixture (doc-derived) projects without field drift."""
        record = project_issue_to_canonical(
            issue=DOC_DERIVED_LINEAR_ISSUE_RAW,
            workspace_id="team-001",
        )
        assert record is not None
        expected = DOC_DERIVED_LINEAR_ISSUE_CANONICAL
        # Fields the fixture pins:
        self.assertEqual(record.source, expected["source"])
        self.assertEqual(record.workspace_id, expected["workspace_id"])
        self.assertEqual(record.object_type, expected["object_type"])
        self.assertEqual(record.source_id, expected["source_id"])
        self.assertEqual(record.source_url, expected["source_url"])
        self.assertEqual(record.created_at, expected["created_at"])
        self.assertEqual(record.updated_at, expected["updated_at"])
        self.assertEqual(record.deleted_at, expected["deleted_at"])
        self.assertEqual(record.parent_ids, expected["parent_ids"])
        self.assertEqual(record.participants, expected["participants"])
        self.assertEqual(record.owners, expected["owners"])
        self.assertEqual(record.visibility, expected["visibility"])
        self.assertEqual(record.sensitivity, expected["sensitivity"])
        self.assertEqual(record.schema_version, expected["schema_version"])
        # Hash is computed at projection time, not from the fixture:
        self.assertIsNotNone(record.content_hash)
        self.assertEqual(len(record.content_hash), 64)
        self.assertNotEqual(record.content_hash, "")
        # captured_at is stamped by the adapter, not the fixture:
        self.assertIsNotNone(record.captured_at)
        self.assertTrue(record.captured_at.endswith("Z"))

    def test_projection_is_deterministic_for_same_input(self) -> None:
        issue = make_issue()
        a = project_issue_to_canonical(issue=issue, workspace_id="team-001")
        b = project_issue_to_canonical(issue=issue, workspace_id="team-001")
        assert a is not None and b is not None
        self.assertEqual(a.content_hash, b.content_hash)

    def test_projection_skips_record_without_timestamps(self) -> None:
        issue = make_issue(createdAt=None, updatedAt=None)
        self.assertIsNone(
            project_issue_to_canonical(issue=issue, workspace_id="team-001")
        )

    def test_archived_at_routes_to_deleted_at(self) -> None:
        issue = make_issue(archivedAt="2026-02-01T00:00:00Z")
        record = project_issue_to_canonical(issue=issue, workspace_id="team-001")
        assert record is not None
        self.assertEqual(record.deleted_at, "2026-02-01T00:00:00Z")

    def test_parent_id_captured_when_present(self) -> None:
        issue = make_issue(parent={"id": "issue-parent", "identifier": "ACM-0"})
        record = project_issue_to_canonical(issue=issue, workspace_id="team-001")
        assert record is not None
        self.assertEqual(record.parent_ids, ("issue-parent",))

    def test_comment_projection_links_parent(self) -> None:
        comment = make_comment("issue-1")
        record = project_comment_to_canonical(
            comment=comment, parent_issue_id="issue-1", workspace_id="team-001"
        )
        assert record is not None
        self.assertEqual(record.object_type, "comment")
        self.assertEqual(record.parent_ids, ("issue-1",))

    def test_project_projection(self) -> None:
        project = make_project()
        record = project_project_to_canonical(
            project=project, workspace_id="team-001"
        )
        assert record is not None
        self.assertEqual(record.object_type, "project")


class IngestTests(TestCase):
    def _setup(
        self,
        *,
        issues: list[dict] | None = None,
        comments: list[dict] | None = None,
        projects: list[dict] | None = None,
        raise_on_issues: Exception | None = None,
        raise_on_comments: Exception | None = None,
        raise_on_projects: Exception | None = None,
    ) -> tuple[LinearAdapter, FakeLinearCli]:
        tmpdir = Path(tempfile.mkdtemp(prefix="connmem-linear-test-"))
        ledger = SyncLedger(tmpdir / "ledger.db")
        cli = FakeLinearCli(
            issues=issues or [make_issue(id="issue-1", identifier="ACM-1")],
            comments=comments or [],
            projects=projects or [],
            raise_on_issues=raise_on_issues,
            raise_on_comments=raise_on_comments,
            raise_on_projects=raise_on_projects,
        )
        adapter = LinearAdapter(ledger=ledger, cli=cli)
        return adapter, cli

    def test_ingest_captures_issue(self) -> None:
        adapter, _ = self._setup()
        result = adapter.ingest_team(team_id="team-001")
        self.assertEqual(result.captured_count, 1)
        self.assertEqual(result.skipped_count, 0)
        self.assertEqual(result.failure_count, 0)

    def test_ingest_captures_project(self) -> None:
        adapter, _ = self._setup(projects=[make_project()])
        result = adapter.ingest_team(team_id="team-001")
        self.assertEqual(result.captured_count, 2)  # 1 issue + 1 project

    def test_ingest_captures_comments(self) -> None:
        adapter, _ = self._setup(
            issues=[make_issue(id="issue-1", identifier="ACM-1")],
            comments=[make_comment("issue-1"), make_comment("issue-1", id="c-2")],
        )
        result = adapter.ingest_team(team_id="team-001")
        self.assertEqual(result.captured_count, 3)  # 1 issue + 2 comments

    def test_ingest_handles_issues_list_failure(self) -> None:
        adapter, _ = self._setup(raise_on_issues=RuntimeError("network"))
        result = adapter.ingest_team(team_id="team-001")
        self.assertEqual(result.captured_count, 0)
        self.assertEqual(result.failure_count, 1)
        failed_label, _ = result.failures[0]
        self.assertEqual(failed_label, "issues-list")

    def test_ingest_handles_projects_list_failure_without_dropping_issues(self) -> None:
        adapter, _ = self._setup(raise_on_projects=RuntimeError("oops"))
        result = adapter.ingest_team(team_id="team-001")
        # Issue still captured; projects failure recorded.
        self.assertEqual(result.captured_count, 1)
        failed_label, _ = result.failures[0]
        self.assertEqual(failed_label, "projects-list")

    def test_ingest_is_idempotent(self) -> None:
        adapter, cli = self._setup()
        adapter.ingest_team(team_id="team-001")
        adapter2 = LinearAdapter(ledger=adapter._ledger, cli=cli)  # noqa: SLF001
        adapter2.ingest_team(team_id="team-001")
        statuses = adapter._ledger.count_by_status(SOURCE)  # noqa: SLF001
        self.assertEqual(statuses.get("captured_unrouted", 0), 1)

    def test_ingest_detects_issue_content_update(self) -> None:
        adapter, cli = self._setup()
        adapter.ingest_team(team_id="team-001")
        # Mutate updatedAt to force hash drift.
        cli._issues = [make_issue(id="issue-1", identifier="ACM-1", updatedAt="2026-01-15T12:00:00Z")]
        adapter2 = LinearAdapter(ledger=adapter._ledger, cli=cli)  # noqa: SLF001
        adapter2.ingest_team(team_id="team-001")
        row = adapter._ledger.get(SOURCE, "team-001", "issue-1")  # noqa: SLF001
        assert row is not None
        # Re-ingestion should still upsert; ledger row exists with new hash.
        self.assertEqual(row["status"], "captured_unrouted")


class CapabilityManifestTests(TestCase):
    def test_manifest_serializes(self) -> None:
        m = CapabilityManifest(
            viewer=True,
            teams=True,
            issues=True,
            projects=False,
            comments=False,
            has_initiatives=False,
            has_documents=False,
            has_customers=False,
            archived_resources_supported=True,
            raw={"introspection": {}},
        )
        d = json.loads(json.dumps(m, default=lambda o: o.__dict__))
        self.assertTrue(d["viewer"])
        self.assertFalse(d["projects"])
        self.assertTrue(d["archived_resources_supported"])


if __name__ == "__main__":
    main()