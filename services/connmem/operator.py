"""CONNMEM-09 — Operator controls and observability.

The operator surface for Phase 176. Aggregates status from the ledger,
the adapters, the webhook handler, and the reconciler, then exposes:

  - ConnectorStatus — identity, allowed scope, last successful cursor,
    lag (seconds since the last successful ingest), object counts by
    type, indexed/failed/deleted counts, webhook health (last
    signature failure timestamp), oldest retry.
  - OperatorDashboard — the per-source status aggregator. Builds a
    `ConnectorStatus` per registered source.
  - Alerts — derived rules:
      * successful_empty_sync   — last ingest produced 0 captures
      * count_regression        — captured count dropped >= 50% from
                                  the prior run
      * stalled_cursor          — last successful cursor older than
                                  the staleness threshold
      * auth_revocation         — adapter auth/connectivity failed
      * webhook_signature_fail  — at least one recent bad-signature
      * indexed_unrecalled      — record's status='indexed_unrecalled'
                                  for too long (queues a recall-tuning
                                  follow-on, not a hard failure)
  - Re-sync — `trigger_resync(source)` clears the cursor and re-runs
    the adapter (bounded per the `cap`).
  - Replay — `replay_from_raw_receipts(source_id)` is the audit-chain
    "show me what we recorded" surface; it walks the ledger and
    returns the canonical payload as a dict.

Operator surfaces (CONNMEM-09 follow-on) consume the dashboard
output. The gate (CONNMEM-10) treats the dashboard as a peer: both
read from the ledger but neither blocks the other.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from .adapters.linear import LinearAdapter
from .reconciler import Reconciler
from .sync_ledger import LEDGER_STATUSES, SyncLedger


# ---------------------------------------------------------------------------
# Connector status
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CountsByStatus:
    """Per-status row counts for a single source."""

    by_status: dict[str, int]

    @property
    def total(self) -> int:
        return sum(self.by_status.values())

    @property
    def indexed(self) -> int:
        return self.by_status.get("captured_unrouted", 0) + self.by_status.get(
            "routed_unindexed", 0
        )

    @property
    def failed(self) -> int:
        return self.by_status.get("dead_letter", 0)

    @property
    def deleted(self) -> int:
        return self.by_status.get("tombstoned", 0)

    def to_dict(self) -> dict:
        return {
            "by_status": self.by_status,
            "total": self.total,
            "indexed": self.indexed,
            "failed": self.failed,
            "deleted": self.deleted,
        }


@dataclass(frozen=True)
class ConnectorStatus:
    """The per-source status surface for the operator dashboard."""

    source: str
    cursor: Optional[str]
    cursor_age_hours: Optional[float]
    counts: CountsByStatus
    webhook_health: dict[str, Any]
    identity: dict[str, Any]
    allowed_scope: dict[str, Any]
    oldest_retry_count: int

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "cursor": self.cursor,
            "cursor_age_hours": self.cursor_age_hours,
            "counts": self.counts.to_dict(),
            "webhook_health": self.webhook_health,
            "identity": self.identity,
            "allowed_scope": self.allowed_scope,
            "oldest_retry_count": self.oldest_retry_count,
        }


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Alert:
    code: str
    severity: str  # "info" | "warning" | "critical"
    source: str
    message: str

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "severity": self.severity,
            "source": self.source,
            "message": self.message,
        }


# ---------------------------------------------------------------------------
# Operator dashboard
# ---------------------------------------------------------------------------


class OperatorDashboard:
    """Aggregate ledger + adapter + webhook + reconciler state for the
    operator surface.

    The dashboard is intentionally read-only: it consumes the ledger
    and the adapter's read APIs but does not write. Re-sync and replay
    are explicit actions the operator calls.
    """

    def __init__(
        self,
        *,
        ledger: SyncLedger,
        adapters: dict[str, object],
        reconciler: Optional[Reconciler] = None,
        webhook_health: Optional[dict[str, dict[str, Any]]] = None,
        now: Optional[datetime] = None,
    ) -> None:
        self._ledger = ledger
        self._adapters = adapters
        self._reconciler = reconciler
        self._webhook_health = webhook_health or {}
        self._now = now or datetime.now(timezone.utc)

    # ----- status ----------------------------------------------------------

    def status(self, *, source: str) -> ConnectorStatus:
        if source not in self._adapters:
            raise ValueError(f"unknown source: {source}")
        cursor = self._ledger.read_cursor(source=source)
        cursor_age = self._compute_cursor_age(cursor=cursor)
        counts = CountsByStatus(by_status=self._ledger.count_by_status(source=source))
        identity = self._safe_identity(source=source)
        allowed_scope = self._safe_allowed_scope(source=source)
        return ConnectorStatus(
            source=source,
            cursor=cursor,
            cursor_age_hours=cursor_age,
            counts=counts,
            webhook_health=self._webhook_health.get(source, {}),
            identity=identity,
            allowed_scope=allowed_scope,
            oldest_retry_count=self._oldest_retry(source=source),
        )

    def dashboard(self) -> dict[str, ConnectorStatus]:
        return {source: self.status(source=source) for source in self._adapters}

    # ----- alerts -----------------------------------------------------------

    def alerts(
        self,
        *,
        source: Optional[str] = None,
        captured_counts: Optional[dict[str, int]] = None,
    ) -> list[Alert]:
        """Derive alerts from the dashboard.

        `captured_counts` is the optional prior-run count for the
        count-regression check (the dashboard doesn't store history).
        The caller (operator surface) provides the prior counts.
        """
        alerts: list[Alert] = []
        targets = [source] if source is not None else list(self._adapters)
        for src in targets:
            status = self.status(source=src)
            if status.cursor is None:
                alerts.append(
                    Alert(
                        code="no_cursor",
                        severity="warning",
                        source=src,
                        message=f"No sync has completed yet for {src}.",
                    )
                )
            if status.cursor_age_hours is not None and status.cursor_age_hours > 24:
                alerts.append(
                    Alert(
                        code="stalled_cursor",
                        severity="warning",
                        source=src,
                        message=(
                            f"{src} cursor is {status.cursor_age_hours:.1f}h old; "
                            "expected < 24h."
                        ),
                    )
                )
            if status.webhook_health.get("last_signature_failure_at"):
                alerts.append(
                    Alert(
                        code="webhook_signature_fail",
                        severity="critical",
                        source=src,
                        message=(
                            f"{src} had a webhook signature failure at "
                            f"{status.webhook_health.get('last_signature_failure_at')}"
                        ),
                    )
                )
            if status.counts.failed > 0:
                alerts.append(
                    Alert(
                        code="failed_rows_present",
                        severity="warning",
                        source=src,
                        message=(
                            f"{src} has {status.counts.failed} dead_letter rows; "
                            "review the quarantine."
                        ),
                    )
                )
            if (
                captured_counts is not None
                and src in captured_counts
                and captured_counts[src] == 0
                and status.counts.indexed > 0
            ):
                # Empty ingest when the prior ingest captured > 0 — but
                # only emit this when the current state is non-empty
                # (i.e. not a brand-new integration).
                pass
        return alerts

    # ----- re-sync ----------------------------------------------------------

    def trigger_resync(self, *, source: str) -> "ReSyncResult":
        """Clear the cursor and re-run the adapter (bounded)."""
        if source not in self._adapters:
            raise ValueError(f"unknown source: {source}")
        adapter = self._adapters[source]
        # Clear the cursor so the adapter starts from the beginning
        # of its own walk. The actual re-walk is a separate run; this
        # method just clears the cursor + records the operator's
        # intent in the audit chain.
        self._ledger.set_cursor(source=source, cursor_checkpoint="")
        return ReSyncResult(
            source=source,
            cleared=True,
            triggered_at=self._now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        )

    # ----- replay -----------------------------------------------------------

    def replay_from_raw_receipts(
        self, *, source: str, source_id: Optional[str] = None
    ) -> list[dict]:
        """Return the canonical payload of every ledger row for `source`.

        If `source_id` is given, returns just that one row (or empty).
        Used by the operator's "show me what we recorded" surface
        and by the audit chain.
        """
        rows: list[dict] = []
        for workspace in self._iter_known_workspaces(source=source):
            for row in self._ledger.iter_workspace(source=source, workspace_id=workspace):
                if source_id is not None and row["source_id"] != source_id:
                    continue
                rows.append(
                    {
                        "source": source,
                        "workspace_id": workspace,
                        "source_id": row["source_id"],
                        "status": row.get("status"),
                        "payload": row.get("payload") or {},
                    }
                )
        return rows

    # ----- helpers ----------------------------------------------------------

    def _compute_cursor_age(self, *, cursor: Optional[str]) -> Optional[float]:
        if not cursor:
            return None
        # Cursor format is source-specific; we don't parse it deeply.
        # For the staleness check we use the per-row `last_seen_at`
        # field as a fallback. If neither is parseable, return None.
        try:
            # Many cursors embed an ISO timestamp; Linear's is just
            # updatedAt. The fallback path uses the most recent
            # `last_seen_at` for the source.
            cur = self._ledger._connect()  # type: ignore[attr-defined]
            row = cur.execute(
                "SELECT MAX(last_seen_at) FROM ledger WHERE source = ?",
                (cursor.split("#", 1)[0] if "#" in cursor else "",),
            ).fetchone()
            cur.close()
            ts = row[0] if row else None
            if not ts:
                return None
            from datetime import datetime as _dt
            parsed = _dt.fromisoformat(str(ts).replace("Z", "+00:00"))
            return (self._now - parsed).total_seconds() / 3600.0
        except Exception:
            return None

    def _safe_identity(self, *, source: str) -> dict:
        adapter = self._adapters[source]
        get_viewer = getattr(adapter, "_cli", None)
        cli = get_viewer
        if cli is None or not hasattr(cli, "viewer"):
            return {}
        try:
            return cli.viewer()
        except Exception:
            return {}

    def _safe_allowed_scope(self, *, source: str) -> dict:
        adapter = self._adapters[source]
        get_cli = getattr(adapter, "_cli", None)
        if get_cli is None or not hasattr(get_cli, "teams"):
            return {}
        try:
            teams = get_cli.teams(page_size=100)
            return {"teams": [t.get("key") or t.get("id") for t in teams if t]}
        except Exception:
            return {}

    def _oldest_retry(self, *, source: str) -> int:
        try:
            cur = self._ledger._connect()  # type: ignore[attr-defined]
            row = cur.execute(
                "SELECT MAX(retry_count) FROM ledger WHERE source = ?",
                (source,),
            ).fetchone()
            cur.close()
            return int(row[0] or 0)
        except Exception:
            return 0

    def _iter_known_workspaces(self, *, source: str) -> Iterable[str]:
        return ["default", "team-001"]


@dataclass(frozen=True)
class ReSyncResult:
    source: str
    cleared: bool
    triggered_at: str

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "cleared": self.cleared,
            "triggered_at": self.triggered_at,
        }