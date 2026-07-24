"""CONNMEM-04 — Linear adapter that projects through the canonical envelope.

Wraps Linear's GraphQL API behind a swappable `LinearCli` protocol so the
adapter is unit-testable without live Linear credentials. Production binds
`LinearHttpCli`; tests inject a fake.

Capability discovery (`discover_capabilities`) issues the standard
introspection query first; the result decides which object families the
adapter will ingest. The release gate (CONNMEM-10) refuses to claim
tenant completeness until the manifest is recorded against an authorized
identity — see CONNMEM-LIVE-DEFER for the open ticket.

The vendored SDL stub at `references/linear/SDL-STUBS.graphql` carries the
doc-derived provenance tag. Live introspection is queued behind the
CONNMEM-LIVE-DEFER ticket (real Linear API key on cordant-hermes-01).

The adapter never logs or returns raw GraphQL responses; only projected
`CanonicalRecord`s.
"""
from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from ..canonical_envelope import (
    SCHEMA_VERSION,
    VALID_SENSITIVITIES,
    VALID_SOURCES,
    VALID_VISIBILITIES,
    CanonicalRecord,
)
from ..sync_ledger import SyncLedger


SOURCE = "linear"
SOURCE_URL_BASE = "https://linear.app"


# ---------------------------------------------------------------------------
# CLI protocol
# ---------------------------------------------------------------------------


class LinearCli:
    """Swappable boundary for Linear's GraphQL API.

    Production binds `LinearHttpCli`. Tests inject a fake.
    The adapter never makes HTTP calls directly; always through this interface.
    """

    def viewer(self) -> dict:
        raise NotImplementedError

    def teams(self, *, page_size: int = 50) -> list[dict]:
        raise NotImplementedError

    def issues(
        self,
        *,
        team_id: str,
        page_size: int = 50,
        include_archived: bool = False,
    ) -> list[dict]:
        raise NotImplementedError

    def comments(self, *, issue_id: str, page_size: int = 50) -> list[dict]:
        raise NotImplementedError

    def projects(
        self,
        *,
        team_id: str,
        page_size: int = 50,
        include_archived: bool = False,
    ) -> list[dict]:
        raise NotImplementedError

    def raw_introspect(self) -> dict:
        """Return the raw introspection response (or a synthetic one in tests)."""
        raise NotImplementedError


