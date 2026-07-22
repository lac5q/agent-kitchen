"""Canonical source envelope for CONNMEM ingestion (Phase 176).

Verbatim field set per Phase 176 176-01-PLAN.md line 67-69::

    source | workspace_id | object_type | source_id | source_url |
    created_at | updated_at | deleted_at | content_hash |
    parent_ids | participants | owners | visibility |
    sensitivity | captured_at | schema_version

FROZEN — the contract test in test_canonical_envelope.py asserts each
field is present and rejects extras. Renames require amending the plan
file AND the contract test together.

This file is THE schema reference; Linear/Circleback/Notion adapters each
project their provider shape into this envelope. The adapter never
redefines the envelope.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field, fields, asdict
from datetime import datetime, timezone
from typing import Any, Iterable, Optional


SCHEMA_VERSION = "connmem/canonical-envelope/v1"
CANONICAL_FIELDS: tuple[str, ...] = (
    "source",
    "workspace_id",
    "object_type",
    "source_id",
    "source_url",
    "created_at",
    "updated_at",
    "deleted_at",
    "content_hash",
    "parent_ids",
    "participants",
    "owners",
    "visibility",
    "sensitivity",
    "captured_at",
    "schema_version",
)
"""Frozen tuple of canonical field names per Phase 176 plan. Do not edit
without amending the plan AND the corresponding contract test."""

VALID_SOURCES: frozenset[str] = frozenset({"circleback", "linear", "notion"})
VALID_VISIBILITIES: frozenset[str] = frozenset({"public", "internal", "private", "team"})
VALID_SENSITIVITIES: frozenset[str] = frozenset({"safe", "sensitive", "restricted"})


@dataclass(frozen=True)
class CanonicalRecord:
    """Provider-agnostic envelope used across the CONNMEM ledger.

    Field shapes are stable; downstream projections (QMD/literal, mem0,
    graph) consume this single shape. Adapters MUST NOT extend or override
    this dataclass — provider-specific shapes live in their adapter modules
    and only the final envelope is `CanonicalRecord`.
    """

    source: str
    workspace_id: str
    object_type: str
    source_id: str
    source_url: str
    created_at: str  # ISO 8601; "unknown" allowed for providers that omit
    updated_at: str  # ISO 8601
    deleted_at: Optional[str]  # ISO 8601 or None for live records
    content_hash: str  # hex sha256 of the canonical body
    parent_ids: tuple[str, ...]  # parent source_ids, in canonical form
    participants: tuple[str, ...]
    owners: tuple[str, ...]
    visibility: str  # one of VALID_VISIBILITIES
    sensitivity: str  # one of VALID_SENSITIVITIES
    captured_at: str  # ISO 8601 — set by ingest, not by provider
    schema_version: str = SCHEMA_VERSION

    def __post_init__(self) -> None:
        if self.source not in VALID_SOURCES:
            raise ValueError(f"source={self.source!r} not in {sorted(VALID_SOURCES)}")
        if self.visibility not in VALID_VISIBILITIES:
            raise ValueError(
                f"visibility={self.visibility!r} not in {sorted(VALID_VISIBILITIES)}"
            )
        if self.sensitivity not in VALID_SENSITIVITIES:
            raise ValueError(
                f"sensitivity={self.sensitivity!r} not in {sorted(VALID_SENSITIVITIES)}"
            )
        # content_hash must be 64 hex chars (sha256)
        if not (len(self.content_hash) == 64 and all(c in "0123456789abcdef" for c in self.content_hash)):
            raise ValueError(
                f"content_hash must be 64-char lowercase hex sha256; got {len(self.content_hash)} chars"
            )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def stable_key(self) -> tuple[str, str, str]:
        """Identify the same record across re-ingest runs.

        (source, workspace_id, source_id) is the canonical primary key.
        Re-ingestion with the same triple updates the record; a different
        triple creates a new one. content_hash is what tells us if the
        body changed (used by the sync ledger for change detection)."""
        return (self.source, self.workspace_id, self.source_id)


def compute_content_hash(body: str | bytes) -> str:
    """sha256 hex digest of the canonical body.

    Used by adapters: produce a stable hash of the body fields that the
    adapter chose to materialise. The hash is what the sync ledger uses
    to detect updates vs duplicate re-ingestions."""
    data = body.encode("utf-8") if isinstance(body, str) else body
    return hashlib.sha256(data).hexdigest()


def make_captured_at_now() -> str:
    """ISO 8601 timestamp at ingest time, UTC, second-precision.

    Captured-at is the ingest timestamp, not the provider's timestamp.
    Use created_at/updated_at/deleted_at for the provider's view of time."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_canonical_record(
    *,
    source: str,
    workspace_id: str,
    object_type: str,
    source_id: str,
    source_url: str,
    created_at: str,
    updated_at: str,
    deleted_at: Optional[str],
    content_body: str | bytes,
    parent_ids: Iterable[str] = (),
    participants: Iterable[str] = (),
    owners: Iterable[str] = (),
    visibility: str = "private",
    sensitivity: str = "sensitive",
) -> CanonicalRecord:
    """Convenience constructor: compute content_hash from the body and stamp captured_at."""
    return CanonicalRecord(
        source=source,
        workspace_id=workspace_id,
        object_type=object_type,
        source_id=source_id,
        source_url=source_url,
        created_at=created_at,
        updated_at=updated_at,
        deleted_at=deleted_at,
        content_hash=compute_content_hash(content_body),
        parent_ids=tuple(parent_ids),
        participants=tuple(participants),
        owners=tuple(owners),
        visibility=visibility,
        sensitivity=sensitivity,
        captured_at=make_captured_at_now(),
    )


def assert_field_set_frozen() -> None:
    """Run-time check: the dataclass' fields must equal the plan-file reference.

    Audit-only; called from the contract test. If this raises, somebody
    edited CanonicalRecord without updating the plan file reference.
    """
    actual = tuple(f.name for f in fields(CanonicalRecord))
    if actual != CANONICAL_FIELDS:
        raise AssertionError(
            f"CanonicalRecord fields {actual} != CANONICAL_FIELDS {CANONICAL_FIELDS}. "
            "Update the Phase 176 plan file reference AND this assertion."
        )


__all__ = [
    "SCHEMA_VERSION",
    "CANONICAL_FIELDS",
    "VALID_SOURCES",
    "VALID_VISIBILITIES",
    "VALID_SENSITIVITIES",
    "CanonicalRecord",
    "compute_content_hash",
    "make_captured_at_now",
    "to_canonical_record",
    "assert_field_set_frozen",
]
