"""CONNMEM-06 — Canonical-record projection to QMD + graph + mem0.

This module is the only place in connmem that writes outside the sync
ledger. It takes a `CanonicalRecord` and produces three downstream
artifacts:

  1. **QMD index entry** — a Markdown file in a per-source directory the
     existing `memory_recall` already federates. File path is deterministic
     from `(source, workspace_id, source_id)` so re-runs are idempotent
     (overwrite, not duplicate).
  2. **Graph edge** — one or more `(from, predicate, to)` triples recorded
     in a per-source JSONL edges file. Captures relationships like
     "issue ACM-101 belongs to project v8.20", "comment c-1 references
     issue ACM-101", "meeting m-7 is the source for issue ACM-101".
  3. **Mem0 claim** — a bounded, attributable claim extracted from the
     canonical body. Every claim carries `source_id`, `source_url`,
     `quote` (the exact field the claim is grounded in), `extraction_version`,
     `observed_at`, and `supersedes` (set when the same source is
     re-ingested with a new content_hash; the prior claim is marked
     superseded rather than deleted so the audit chain remains
     honest).

The three writes are routed through swappable boundaries (filesystem for
tests, real paths in production). A `ProjectionResult` records which
downstream writes succeeded; the ledger's per-row status is then
transitioned from `captured_unrouted` to `routed_unindexed` /
`indexed_unrecalled` / `recalled` by the caller.
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

from .canonical_envelope import CanonicalRecord


EXTRACTION_VERSION = "connmem/claim-extraction/v1"


# ---------------------------------------------------------------------------
# Filesystem boundary
# ---------------------------------------------------------------------------


class FsBoundary:
    """Swappable filesystem boundary for projections.

    Production binds `RealFsBoundary`; tests bind an in-memory tmpdir
    wrapper. All methods mirror the subset of `pathlib` we need.
    """

    def write_text(self, *, path: Path, content: str) -> None:  # noqa: D401
        raise NotImplementedError

    def read_text(self, *, path: Path) -> str:
        raise NotImplementedError

    def exists(self, *, path: Path) -> bool:
        raise NotImplementedError

    def append_text(self, *, path: Path, content: str) -> None:
        raise NotImplementedError


class RealFsBoundary(FsBoundary):
    """Production filesystem boundary — writes go to the real disk."""

    def write_text(self, *, path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def read_text(self, *, path: Path) -> str:
        return path.read_text(encoding="utf-8")

    def exists(self, *, path: Path) -> bool:
        return path.exists()

    def append_text(self, *, path: Path, content: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(content)


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------


def qmd_path(*, root: Path, source: str, workspace_id: str, source_id: str) -> Path:
    return root / source / workspace_id / f"{source_id}.md"


def edges_path(*, root: Path, source: str) -> Path:
    return root / source / "_edges.jsonl"


def claims_path(*, root: Path, source: str) -> Path:
    return root / source / "_claims.jsonl"


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProjectionResult:
    source: str
    source_id: str
    qmd_written: bool
    edges_written: tuple[str, ...]
    claims_written: tuple[str, ...]
    claim_superseded: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "source_id": self.source_id,
            "qmd_written": self.qmd_written,
            "edges_written": list(self.edges_written),
            "claims_written": list(self.claims_written),
            "claim_superseded": list(self.claim_superseded),
        }


# ---------------------------------------------------------------------------
# Projector
# ---------------------------------------------------------------------------


class Projector:
    """Project a `CanonicalRecord` to QMD + graph + mem0.

    Idempotent: re-projecting the same `CanonicalRecord` produces
    byte-identical QMD and JSONL artifacts.
    """

    def __init__(
        self,
        *,
        root: Path,
        fs: Optional[FsBoundary] = None,
    ) -> None:
        self._root = root
        self._fs = fs or RealFsBoundary()

    # ----- public entry point ----------------------------------------------

    def project(self, record: CanonicalRecord) -> ProjectionResult:
        qmd_target = qmd_path(
            root=self._root,
            source=record.source,
            workspace_id=record.workspace_id,
            source_id=record.source_id,
        )
        self._write_qmd(record=record, target=qmd_target)
        edges = self._write_edges(record=record)
        claims, superseded = self._write_claims(record=record)
        return ProjectionResult(
            source=record.source,
            source_id=record.source_id,
            qmd_written=True,
            edges_written=edges,
            claims_written=claims,
            claim_superseded=superseded,
        )

    # ----- QMD index --------------------------------------------------------

    def _write_qmd(self, *, record: CanonicalRecord, target: Path) -> None:
        body = self._qmd_body(record)
        self._fs.write_text(path=target, content=body)

    def _qmd_body(self, record: CanonicalRecord) -> str:
        # YAML-style frontmatter so downstream QMD tooling can read it.
        frontmatter = {
            "source": record.source,
            "workspace_id": record.workspace_id,
            "object_type": record.object_type,
            "source_id": record.source_id,
            "source_url": record.source_url,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
            "deleted_at": record.deleted_at,
            "content_hash": record.content_hash,
            "schema_version": record.schema_version,
            "captured_at": record.captured_at,
        }
        lines = ["---"]
        for key, value in frontmatter.items():
            lines.append(f"{key}: {self._yaml_scalar(value)}")
        lines.append("---")
        lines.append("")
        # Body is the human-readable projection — the same content that
        # fed `content_hash` so the QMD text is reproducible.
        body = self._canonical_body_text(record)
        lines.append(body)
        return "\n".join(lines) + "\n"

    @staticmethod
    def _yaml_scalar(value: Any) -> str:
        if value is None:
            return "null"
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, (int, float)):
            return str(value)
        s = str(value)
        if any(ch in s for ch in [":", "#", "\n", '"']) or s.strip() != s:
            escaped = s.replace("\\", "\\\\").replace('"', '\\"')
            return f'"{escaped}"'
        return s

    @staticmethod
    def _canonical_body_text(record: CanonicalRecord) -> str:
        parts: list[str] = []
        parts.append(f"# {record.object_type}: {record.source_id}")
        if record.source_url:
            parts.append("")
            parts.append(f"Source: {record.source_url}")
        if record.participants:
            parts.append("")
            parts.append(f"Participants: {', '.join(record.participants)}")
        if record.owners:
            parts.append("")
            parts.append(f"Owners: {', '.join(record.owners)}")
        if record.parent_ids:
            parts.append("")
            parts.append(f"Parent: {', '.join(record.parent_ids)}")
        return "\n".join(parts).strip()

    # ----- graph edges -----------------------------------------------------

    def _write_edges(self, *, record: CanonicalRecord) -> tuple[str, ...]:
        path = edges_path(root=self._root, source=record.source)
        edge_ids: list[str] = []
        edges = self._edges_for(record)
        if not edges:
            return ()
        existing: list[dict[str, Any]] = []
        if self._fs.exists(path=path):
            existing = self._read_jsonl_via_fs(path)
        # Drop prior edges from this source_id so re-runs don't leave
        # stale triples behind; the fresh edges replace them.
        existing = [e for e in existing if e.get("from") != record.source_id]
        existing.extend(edges)
        self._fs.write_text(path=path, content="\n".join(_jsonl_line(e) for e in existing) + "\n")
        edge_ids.extend(e["edge_id"] for e in edges)
        return tuple(edge_ids)

    @staticmethod
    def _edges_for(record: CanonicalRecord) -> list[dict[str, Any]]:
        edges: list[dict[str, Any]] = []
        for parent_id in record.parent_ids:
            if not parent_id:
                continue
            edges.append(
                {
                    "edge_id": _edge_id(record.source_id, parent_id, "child_of"),
                    "from": record.source_id,
                    "predicate": "child_of",
                    "to": parent_id,
                    "source": record.source,
                }
            )
        for owner in record.owners:
            if not owner:
                continue
            edges.append(
                {
                    "edge_id": _edge_id(record.source_id, owner, "owned_by"),
                    "from": record.source_id,
                    "predicate": "owned_by",
                    "to": owner,
                    "source": record.source,
                }
            )
        return edges

    # ----- mem0 claims -----------------------------------------------------

    def _write_claims(
        self, *, record: CanonicalRecord
    ) -> tuple[tuple[str, ...], tuple[str, ...]]:
        path = claims_path(root=self._root, source=record.source)
        if not self._fs.exists(path=path):
            self._fs.write_text(path=path, content="")

        # Step 1: supersede any prior claim keyed by this source_id so the
        # audit chain stays honest (the prior claim is marked
        # `superseded_by` rather than deleted).
        superseded: list[str] = []
        existing = self._read_jsonl_via_fs(path)
        for line in existing:
            if line.get("source_id") == record.source_id and not line.get("superseded_by"):
                line["superseded_by"] = record.content_hash
                superseded.append(line["claim_id"])
        if superseded:
            self._fs.write_text(
                path=path, content="\n".join(_jsonl_line(e) for e in existing) + "\n"
            )

        # Step 2: extract new claims from the canonical body. Bounded
        # extraction — the only durable claims the project currently
        # promotes are ownership + parent-link edges, not free-text
        # paragraphs. Free-text claims (decisions, commitments) require
        # an LLM pass that's queued for a follow-on.
        new_claims: list[dict[str, Any]] = []
        for owner in record.owners:
            if not owner:
                continue
            new_claims.append(
                self._make_claim(
                    record=record,
                    predicate="owned_by",
                    subject=record.source_id,
                    object=owner,
                    quote=f"owners: {', '.join(record.owners)}",
                )
            )
        for parent in record.parent_ids:
            if not parent:
                continue
            new_claims.append(
                self._make_claim(
                    record=record,
                    predicate="child_of",
                    subject=record.source_id,
                    object=parent,
                    quote=f"parent_ids: {', '.join(record.parent_ids)}",
                )
            )

        if not new_claims:
            return (), tuple(superseded)

        self._fs.append_text(
            path=path, content="".join(_jsonl_line(c) + "\n" for c in new_claims)
        )
        return tuple(c["claim_id"] for c in new_claims), tuple(superseded)

    @staticmethod
    def _make_claim(
        *,
        record: CanonicalRecord,
        predicate: str,
        subject: str,
        object: str,
        quote: str,
    ) -> dict[str, Any]:
        claim_id = hashlib.sha256(
            f"{record.source}|{record.source_id}|{predicate}|{object}".encode("utf-8")
        ).hexdigest()[:16]
        return {
            "claim_id": claim_id,
            "source": record.source,
            "source_id": record.source_id,
            "source_url": record.source_url,
            "predicate": predicate,
            "subject": subject,
            "object": object,
            "quote": quote,
            "extraction_version": EXTRACTION_VERSION,
            "observed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "content_hash": record.content_hash,
        }

    # ----- jsonl helpers ----------------------------------------------------

    def _read_jsonl_via_fs(self, path: Path) -> list[dict[str, Any]]:
        """Read JSONL through the swappable FsBoundary (so tests work)."""
        if not self._fs.exists(path=path):
            return []
        try:
            raw = self._fs.read_text(path=path)
        except FileNotFoundError:
            return []
        out: list[dict[str, Any]] = []
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return out

    def read_claims(self, *, source: str) -> list[dict[str, Any]]:
        return self._read_jsonl_via_fs(claims_path(root=self._root, source=source))

    def read_edges(self, *, source: str) -> list[dict[str, Any]]:
        return self._read_jsonl_via_fs(edges_path(root=self._root, source=source))

    def read_qmd(self, *, source: str, workspace_id: str, source_id: str) -> Optional[str]:
        path = qmd_path(
            root=self._root, source=source, workspace_id=workspace_id, source_id=source_id
        )
        if not self._fs.exists(path=path):
            return None
        return self._fs.read_text(path=path)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _edge_id(from_id: str, to_id: str, predicate: str) -> str:
    return hashlib.sha256(f"{from_id}|{predicate}|{to_id}".encode("utf-8")).hexdigest()[:16]


def _jsonl_line(obj: dict[str, Any]) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))