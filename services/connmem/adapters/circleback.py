"""CONNMEM-03 — Circleback adapter that projects through the canonical envelope.

Wraps the existing `scripts/meet-sync/providers/circleback_ingest.py` CLI calls
behind a swappable `CirclebackCli` protocol so the adapter is fully unit-testable
without the `circleback` binary on the test host. The CLI is the only way we
talk to Circleback in production (per the public template); the adapter is the
one place that knows how to turn Circleback's meeting shape into a
`CanonicalRecord`.

Idempotent: re-ingesting the same `since` window does not duplicate ledger rows
(`SyncLedger.upsert` is a no-op when `(source, workspace_id, source_id,
content_hash)` is unchanged).

Capability discovery is exposed via `discover_capabilities()` which runs three
lightweight CLI calls and records which object families the installed CLI/API
actually exposes. The release gate (CONNMEM-10) requires this manifest before
"entire company indexed" can be claimed — if the installed CLI only sees
per-user meetings, the manifest says so.

CLI protocol:
    circleback meetings search --from YYYY-MM-DD --page N --json
    circleback meetings read <ids...> --json
    circleback transcripts read <ids...> --json

The adapter never logs or returns raw CLI stdout; only projected envelopes.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

from ..canonical_envelope import (
    CANONICAL_FIELDS,
    SCHEMA_VERSION,
    VALID_SENSITIVITIES,
    VALID_SOURCES,
    VALID_VISIBILITIES,
    CanonicalRecord,
)
from ..sync_ledger import LEDGER_STATUSES, SyncLedger


SOURCE = "circleback"
SOURCE_URL_BASE = "https://app.circleback.com/meetings"


# ---------------------------------------------------------------------------
# CLI protocol
# ---------------------------------------------------------------------------


class CirclebackCli:
    """Swappable boundary for the Circleback CLI.

    Production binds `CirclebackSubprocessCli`. Tests inject a fake.
    The adapter never calls the CLI directly; always through this interface.
    """

    def meetings_search(self, *, since: str, page: int) -> list[dict]:
        raise NotImplementedError

    def meetings_read(self, ids: list[str]) -> list[dict]:
        raise NotImplementedError

    def transcripts_read(self, ids: list[str]) -> list[dict]:
        raise NotImplementedError


class CirclebackSubprocessCli(CirclebackCli):
    """Production CLI — invokes the `circleback` binary via subprocess."""

    def __init__(self, binary: str = "circleback", *, timeout_s: float = 60.0) -> None:
        self._binary = binary
        self._timeout_s = timeout_s

    def _run_json(self, args: list[str]) -> Any:
        proc = subprocess.run(
            [self._binary, *args, "--json"],
            capture_output=True,
            text=True,
            check=False,
            timeout=self._timeout_s,
        )
        if proc.returncode != 0:
            raise RuntimeError(
                f"{self._binary} {' '.join(args)} failed: {proc.stderr.strip()[:400]}"
            )
        raw = proc.stdout.strip()
        if not raw:
            return []
        try:
            return json.loads(raw)
        except json.JSONDecodeError as err:
            raise RuntimeError(
                f"{self._binary} {' '.join(args)} returned non-JSON: {raw[:400]}"
            ) from err

    def meetings_search(self, *, since: str, page: int) -> list[dict]:
        data = self._run_json(["meetings", "search", "--from", since, "--page", str(page)])
        if isinstance(data, dict):
            return data.get("meetings") or data.get("data") or data.get("items") or []
        return data or []

    def meetings_read(self, ids: list[str]) -> list[dict]:
        if not ids:
            return []
        data = self._run_json(["meetings", "read", *ids])
        if isinstance(data, dict):
            return data.get("meetings") or data.get("data") or []
        return data or []

    def transcripts_read(self, ids: list[str]) -> list[dict]:
        if not ids:
            return []
        data = self._run_json(["transcripts", "read", *ids])
        if isinstance(data, dict):
            return data.get("transcripts") or data.get("data") or []
        return data or []


# ---------------------------------------------------------------------------
# Capability manifest
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CapabilityManifest:
    """Snapshot of what the installed Circleback CLI/API actually exposes.

    The release gate (CONNMEM-10) refuses to claim tenant completeness unless
    this manifest records either a tenant-wide inventory endpoint or a list
    of explicitly-authorized per-user identities with stable-ID dedup.
    """

    meetings_listing: bool
    meetings_detail: bool
    transcripts: bool
    has_memories_endpoint: bool  # distinct "memories/insights" surface
    has_organization_endpoint: bool  # tenant-wide inventory
    has_webhook: bool  # verified webhook interface
    has_deletion_feed: bool  # change-feed for deletes
    raw: dict[str, Any]


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------


class CirclebackAdapter:
    """Project Circleback meetings/transcripts through the canonical envelope.

    Production use:
        adapter = CirclebackAdapter(ledger=SyncLedger(path))
        manifest = adapter.discover_capabilities()
        result = adapter.ingest(since="2024-01-01")
        print(result.summary())

    Tests use a `FakeCirclebackCli` to drive the adapter without subprocess.
    """

    def __init__(
        self,
        *,
        ledger: SyncLedger,
        cli: Optional[CirclebackCli] = None,
        workspace_id: str = "default",
        page_size: int = 20,
        page_cap: int = 1000,
    ) -> None:
        if SOURCE not in VALID_SOURCES:
            raise RuntimeError(f"Invalid source: {SOURCE}")
        self._ledger = ledger
        self._cli = cli or CirclebackSubprocessCli()
        self._workspace_id = workspace_id
        self._page_size = page_size
        self._page_cap = page_cap

    # ----- capability discovery ---------------------------------------------

    def discover_capabilities(self) -> CapabilityManifest:
        """Probe the CLI to determine which surfaces the install exposes."""
        # Smoke-test each surface with a tiny request. A surface is "available"
        # if the call returns a parseable response (empty list counts as
        # parseable). Any thrown exception or non-2xx code marks it absent.
        meetings_listing = self._probe(lambda: self._cli.meetings_search(since="2000-01-01", page=1))
        sample_ids: list[str] = []
        try:
            meetings_listing_data = self._cli.meetings_search(since="2000-01-01", page=1)
            sample_ids = [str(m.get("id") or m.get("meetingId") or "") for m in meetings_listing_data][:1]
            sample_ids = [m for m in sample_ids if m]
        except Exception:
            sample_ids = []
        meetings_detail = self._probe(lambda: self._cli.meetings_read(sample_ids))
        transcripts = self._probe(lambda: self._cli.transcripts_read(sample_ids))

        # Memories/organization/webhook/deletion surfaces are exposed as
        # additional endpoints when the install supports them. Probe via
        # common endpoint names; the binary is expected to fail fast on
        # unknown commands.
        has_memories_endpoint = self._probe(lambda: self._cli_raw(["memories", "list"]))
        has_organization_endpoint = self._probe(lambda: self._cli_raw(["organization", "list"]))
        has_webhook = self._probe(lambda: self._cli_raw(["webhooks", "list"]))
        has_deletion_feed = self._probe(lambda: self._cli_raw(["changes", "list"]))

        return CapabilityManifest(
            meetings_listing=meetings_listing,
            meetings_detail=meetings_detail,
            transcripts=transcripts,
            has_memories_endpoint=has_memories_endpoint,
            has_organization_endpoint=has_organization_endpoint,
            has_webhook=has_webhook,
            has_deletion_feed=has_deletion_feed,
            raw={
                "binary": getattr(self._cli, "_binary", "unknown"),
                "page_size": self._page_size,
                "workspace_id": self._workspace_id,
            },
        )

    def _probe(self, fn: Callable[[], Any]) -> bool:
        try:
            fn()
            return True
        except Exception:
            return False

    def _cli_raw(self, args: list[str]) -> Any:
        cli = self._cli
        if isinstance(cli, CirclebackSubprocessCli):
            return cli._run_json(args)  # noqa: SLF001 — same module
        raise RuntimeError("Raw probe requires CirclebackSubprocessCli")

    # ----- ingest -----------------------------------------------------------

    def ingest(self, *, since: str, page_cap: Optional[int] = None) -> "IngestResult":
        """Walk all meetings since `since` and upsert canonical records.

        Idempotent: re-runs with the same `since` are no-ops when content is
        unchanged. Updates propagate through `SyncLedger.upsert` (returns
        False when content_hash matches the stored row).
        """
        cap = page_cap if page_cap is not None else self._page_cap
        captured: list[CanonicalRecord] = []
        skipped: list[str] = []
        failures: list[tuple[str, str]] = []
        seen_ids: set[str] = set()

        page = 1
        while page <= cap:
            try:
                batch = self._cli.meetings_search(since=since, page=page)
            except Exception as err:
                failures.append((f"page-{page}", repr(err)))
                break
            if not batch:
                break
            new_ids: list[str] = []
            for m in batch:
                mid = str(m.get("id") or m.get("meetingId") or "")
                if mid and mid not in seen_ids:
                    seen_ids.add(mid)
                    new_ids.append(mid)
            if not new_ids:
                break

            try:
                details = self._cli.meetings_read(new_ids)
            except Exception as err:
                for mid in new_ids:
                    failures.append((mid, repr(err)))
                page += 1
                continue
            details_by_id = {
                str(d.get("id") or ""): d for d in details if d.get("id") is not None
            }
            try:
                transcripts = self._cli.transcripts_read(new_ids)
            except Exception as err:
                transcripts = []
            transcripts_by_id: dict[str, list] = {}
            for tx in transcripts:
                tid = str(
                    tx.get("meetingId") or tx.get("meeting_id") or tx.get("id") or ""
                )
                entries = tx.get("entries") or tx.get("transcript") or tx.get("segments") or []
                if tid:
                    transcripts_by_id[tid] = entries if isinstance(entries, list) else []

            for mid in new_ids:
                detail = details_by_id.get(mid)
                if not detail:
                    failures.append((mid, "missing_detail"))
                    continue
                record = project_to_canonical(
                    meeting_id=mid,
                    detail=detail,
                    transcript_entries=transcripts_by_id.get(mid, []),
                    workspace_id=self._workspace_id,
                )
                if record is None:
                    skipped.append(mid)
                    continue
                try:
                    self._ledger.upsert(record, status="captured_unrouted")
                    captured.append(record)
                except Exception as err:
                    failures.append((mid, repr(err)))

            if len(batch) < self._page_size:
                break
            page += 1

        cursor = f"{since}#page-{page}"
        self._ledger.set_cursor(SOURCE, cursor)
        return IngestResult(
            source=SOURCE,
            since=since,
            captured=captured,
            skipped=skipped,
            failures=failures,
            cursor=cursor,
        )

    # ----- deterministic shape helpers used by both ingest + tests ---------

    @staticmethod
    def sha256_hex(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    @staticmethod
    def now_iso() -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Projection
# ---------------------------------------------------------------------------


def project_to_canonical(
    *,
    meeting_id: str,
    detail: dict,
    transcript_entries: list,
    workspace_id: str,
) -> Optional[CanonicalRecord]:
    """Project a Circleback meeting + transcript into a `CanonicalRecord`.

    Returns None when the meeting is missing required shape (no id, no
    timestamps) — these get logged as `skipped` by the adapter, never as
    `captured`, so the release gate does not over-count.

    The projection is deterministic: the same `(meeting_id, detail,
    transcript_entries)` tuple always yields the same `content_hash`. That
    is the property `SyncLedger.upsert` relies on for re-ingest idempotency.
    """
    if not meeting_id:
        return None
    title = (
        detail.get("name")
        or detail.get("title")
        or detail.get("subject")
        or "untitled"
    )
    created = (
        detail.get("createdAt")
        or detail.get("created_at")
        or detail.get("date")
        or ""
    )
    updated = (
        detail.get("updatedAt")
        or detail.get("updated_at")
        or created
    )
    if not created or not updated:
        return None

    created_iso = _to_iso(created)
    updated_iso = _to_iso(updated)

    deleted_at = (
        _to_iso(detail.get("deletedAt"))
        or _to_iso(detail.get("deleted_at"))
        or None
    )

    attendees = []
    for a in detail.get("attendees") or []:
        if isinstance(a, dict):
            attendees.append(a.get("name") or a.get("email") or str(a))
        else:
            attendees.append(str(a))

    owners: list[str] = []
    if isinstance(detail.get("owner"), dict):
        owners.append(
            detail["owner"].get("email")
            or detail["owner"].get("name")
            or str(detail["owner"])
        )
    elif detail.get("owner"):
        owners.append(str(detail["owner"]))
    if not owners and attendees:
        owners = [attendees[0]]

    source_url = (
        detail.get("url")
        or detail.get("source_url")
        or f"{SOURCE_URL_BASE}/{meeting_id}"
    )

    body = _build_canonical_body(
        title=title,
        created_iso=created_iso,
        updated_iso=updated_iso,
        attendees=attendees,
        transcript_entries=transcript_entries,
        detail=detail,
    )
    content_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()

    return CanonicalRecord(
        source=SOURCE,
        workspace_id=workspace_id,
        object_type="meeting",
        source_id=meeting_id,
        source_url=source_url,
        created_at=created_iso,
        updated_at=updated_iso,
        deleted_at=deleted_at,
        content_hash=content_hash,
        parent_ids=(),
        participants=tuple(attendees),
        owners=tuple(owners),
        visibility=_visibility(detail),
        sensitivity=_sensitivity(detail),
        captured_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        schema_version=SCHEMA_VERSION,
    )


def _build_canonical_body(
    *,
    title: str,
    created_iso: str,
    updated_iso: str,
    attendees: Iterable[str],
    transcript_entries: list,
    detail: dict,
) -> str:
    """Build the canonical text body for `content_hash`.

    Order-stable so the hash is reproducible. Includes title, dates,
    attendees, notes/summary, action items, and transcript (formatted).
    """
    lines: list[str] = []
    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"created_at: {created_iso}")
    lines.append(f"updated_at: {updated_iso}")
    lines.append("")
    if attendees:
        lines.append(f"attendees: {', '.join(attendees)}")
    notes = detail.get("notes") or detail.get("summary")
    if notes:
        lines.append("")
        lines.append("## Notes")
        lines.append(str(notes))
    actions = detail.get("actionItems") or detail.get("action_items") or detail.get("action_items")
    if actions:
        lines.append("")
        lines.append("## Action Items")
        for a in actions:
            if isinstance(a, dict):
                lines.append(f"- {a.get('text') or a.get('description') or str(a)}")
            else:
                lines.append(f"- {a}")
    if transcript_entries:
        lines.append("")
        lines.append("## Transcript")
        lines.append(_format_transcript(transcript_entries))
    return "\n".join(lines).strip()


def _format_transcript(entries: list) -> str:
    if not entries:
        return ""
    lines: list[str] = []
    last_speaker: Optional[str] = None
    for entry in entries:
        if isinstance(entry, str):
            lines.append(entry)
            continue
        speaker = (
            (entry.get("speaker") or {}).get("name")
            if isinstance(entry.get("speaker"), dict)
            else entry.get("speaker")
        ) or entry.get("name") or "Speaker"
        text = (entry.get("text") or entry.get("content") or "").strip()
        if not text:
            continue
        if speaker != last_speaker:
            if lines:
                lines.append("")
            lines.append(f"**{speaker}:** {text}")
            last_speaker = speaker
        else:
            lines.append(text)
    return "\n".join(lines).strip()


def _to_iso(raw: Any) -> str:
    if not raw:
        return ""
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
    except Exception:
        return ""


def _visibility(detail: dict) -> str:
    explicit = detail.get("visibility")
    if explicit in VALID_VISIBILITIES:
        return str(explicit)
    if detail.get("private") is True:
        return "private"
    if detail.get("team_visible") is True:
        return "team"
    return "internal"


def _sensitivity(detail: dict) -> str:
    explicit = detail.get("sensitivity")
    if explicit in VALID_SENSITIVITIES:
        return str(explicit)
    # Default to safe; transcripts may upgrade to sensitive in a future revision.
    return "safe"


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class IngestResult:
    """Summary of one `CirclebackAdapter.ingest` run."""

    source: str
    since: str
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
            f"Circleback ingest since={self.since}: "
            f"captured={self.captured_count} skipped={self.skipped_count} "
            f"failures={self.failure_count} cursor={self.cursor}"
        )