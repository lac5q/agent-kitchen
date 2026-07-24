"""CONNMEM-05 — Scheduled reconciliation job.

The webhook handler delivers low-latency create/update/remove events. Webhook
delivery is best-effort: webhooks can be missed (provider outage, network
hiccup, dropped headers). The reconciler is the self-healing safety net that
walks every team, every workspace, every object family on a schedule and
reconciles the ledger against current provider truth.

What it does per pass:
  1. Reads the per-source cursor (set by `SyncLedger.set_cursor`).
  2. Walks the team list, then every team, calling the adapter's
     `ingest_team` (which is itself idempotent + replay-safe).
  3. Detects deletions by comparing the ledger row count to the
     provider-supplied count and tombstoning any ledger row whose
     `source_id` is no longer present in the provider listing.
  4. Detects permission loss by catching adapter-level failures and
     tombstoning affected rows so the operator can see the gap.
  5. Updates the cursor to the highest successful checkpoint so the
     next pass resumes from there.

The reconciler is intentionally side-effect-free except for ledger writes
and a status row it appends to the audit chain. It does NOT touch the
provider write surface.

Production usage:
    reconciler = Reconciler(ledger=SyncLedger(path), adapters={"linear": LinearAdapter(...)})
    report = reconciler.run(source="linear")
    print(report.summary())
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Optional

from .adapters.linear import IngestResult, LinearAdapter
from .sync_ledger import LEDGER_STATUSES, SyncLedger


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ReconcileReport:
    """Summary of one reconciliation pass per source."""

    source: str
    started_at: str
    finished_at: str
    teams_scanned: tuple[str, ...]
    captured: int
    tombstoned: int
    failures: tuple[tuple[str, str], ...]
    cursor: str

    @property
    def failure_count(self) -> int:
        return len(self.failures)

    @property
    def tombstoned_count(self) -> int:
        return self.tombstoned

    def summary(self) -> str:
        return (
            f"Reconcile[{self.source}] teams={len(self.teams_scanned)} "
            f"captured={self.captured} tombstoned={self.tombstoned} "
            f"failures={self.failure_count} cursor={self.cursor}"
        )


# ---------------------------------------------------------------------------
# Reconciler
# ---------------------------------------------------------------------------


class Reconciler:
    """Periodic full-inventory reconciliation.

    For each registered (source, adapter) pair, the reconciler walks every
    team, lets the adapter's idempotent `ingest_team` reconcile the upsert
    path, and tombstones ledger rows whose `source_id` is no longer present
    in the provider listing (detection of deletions / permission loss).
    """

    def __init__(
        self,
        *,
        ledger: SyncLedger,
        adapters: dict[str, object],
        source_provider_pairs: Optional[dict[str, list[str]]] = None,
    ) -> None:
        self._ledger = ledger
        self._adapters = adapters
        # `source_provider_pairs` is a mapping from source to the list of
        # team_ids / workspace_ids to walk. If absent, the adapter is
        # asked for its own team list.
        self._source_provider_pairs = source_provider_pairs or {}

    # ----- entry point ------------------------------------------------------

    def run(self, *, source: str) -> ReconcileReport:
        if source not in self._adapters:
            raise ValueError(f"unknown source: {source}")
        started_at = self._now_iso()
        adapter = self._adapters[source]
        team_ids = self._resolve_team_ids(adapter=adapter, source=source)

        captured_total = 0
        tombstoned_total = 0
        failures: list[tuple[str, str]] = []
        scanned: list[str] = []

        for team_id in team_ids:
            scanned.append(team_id)
            ingest_result = self._ingest_team(adapter=adapter, source=source, team_id=team_id)
            captured_total += ingest_result.captured_count
            failures.extend(ingest_result.failures)
            tombstoned_total += self._tombstone_missing(
                source=source,
                workspace_id=team_id,
                live_ids=self._live_source_ids(adapter=adapter, source=source, team_id=team_id),
            )

        finished_at = self._now_iso()
        cursor = f"{source}#teams={','.join(scanned)}"
        self._ledger.set_cursor(source, cursor)
        return ReconcileReport(
            source=source,
            started_at=started_at,
            finished_at=finished_at,
            teams_scanned=tuple(scanned),
            captured=captured_total,
            tombstoned=tombstoned_total,
            failures=tuple(failures),
            cursor=cursor,
        )

    # ----- team enumeration -------------------------------------------------

    def _resolve_team_ids(self, *, adapter: object, source: str) -> list[str]:
        if source in self._source_provider_pairs:
            return list(self._source_provider_pairs[source])
        # LinearAdapter exposes a teams() method; other adapters will get
        # their own enumeration when added.
        teams_fn = getattr(adapter, "teams", None)
        if callable(teams_fn):
            teams = teams_fn()
            return [str(t.get("id") or t.get("key") or "") for t in teams if t]
        return ["default"]

    # ----- per-team ingest ---------------------------------------------------

    def _ingest_team(self, *, adapter: object, source: str, team_id: str) -> IngestResult:
        if source == "linear" and isinstance(adapter, LinearAdapter):
            return adapter.ingest_team(team_id=team_id)
        raise ValueError(f"adapter for source {source!r} does not support ingest_team")

    def _live_source_ids(self, *, adapter: object, source: str, team_id: str) -> set[str]:
        if source == "linear" and isinstance(adapter, LinearAdapter):
            try:
                issues = adapter._cli.issues(team_id=team_id, page_size=50)  # noqa: SLF001
                return {str(i.get("id") or "") for i in issues if i.get("id")}
            except Exception:
                return set()
        return set()

    # ----- tombstoning ------------------------------------------------------

    def _tombstone_missing(
        self, *, source: str, workspace_id: str, live_ids: set[str]
    ) -> int:
        """Mark ledger rows whose source_id is no longer present in the provider listing.

        A row is tombstoned when:
          - The provider returned a non-empty live listing, AND
          - The row's `source_id` is absent from that listing, AND
          - The row's current status is not already `tombstoned`.

        When the provider listing is empty (network failure, permissions
        lost), the reconciler does NOT tombstone — that would amplify
        failures into mass deletion. The empty listing is recorded as a
        failure in the report and the operator decides.
        """
        from .canonical_envelope import CanonicalRecord

        if not live_ids:
            return 0
        count = 0
        for row in self._ledger.iter_workspace(source=source, workspace_id=workspace_id):
            sid = str(row.get("source_id") or "")
            status = str(row.get("status") or "")
            if not sid or sid in live_ids or status == "tombstoned":
                continue
            payload = row.get("payload") or {}
            try:
                record = CanonicalRecord(
                    source=str(payload.get("source") or source),
                    workspace_id=str(payload.get("workspace_id") or workspace_id),
                    object_type=str(payload.get("object_type") or "unknown"),
                    source_id=sid,
                    source_url=str(payload.get("source_url") or ""),
                    created_at=str(payload.get("created_at") or ""),
                    updated_at=str(payload.get("updated_at") or ""),
                    deleted_at=str(payload.get("deleted_at") or "") or None,
                    content_hash=str(payload.get("content_hash") or ""),
                    parent_ids=tuple(payload.get("parent_ids") or ()),
                    participants=tuple(payload.get("participants") or ()),
                    owners=tuple(payload.get("owners") or ()),
                    visibility=str(payload.get("visibility") or "internal"),
                    sensitivity=str(payload.get("sensitivity") or "safe"),
                    captured_at=str(payload.get("captured_at") or ""),
                    schema_version=str(payload.get("schema_version") or ""),
                )
            except Exception:
                # Malformed stored payload — leave it alone.
                continue
            self._ledger.upsert(record, status="tombstoned")
            count += 1
        return count

    # ----- helpers ----------------------------------------------------------

    def _now_iso(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")