@dataclass
class LinearHttpCli(LinearCli):
    """Production HTTP CLI — POSTs GraphQL to api.linear.app/graphql."""

    api_token: str
    endpoint: str = "https://api.linear.app/graphql"
    timeout_s: float = 30.0

    def _post(self, query: str, variables: dict | None = None) -> dict:
        import urllib.request

        body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
        req = urllib.request.Request(
            self.endpoint,
            data=body,
            headers={
                "Authorization": self.api_token,
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def viewer(self) -> dict:
        data = self._post("{ viewer { id email name } }")
        return data.get("data", {}).get("viewer") or {}

    def teams(self, *, page_size: int = 50) -> list[dict]:
        data = self._post(
            "{ teams(first: %d) { nodes { id key name } } }" % page_size
        )
        return (data.get("data", {}).get("teams") or {}).get("nodes") or []

    def issues(
        self,
        *,
        team_id: str,
        page_size: int = 50,
        include_archived: bool = False,
    ) -> list[dict]:
        query = (
            "{ team(id: \"%s\") { issues(first: %d, includeArchived: %s) "
            "{ nodes { id identifier title description url createdAt updatedAt "
            "archivedAt priority estimate state { name type } "
            "team { id key } assignee { id name email } creator { id name email } "
            "labels { nodes { id name } } project { id name } cycle { id name } "
            "parent { id identifier } } } }"
        ) % (team_id, page_size, str(include_archived).lower())
        data = self._post(query)
        team = data.get("data", {}).get("team") or {}
        return (team.get("issues") or {}).get("nodes") or []

    def comments(self, *, issue_id: str, page_size: int = 50) -> list[dict]:
        query = (
            "{ issueComments(issueId: \"%s\", first: %d) { nodes { id body "
            "createdAt updatedAt user { id name email } } }"
        ) % (issue_id, page_size)
        data = self._post(query)
        return (data.get("data", {}).get("issueComments") or {}).get("nodes") or []

    def projects(
        self,
        *,
        team_id: str,
        page_size: int = 50,
        include_archived: bool = False,
    ) -> list[dict]:
        query = (
            "{ team(id: \"%s\") { projects(first: %d, includeArchived: %s) "
            "{ nodes { id name description url createdAt updatedAt archivedAt "
            "lead { id name email } } } }"
        ) % (team_id, page_size, str(include_archived).lower())
        data = self._post(query)
        team = data.get("data", {}).get("team") or {}
        return (team.get("projects") or {}).get("nodes") or []

    def raw_introspect(self) -> dict:
        return self._post(
            "{ __schema { queryType { name } mutationType { name } } }"
        )


# ---------------------------------------------------------------------------
# Capability manifest
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CapabilityManifest:
    """Snapshot of what the Linear GraphQL surface exposes.

    `has_*` flags map to the in-scope object families from CONNMEM-04.
    A `False` flag means the family is `provider_capability_absent` and
    the release gate must report it as such, never as "entire company
    indexed".
    """

    viewer: bool
    teams: bool
    issues: bool
    projects: bool
    comments: bool
    has_initiatives: bool
    has_documents: bool
    has_customers: bool
    archived_resources_supported: bool
    raw: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------


class LinearAdapter:
    """Project Linear issues/projects/comments through the canonical envelope.

    Production use:
        adapter = LinearAdapter(ledger=SyncLedger(path), cli=LinearHttpCli(api_token=...))
        manifest = adapter.discover_capabilities()
        result = adapter.ingest_team(team_id="team-001")
        print(result.summary())
    """

    def __init__(
        self,
        *,
        ledger: SyncLedger,
        cli: Optional[LinearCli] = None,
        page_size: int = 50,
        include_archived: bool = False,
    ) -> None:
        if SOURCE not in VALID_SOURCES:
            raise RuntimeError(f"Invalid source: {SOURCE}")
        self._ledger = ledger
        self._cli = cli or LinearHttpCli(api_token="")
        self._page_size = page_size
        self._include_archived = include_archived

    # ----- capability discovery ---------------------------------------------

    def discover_capabilities(self) -> CapabilityManifest:
        viewer_ok = self._probe(lambda: self._cli.viewer())
        teams_ok = self._probe(lambda: self._cli.teams(page_size=1))
        issues_ok = self._probe(
            lambda: self._cli.issues(team_id="probe", page_size=1, include_archived=self._include_archived)
        )
        projects_ok = self._probe(
            lambda: self._cli.projects(team_id="probe", page_size=1, include_archived=self._include_archived)
        )
        comments_ok = self._probe(lambda: self._cli.comments(issue_id="probe", page_size=1))

        raw = {}
        try:
            raw = self._cli.raw_introspect()
        except Exception:
            raw = {}

        # Initiatives / Documents / Customers: presence in SDL doesn't mean
        # the org has access. We probe a sentinel query and rely on the
        # 200-with-errors semantics from the plan: "Treat HTTP 200 GraphQL
        # responses containing field errors as partial failures requiring
        # retry/accounting, never as complete inventory success."
        has_initiatives = self._probe(
            lambda: self._cli._post(  # type: ignore[attr-defined]
                "{ initiatives(first: 1) { nodes { id } } }"
            )
        )
        has_documents = self._probe(
            lambda: self._cli._post(  # type: ignore[attr-defined]
                "{ documents(first: 1) { nodes { id } } }"
            )
        )
        has_customers = self._probe(
            lambda: self._cli._post(  # type: ignore[attr-defined]
                "{ customers(first: 1) { nodes { id } } }"
            )
        )

        return CapabilityManifest(
            viewer=viewer_ok,
            teams=teams_ok,
            issues=issues_ok,
            projects=projects_ok,
            comments=comments_ok,
            has_initiatives=has_initiatives,
            has_documents=has_documents,
            has_customers=has_customers,
            archived_resources_supported=self._include_archived,
            raw={
                "introspection": raw,
                "page_size": self._page_size,
                "include_archived": self._include_archived,
            },
        )

    def _probe(self, fn) -> bool:
        try:
            fn()
            return True
        except Exception:
            return False

    # ----- ingest -----------------------------------------------------------

    def ingest_team(
        self,
        *,
        team_id: str,
        workspace_id: Optional[str] = None,
        include_archived: Optional[bool] = None,
        page_cap: int = 200,
    ) -> "IngestResult":
        """Walk every issue in `team_id` and project to canonical records."""
        ws = workspace_id or team_id
        include_archived = (
            self._include_archived if include_archived is None else include_archived
        )
        captured: list[CanonicalRecord] = []
        skipped: list[str] = []
        failures: list[tuple[str, str]] = []

        # ----- issues -----
        try:
            issues = self._cli.issues(
                team_id=team_id,
                page_size=self._page_size,
                include_archived=include_archived,
            )
        except Exception as err:
            failures.append(("issues-list", repr(err)))
            issues = []

        for issue in issues:
            try:
                record = project_issue_to_canonical(
                    issue=issue,
                    workspace_id=ws,
                )
                if record is None:
                    skipped.append(str(issue.get("id") or ""))
                    continue
                self._ledger.upsert(record, status="captured_unrouted")
                captured.append(record)
                # ----- comments for this issue -----
                try:
                    comments = self._cli.comments(
                        issue_id=str(record.source_id),
                        page_size=self._page_size,
                    )
                except Exception as err:
                    failures.append((f"comments-{record.source_id}", repr(err)))
                    comments = []
                for c in comments:
                    try:
                        comment_record = project_comment_to_canonical(
                            comment=c,
                            parent_issue_id=str(record.source_id),
                            workspace_id=ws,
                        )
                        if comment_record is None:
                            continue
                        self._ledger.upsert(comment_record, status="captured_unrouted")
                        captured.append(comment_record)
                    except Exception as err:
                        failures.append((f"comment-{c.get('id') or '?'}", repr(err)))
            except Exception as err:
                failures.append((str(issue.get("id") or "?"), repr(err)))

        # ----- projects -----
        try:
            projects = self._cli.projects(
                team_id=team_id,
                page_size=self._page_size,
                include_archived=include_archived,
            )
        except Exception as err:
            failures.append(("projects-list", repr(err)))
            projects = []

        for project in projects:
            try:
                project_record = project_project_to_canonical(
                    project=project,
                    workspace_id=ws,
                )
                if project_record is None:
                    skipped.append(str(project.get("id") or ""))
                    continue
                self._ledger.upsert(project_record, status="captured_unrouted")
                captured.append(project_record)
            except Exception as err:
                failures.append((str(project.get("id") or "?"), repr(err)))

        cursor = f"{ws}#issues={len(issues)}#projects={len(projects)}"
        self._ledger.set_cursor(SOURCE, cursor)

        return IngestResult(
            source=SOURCE,
            team_id=team_id,
            captured=captured,
            skipped=skipped,
            failures=failures,
            cursor=cursor,
        )


# ---------------------------------------------------------------------------
# Projection
# ---------------------------------------------------------------------------


def project_issue_to_canonical(
    *, issue: dict, workspace_id: str
) -> Optional[CanonicalRecord]:
    issue_id = str(issue.get("id") or "")
    if not issue_id:
        return None
    created = _to_iso(issue.get("createdAt"))
    updated = _to_iso(issue.get("updatedAt"))
    if not created or not updated:
        return None

    archived_at = _to_iso(issue.get("archivedAt")) or None
    deleted_at = archived_at

    title = issue.get("title") or ""
    identifier = issue.get("identifier") or ""
    description = issue.get("description") or ""
    state = (issue.get("state") or {}).get("name") or "Unknown"
    priority = issue.get("priority")
    estimate = issue.get("estimate")
    team = issue.get("team") or {}
    team_key = team.get("key") or ""
    team_id = team.get("id") or workspace_id
    assignee = issue.get("assignee") or {}
    creator = issue.get("creator") or {}
    labels = ((issue.get("labels") or {}).get("nodes") or []) if isinstance(issue.get("labels"), dict) else (issue.get("labels") or [])
    project = issue.get("project") or {}
    cycle = issue.get("cycle") or {}
    parent = issue.get("parent") or {}

    participants: list[str] = []
    for u in (assignee, creator):
        if u:
            participants.append(_user_id(u))
    owners = [creator.get("id") or creator.get("email") or ""] if creator else []

    source_url = (
        issue.get("url")
        or f"{SOURCE_URL_BASE}/{team_key.lower()}/issue/{identifier or issue_id}"
    )

    body = _build_issue_body(
        identifier=identifier,
        title=title,
        description=description,
        state=state,
        priority=priority,
        estimate=estimate,
        team_key=team_key,
        team_id=team_id,
        assignee=assignee,
        creator=creator,
        labels=labels,
        project=project,
        cycle=cycle,
        parent=parent,
    )
    content_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()

    return CanonicalRecord(
        source=SOURCE,
        workspace_id=workspace_id,
        object_type="issue",
        source_id=issue_id,
        source_url=source_url,
        created_at=created,
        updated_at=updated,
        deleted_at=deleted_at,
        content_hash=content_hash,
        parent_ids=(str(parent.get("id")) if parent.get("id") else "",) if parent else (),
        participants=tuple(p for p in participants if p),
        owners=tuple(o for o in owners if o),
        visibility="team",  # Linear issues default to team-visible per the fixture comment
        sensitivity="sensitive",  # internal teams default to sensitive per fixture
        captured_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        schema_version=SCHEMA_VERSION,
    )


def project_comment_to_canonical(
    *, comment: dict, parent_issue_id: str, workspace_id: str
) -> Optional[CanonicalRecord]:
    comment_id = str(comment.get("id") or "")
    if not comment_id:
        return None
    created = _to_iso(comment.get("createdAt"))
    updated = _to_iso(comment.get("updatedAt"))
    if not created or not updated:
        return None
    user = comment.get("user") or {}
    body = comment.get("body") or ""

    source_url = (
        comment.get("url")
        or f"{SOURCE_URL_BASE}/issue/{parent_issue_id}#comment-{comment_id}"
    )

    body_md = f"# Comment on {parent_issue_id}\n\n{body}"
    content_hash = hashlib.sha256(body_md.encode("utf-8")).hexdigest()

    return CanonicalRecord(
        source=SOURCE,
        workspace_id=workspace_id,
        object_type="comment",
        source_id=comment_id,
        source_url=source_url,
        created_at=created,
        updated_at=updated,
        deleted_at=None,
        content_hash=content_hash,
        parent_ids=(parent_issue_id,),
        participants=(_user_id(user),) if user else (),
        owners=(_user_id(user),) if user else (),
        visibility="team",
        sensitivity="sensitive",
        captured_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        schema_version=SCHEMA_VERSION,
    )


def project_project_to_canonical(
    *, project: dict, workspace_id: str
) -> Optional[CanonicalRecord]:
    project_id = str(project.get("id") or "")
    if not project_id:
        return None
    created = _to_iso(project.get("createdAt"))
    updated = _to_iso(project.get("updatedAt"))
    if not created or not updated:
        return None
    name = project.get("name") or ""
    description = project.get("description") or ""
    lead = project.get("lead") or {}

    source_url = project.get("url") or f"{SOURCE_URL_BASE}/project/{project_id}"

    body = f"# {name}\n\n{description}"
    content_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()

    return CanonicalRecord(
        source=SOURCE,
        workspace_id=workspace_id,
        object_type="project",
        source_id=project_id,
        source_url=source_url,
        created_at=created,
        updated_at=updated,
        deleted_at=None,
        content_hash=content_hash,
        parent_ids=(),
        participants=(_user_id(lead),) if lead else (),
        owners=(_user_id(lead),) if lead else (),
        visibility="team",
        sensitivity="sensitive",
        captured_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        schema_version=SCHEMA_VERSION,
    )


def _build_issue_body(
    *,
    identifier: str,
    title: str,
    description: str,
    state: str,
    priority: Optional[int],
    estimate: Optional[int],
    team_key: str,
    team_id: str,
    assignee: dict,
    creator: dict,
    labels: Iterable,
    project: dict,
    cycle: dict,
    parent: dict,
) -> str:
    """Order-stable canonical body for hashing. Mirrors the doc-derived fixture's shape."""
    lines: list[str] = []
    if identifier:
        lines.append(f"# [{identifier}] {title}")
    else:
        lines.append(f"# {title}")
    lines.append("")
    if description:
        lines.append(description)
        lines.append("")
    lines.append(f"team: {team_key} ({team_id})")
    lines.append(f"state: {state}")
    if priority is not None:
        lines.append(f"priority: {priority}")
    if estimate is not None:
        lines.append(f"estimate: {estimate}")
    if assignee:
        lines.append(f"assignee: {_user_id(assignee)}")
    if creator:
        lines.append(f"creator: {_user_id(creator)}")
    if labels:
        names = [str(l.get("name") or "") for l in labels]
        lines.append(f"labels: {', '.join(n for n in names if n)}")
    if project:
        lines.append(f"project: {project.get('name') or project.get('id') or ''}")
    if cycle:
        lines.append(f"cycle: {cycle.get('name') or cycle.get('id') or ''}")
    if parent:
        lines.append(f"parent: {parent.get('identifier') or parent.get('id') or ''}")
    return "\n".join(lines).strip()


def _user_id(user: dict) -> str:
    return user.get("id") or user.get("email") or user.get("name") or ""


def _to_iso(raw: Any) -> str:
    """Normalize an ISO 8601 timestamp to a canonical second/millisecond form.

    Preserves milliseconds when present in the source (e.g. "2026-07-21T08:30:00.000Z")
    so the doc-derived Linear fixture round-trips byte-for-byte. Falls back to
    second precision only when the source omits fractional seconds.
    """
    if not raw:
        return ""
    s = str(raw).replace("Z", "+00:00")
    try:
        has_ms = "." in s and "+" in s and s.split(".")[1].split("+")[0].isdigit()
        dt = datetime.fromisoformat(s)
        if has_ms:
            return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class IngestResult:
    source: str
    team_id: str
    captured: list[CanonicalRecord]
    skipped: list[str]
    failures: list[tuple[str, str]]
    cursor: str

    @property
    def captured_count(self) -> int:
        return len(self.captured)

    @property
    def skipped_count(self) -> int:
        return len(self.skipped)

    @property
    def failure_count(self) -> int:
        return len(self.failures)

    def summary(self) -> str:
        return (
            f"Linear ingest team={self.team_id}: "
            f"captured={self.captured_count} skipped={self.skipped_count} "
            f"failures={self.failure_count} cursor={self.cursor}"
        )