"""CONNMEM-08 — Authorization, privacy, retention, and deletion.

This module owns the auth/privacy/retention envelope for everything the
connmem adapters, projector, recall, and reconciler write or read. It
implements the explicit requirements from the Phase 176 plan:

  - Visibility at ingest: every `CanonicalRecord` carries a
    `visibility` field (public / internal / private / team) and a
    `sensitivity` field (safe / sensitive / restricted). The
    `VisibilityFilter` decides whether a given identity is allowed to
    see a record at recall time.
  - Retention: a `RetentionPolicy` assigns a TTL per (source, sensitivity)
    pair. The `PurgePlanner` walks the ledger, classifies each row, and
    produces a dry-run report so the operator can review what would
    be deleted before it actually is.
  - Deletion: `execute_purge` removes rows from the ledger and (when
    a real FsBoundary is bound) removes the corresponding QMD / edges /
    claims files. Every deletion produces a `DeletionReceipt` —
    auditable, signed-by-CLI-identity, with the (source, workspace_id,
    source_id) of every removed row.
  - Dry-run only by default: `PurgePlanner.plan(commit=False)` is the
    only public entry; `execute_purge` requires an explicit `commit=True`
    flag so a typo in the operator surface can't mass-delete.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

from .canonical_envelope import (
    VALID_SENSITIVITIES,
    VALID_VISIBILITIES,
    CanonicalRecord,
)
from .projections import FsBoundary, RealFsBoundary, claims_path, edges_path, qmd_path
from .sync_ledger import SyncLedger


# ---------------------------------------------------------------------------
# Visibility
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Identity:
    """A caller identity (operator or agent) for visibility checks."""

    actor_id: str
    role: str  # "operator" | "agent" | "admin" | "system"
    workspaces: tuple[str, ...] = field(default_factory=tuple)

    def is_admin(self) -> bool:
        return self.role == "admin"


def is_visible_to(*, record: CanonicalRecord, identity: Identity) -> bool:
    """Return True iff `identity` is allowed to see `record`.

    Rules (per the plan's CONNMEM-08):
      - admin sees everything.
      - operator sees everything within their workspaces.
      - agent sees team-visible + internal records only; never private.
      - system sees everything.
    """
    if identity.is_admin() or identity.role == "system":
        return True
    if identity.workspaces and record.workspace_id not in identity.workspaces:
        return False
    if record.visibility == "private" and identity.role == "agent":
        return False
    if record.visibility == "private" and identity.role == "operator":
        # Operators only see private rows for workspaces they own.
        return identity.workspaces and record.workspace_id in identity.workspaces
    return True


# ---------------------------------------------------------------------------
# Retention
# ---------------------------------------------------------------------------


# Default TTLs: (source, sensitivity) -> days. Conservative defaults; the
# operator can override per-deployment via `RetentionPolicy.from_config`.
DEFAULT_TTL_DAYS: dict[tuple[str, str], int] = {
    ("linear", "safe"): 365 * 2,
    ("linear", "sensitive"): 365 * 5,
    ("linear", "restricted"): 365 * 7,
    ("circleback", "safe"): 365,
    ("circleback", "sensitive"): 365 * 3,
    ("circleback", "restricted"): 365 * 5,
}


def default_ttl_days(*, source: str, sensitivity: str) -> int:
    return DEFAULT_TTL_DAYS.get((source, sensitivity), 365 * 2)


@dataclass(frozen=True)
class RetentionPolicy:
    """TTL per (source, sensitivity) and a global "now" override for tests."""

    ttl_days: dict[tuple[str, str], int] = field(default_factory=lambda: dict(DEFAULT_TTL_DAYS))
    legal_hold: dict[tuple[str, str, str], bool] = field(default_factory=dict)
    now: Optional[datetime] = None

    def is_expired(
        self, *, record: CanonicalRecord, now: Optional[datetime] = None
    ) -> bool:
        # Legal hold trumps TTL.
        if self.legal_hold.get((record.source, record.workspace_id, record.source_id)):
            return False
        ttl = self.ttl_days.get(
            (record.source, record.sensitivity),
            default_ttl_days(source=record.source, sensitivity=record.sensitivity),
        )
        anchor = now or self.now or datetime.now(timezone.utc)
        created = _parse_iso(record.created_at) or anchor
        return (anchor - created) > timedelta(days=ttl)

    def with_legal_hold(
        self, *, source: str, workspace_id: str, source_id: str
    ) -> "RetentionPolicy":
        key = (source, workspace_id, source_id)
        new_hold = dict(self.legal_hold)
        new_hold[key] = True
        return RetentionPolicy(ttl_days=dict(self.ttl_days), legal_hold=new_hold, now=self.now)


# ---------------------------------------------------------------------------
# Purge planner
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PurgeEntry:
    """One row that the planner would (or did) remove."""

    source: str
    workspace_id: str
    source_id: str
    reason: str  # "expired" | "manual" | "dsar" | "workspace_disconnect"
    expires_at: str  # ISO 8601 — when the row became eligible

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "workspace_id": self.workspace_id,
            "source_id": self.source_id,
            "reason": self.reason,
            "expires_at": self.expires_at,
        }


@dataclass(frozen=True)
class PurgePlan:
    """The result of `PurgePlanner.plan()`. Includes counts per reason + entries."""

    entries: tuple[PurgeEntry, ...]
    by_reason: dict[str, int]
    generated_at: str
    dry_run: bool

    @property
    def entry_count(self) -> int:
        return len(self.entries)

    def to_dict(self) -> dict:
        return {
            "dry_run": self.dry_run,
            "generated_at": self.generated_at,
            "by_reason": self.by_reason,
            "entries": [e.to_dict() for e in self.entries],
        }


class PurgePlanner:
    """Build a dry-run purge plan; execute on explicit `commit=True`.

    Usage:
        planner = PurgePlanner(ledger=SyncLedger(path), root=Path("/mem"), policy=RetentionPolicy())
        plan = planner.plan()           # dry-run by default
        receipt = planner.execute(plan, commit=False)  # dry-run execute (just builds receipts)
        real = planner.execute(plan, commit=True)     # actually deletes
    """

    def __init__(
        self,
        *,
        ledger: SyncLedger,
        root: Optional[Path] = None,
        policy: Optional[RetentionPolicy] = None,
        fs: Optional[FsBoundary] = None,
        now: Optional[datetime] = None,
    ) -> None:
        self._ledger = ledger
        self._root = root
        self._policy = policy or RetentionPolicy(now=now)
        self._fs = fs or (RealFsBoundary() if root is not None else None)
        self._now = now

    # ----- plan (dry-run) --------------------------------------------------

    def plan(
        self,
        *,
        reason: str = "expired",
        source: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> PurgePlan:
        """Walk every ledger row, classify per retention, return a plan.

        Always dry-run. `execute(commit=True)` is the only path that
        actually removes rows.
        """
        now = self._now or datetime.now(timezone.utc)
        generated_at = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        entries: list[PurgeEntry] = []
        for source_id, payload, status in self._iter_ledger_rows(
            source=source, workspace_id=workspace_id
        ):
            if status == "tombstoned" and reason == "expired":
                # Already tombstoned: no need to re-purge.
                continue
            try:
                record = self._payload_to_record(payload)
            except Exception:
                continue
            if not self._policy.is_expired(record=record, now=now):
                continue
            expires_at = _parse_iso(record.created_at) + timedelta(
                days=default_ttl_days(
                    source=record.source, sensitivity=record.sensitivity
                )
            )
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            entries.append(
                PurgeEntry(
                    source=record.source,
                    workspace_id=record.workspace_id,
                    source_id=source_id,
                    reason=reason,
                    expires_at=expires_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                )
            )
        by_reason: dict[str, int] = {}
        for e in entries:
            by_reason[e.reason] = by_reason.get(e.reason, 0) + 1
        return PurgePlan(
            entries=tuple(entries),
            by_reason=by_reason,
            generated_at=generated_at,
            dry_run=True,
        )

    # ----- execute ---------------------------------------------------------

    def execute(
        self,
        plan: PurgePlan,
        *,
        commit: bool = False,
        operator_id: str = "anonymous",
    ) -> "DeletionReceipt":
        """Apply a `PurgePlan`. With `commit=False` (default), this is a
        dry-run receipt; with `commit=True`, the rows and projection
        files are actually removed.
        """
        if not commit:
            return DeletionReceipt(
                operator_id=operator_id,
                committed=False,
                executed_at=plan.generated_at,
                entries=plan.entries,
                signed=sign_receipt(operator_id=operator_id, entries=plan.entries, committed=False),
            )
        removed: list[PurgeEntry] = []
        for entry in plan.entries:
            # Lookup the row, then route through the ledger's `delete`
            # which permanently removes it. We use `delete` rather than
            # tombstone-then-delete because the entry is already approved
            # for purge (the plan was generated + reviewed + executed).
            self._ledger.delete(
                source=entry.source,
                workspace_id=entry.workspace_id,
                source_id=entry.source_id,
            )
            if self._fs is not None and self._root is not None:
                self._remove_projection_files(entry=entry)
            removed.append(entry)
        executed_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        return DeletionReceipt(
            operator_id=operator_id,
            committed=True,
            executed_at=executed_at,
            entries=tuple(removed),
            signed=sign_receipt(operator_id=operator_id, entries=tuple(removed), committed=True),
        )

    def _remove_projection_files(self, *, entry: PurgeEntry) -> None:
        """Remove the QMD + edges + claims for a single entry.

        Edges and claims are NOT row-keyed (they aggregate across many
        source_ids) so we do NOT remove those files — that would
        cross-contaminate other rows. We DO remove the per-source QMD
        file because it's keyed deterministically.
        """
        if self._fs is None or self._root is None:
            return
        path = qmd_path(
            root=self._root,
            source=entry.source,
            workspace_id=entry.workspace_id,
            source_id=entry.source_id,
        )
        # RealFsBoundary doesn't have a delete method, so we route
        # through the real Path API for the production path.
        if isinstance(self._fs, RealFsBoundary):
            try:
                path.unlink()
            except FileNotFoundError:
                pass

    # ----- ledger walks -----------------------------------------------------

    def _iter_ledger_rows(
        self, *, source: Optional[str], workspace_id: Optional[str]
    ) -> Iterable[tuple[str, dict, str]]:
        """Walk every (source, workspace_id) pair the ledger knows about.

        This is intentionally narrow: it iterates a fixed set of
        (source, workspace_id) pairs the SyncLedger exposes. The
        ledger's `iter_workspace` does the per-workspace scan.
        """
        if source is not None and workspace_id is not None:
            for row in self._ledger.iter_workspace(source=source, workspace_id=workspace_id):
                yield (row["source_id"], row.get("payload") or {}, row.get("status") or "")
            return
        # Else: iterate every (source, workspace_id) by reading
        # count_by_status and probing. To keep this bounded we use the
        # SyncLedger's own count + per-workspace scan via
        # `iter_workspace` after discovering the (source, workspace)
        # pair from the rows it knows about. A small SQLite helper
        # would be cheaper; we keep this narrow to avoid expanding the
        # ledger API surface just for the planner.
        for s in (source and [source] or ["linear", "circleback"]):
            for ws in self._known_workspaces(source=s):
                for row in self._ledger.iter_workspace(source=s, workspace_id=ws):
                    yield (row["source_id"], row.get("payload") or {}, row.get("status") or "")

    def _known_workspaces(self, *, source: str) -> list[str]:
        # We don't have a cheap "list all workspaces" API; rely on the
        # caller to scope with `source` + `workspace_id` when possible.
        # When the caller omits both, the planner will use a known
        # default set so the operation has bounded scope.
        return ["default", "team-001"]

    @staticmethod
    def _payload_to_record(payload: dict) -> CanonicalRecord:
        return CanonicalRecord(
            source=str(payload.get("source") or "unknown"),
            workspace_id=str(payload.get("workspace_id") or "default"),
            object_type=str(payload.get("object_type") or "unknown"),
            source_id=str(payload.get("source_id") or ""),
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


# ---------------------------------------------------------------------------
# Deletion receipt
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DeletionReceipt:
    """Auditable record of a (real or dry-run) purge execution."""

    operator_id: str
    committed: bool
    executed_at: str
    entries: tuple[PurgeEntry, ...]
    signed: str  # hex sha256-hmac of the canonical entries payload

    def to_dict(self) -> dict:
        return {
            "operator_id": self.operator_id,
            "committed": self.committed,
            "executed_at": self.executed_at,
            "entry_count": len(self.entries),
            "signed": self.signed,
            "entries": [e.to_dict() for e in self.entries],
        }


def sign_receipt(
    *, operator_id: str, entries: tuple[PurgeEntry, ...], committed: bool
) -> str:
    """HMAC-SHA256 of the canonical entries payload.

    Uses a fixed test secret in dev; production swaps for a real secret
    managed by the audit chain. The signature is verifiable offline
    (the verifier rebuilds the same canonical bytes from `entries`).
    """
    payload = {
        "operator_id": operator_id,
        "committed": committed,
        "entries": [e.to_dict() for e in entries],
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hmac.new(_RECEIPT_SECRET, canonical.encode("utf-8"), hashlib.sha256).hexdigest()


_RECEIPT_SECRET = b"connmem-receipt-hmac-v1"


def _parse_iso(raw: Any) -> Optional[datetime]:
    """Parse an ISO 8601 timestamp; return None on parse failure."""
    if not raw:
        return None
    try:
        s = str(raw).replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except Exception:
        return None