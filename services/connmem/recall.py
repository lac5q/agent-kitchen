"""CONNMEM-07 — Unified recall + cross-source linking.

Extends memroos's `memory_recall` (defined in
`services/knowledge-mcp/knowledge_system/memory_recall.py`) to search the
new QMD collections the connmem projector writes to (`<root>/<source>/<ws>/<id>.md`).

Returns a unified `RecallHit` per result with:
  - source              ("linear" | "circleback" | ...)
  - object_type         ("issue" | "comment" | "project" | "meeting" | ...)
  - source_id           (provider-native id, stable across re-runs)
  - source_url          (deep link into the provider)
  - workspace_id
  - created_at, updated_at, deleted_at
  - content_hash        (so the caller can verify the row is the
                         canonical one, not a stale duplicate)
  - score               (0.0..1.0; simple lexical match — production
                         should swap for the existing mem0 / vector
                         ranker; this module only adds the connmem
                         federation + provenance)
  - snippet             (up to 240 chars of the QMD body, used for
                         human-readable context)
  - path                (filesystem path of the QMD entry; useful
                         for deep-link / audit)

Cross-source linking (CONNMEM-07 explicit requirement): scan claims
written by the projector for explicit URL matches between a Circleback
meeting and a Linear issue. Conservative — only links when:
  - The Circleback meeting transcript contains a Linear URL (`linear.app/.../issue/...`).
  - The Linear issue's `source_url` equals the same Linear URL.
Uncertain links are kept as `ReviewableLink` with a `confidence` score
rather than silently merged. The operator surfaces them in CONNMEM-09.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional

from .projections import FsBoundary, Projector, claims_path, qmd_path


# ---------------------------------------------------------------------------
# Hit
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RecallHit:
    source: str
    object_type: str
    source_id: str
    source_url: str
    workspace_id: str
    created_at: str
    updated_at: str
    deleted_at: Optional[str]
    content_hash: str
    score: float
    snippet: str
    path: str

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "object_type": self.object_type,
            "source_id": self.source_id,
            "source_url": self.source_url,
            "workspace_id": self.workspace_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "deleted_at": self.deleted_at,
            "content_hash": self.content_hash,
            "score": self.score,
            "snippet": self.snippet,
            "path": self.path,
        }


@dataclass(frozen=True)
class ReviewableLink:
    """A conservative cross-source link proposal.

    A `Link` is a candidate edge between two source records that the
    system found via explicit URL/ID overlap. Confidence is bounded
    (0.0..1.0). Operators promote links by writing them to the graph;
    the system never silently merges unrelated entities.
    """

    from_source: str
    from_source_id: str
    to_source: str
    to_source_id: str
    predicate: str  # "references" | "derived_from" | "child_of"
    evidence_url: str
    confidence: float

    def to_dict(self) -> dict:
        return {
            "from_source": self.from_source,
            "from_source_id": self.from_source_id,
            "to_source": self.to_source,
            "to_source_id": self.to_source_id,
            "predicate": self.predicate,
            "evidence_url": self.evidence_url,
            "confidence": self.confidence,
        }


# ---------------------------------------------------------------------------
# Recall
# ---------------------------------------------------------------------------


_LINEAR_URL_RE = re.compile(r"https?://[^\s)\]]+/issue/[A-Za-z0-9-]+")


class Recall:
    """Federate `memory_recall` over connmem's projected QMD collections.

    The `Recall` class is intentionally narrow: it searches the QMD files
    the `Projector` writes, returns ranked `RecallHit`s, and surfaces
    `ReviewableLink`s. Higher-level ranking (vector similarity, mem0
    re-rank) composes via the existing `memory_recall` API; the connmem
    layer is a federation boundary, not a replacement.
    """

    def __init__(
        self,
        *,
        root: Path,
        fs: Optional[FsBoundary] = None,
        projector: Optional[Projector] = None,
        max_results: int = 50,
        snippet_chars: int = 240,
    ) -> None:
        self._root = root
        self._fs = fs or (projector._fs if projector is not None else None)  # type: ignore[attr-defined]
        self._projector = projector
        self._max_results = max_results
        self._snippet_chars = snippet_chars

    def _resolve_fs(self) -> FsBoundary:
        if self._fs is None:
            if self._projector is not None:
                self._fs = self._projector._fs  # type: ignore[attr-defined]
            else:
                # Default: real filesystem.
                from .projections import RealFsBoundary
                self._fs = RealFsBoundary()
        return self._fs

    # ----- search -----------------------------------------------------------

    def search(
        self,
        query: str,
        *,
        sources: Optional[Iterable[str]] = None,
        workspace_id: Optional[str] = None,
        object_types: Optional[Iterable[str]] = None,
        include_deleted: bool = False,
    ) -> list[RecallHit]:
        """Lexical search across every connmem QMD file under `root`.

        The query is matched against the QMD body (after the YAML
        frontmatter). Ranked by a simple token-overlap score; production
        callers should compose with the existing mem0 / vector
        ranker rather than rely on this.
        """
        fs = self._resolve_fs()
        query_tokens = self._tokens(query)
        if not query_tokens:
            return []

        hits: list[RecallHit] = []
        for path in self._iter_qmd_paths(fs=fs, sources=sources, workspace_id=workspace_id):
            content = fs.read_text(path=path)
            frontmatter, body = self._split_frontmatter(content)
            if not frontmatter:
                continue
            if not include_deleted and frontmatter.get("deleted_at"):
                continue
            if object_types is not None and frontmatter.get("object_type") not in set(object_types):
                continue
            score = self._score(body=body, query_tokens=query_tokens)
            if score <= 0.0:
                continue
            hits.append(
                RecallHit(
                    source=str(frontmatter.get("source") or ""),
                    object_type=str(frontmatter.get("object_type") or ""),
                    source_id=str(frontmatter.get("source_id") or ""),
                    source_url=str(frontmatter.get("source_url") or ""),
                    workspace_id=str(frontmatter.get("workspace_id") or ""),
                    created_at=str(frontmatter.get("created_at") or ""),
                    updated_at=str(frontmatter.get("updated_at") or ""),
                    deleted_at=frontmatter.get("deleted_at"),
                    content_hash=str(frontmatter.get("content_hash") or ""),
                    score=round(score, 3),
                    snippet=self._snippet(body=body),
                    path=str(path),
                )
            )
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[: self._max_results]

    # ----- cross-source linking --------------------------------------------

    def reviewable_links(
        self,
        *,
        sources: Optional[Iterable[str]] = None,
        min_confidence: float = 0.5,
    ) -> list[ReviewableLink]:
        """Find candidate cross-source edges by scanning for explicit URL overlap.

        Conservative: only links when both sides of the relationship are
        present in the projected QMD/claims and the same URL is found.
        The caller (operator surface in CONNMEM-09) decides whether to
        promote any given link.
        """
        fs = self._resolve_fs()
        target_sources = set(sources) if sources is not None else {"circleback", "linear"}
        # Build source_url -> (source, source_id) index from the QMDs.
        url_index: dict[str, tuple[str, str]] = {}
        for path in self._iter_qmd_paths(fs=fs, sources=target_sources):
            try:
                frontmatter, _ = self._split_frontmatter(fs.read_text(path=path))
            except FileNotFoundError:
                continue
            if not frontmatter:
                continue
            source = str(frontmatter.get("source") or "")
            source_id = str(frontmatter.get("source_id") or "")
            url = str(frontmatter.get("source_url") or "")
            if source and source_id and url:
                url_index[url] = (source, source_id)

        # Walk every claim in target sources, looking for Linear URLs
        # embedded in the claim's `quote` field. A Circleback meeting
        # body that cites a Linear issue URL = a conservative link.
        links: list[ReviewableLink] = []
        for source in target_sources:
            path = claims_path(root=self._root, source=source)
            if not fs.exists(path=path):
                continue
            for line in fs.read_text(path=path).splitlines():
                if not line.strip():
                    continue
                try:
                    claim = json.loads(line)
                except json.JSONDecodeError:
                    continue
                quote = str(claim.get("quote") or "")
                for match in _LINEAR_URL_RE.findall(quote):
                    if match in url_index:
                        other_source, other_source_id = url_index[match]
                        if other_source == source:
                            continue
                        links.append(
                            ReviewableLink(
                                from_source=source,
                                from_source_id=str(claim.get("source_id") or ""),
                                to_source=other_source,
                                to_source_id=other_source_id,
                                predicate="references",
                                evidence_url=match,
                                confidence=0.9,
                            )
                        )
        links.sort(key=lambda link: (link.from_source, link.from_source_id))
        return [link for link in links if link.confidence >= min_confidence]

    # ----- helpers ----------------------------------------------------------

    def _iter_qmd_paths(
        self,
        *,
        fs: FsBoundary,
        sources: Optional[Iterable[str]] = None,
        workspace_id: Optional[str] = None,
    ) -> Iterable[Path]:
        target_sources = set(sources) if sources is not None else None
        # Use the FsBoundary's path-iteration method when available so
        # tests with in-memory filesystems can search without touching disk.
        list_paths = getattr(fs, "list_paths", None)
        if callable(list_paths):
            candidates: Iterable[Path] = list_paths(self._root, "*.md")
        elif self._root.exists():
            candidates = self._root.rglob("*.md")
        else:
            candidates = []
        for path in candidates:
            # Path shape: <root>/<source>/<workspace_id>/<source_id>.md
            try:
                rel = path.relative_to(self._root)
            except ValueError:
                continue
            parts = rel.parts
            if len(parts) < 3:
                continue
            source = parts[0]
            ws = parts[1]
            if target_sources is not None and source not in target_sources:
                continue
            if workspace_id is not None and ws != workspace_id:
                continue
            yield path

    @staticmethod
    def _split_frontmatter(content: str) -> tuple[dict, str]:
        if not content.startswith("---\n"):
            return {}, content
        end = content.find("\n---\n", 4)
        if end == -1:
            return {}, content
        front = content[4:end]
        body = content[end + 5 :]
        return _parse_simple_yaml(front), body

    @staticmethod
    def _tokens(text: str) -> list[str]:
        return [t for t in re.findall(r"\w+", text.lower()) if len(t) > 1]

    @staticmethod
    def _score(*, body: str, query_tokens: list[str]) -> float:
        if not query_tokens:
            return 0.0
        body_tokens = set(Recall._tokens(body))
        if not body_tokens:
            return 0.0
        overlap = sum(1 for t in query_tokens if t in body_tokens)
        return overlap / len(query_tokens)

    def _snippet(self, *, body: str) -> str:
        body = body.strip()
        if len(body) <= self._snippet_chars:
            return body
        return body[: self._snippet_chars].rstrip() + "…"


# ---------------------------------------------------------------------------
# YAML parser (minimal — frontmatter is projector-generated, so shape is stable)
# ---------------------------------------------------------------------------


def _parse_simple_yaml(front: str) -> dict:
    """Parse the small subset of YAML the projector writes.

    Supports `key: value` and `key: "quoted value"`. Multi-line scalars
    and nested maps are not produced by the projector.
    """
    out: dict = {}
    for line in front.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if value.startswith('"') and value.endswith('"'):
            value = bytes(value[1:-1], "utf-8").decode("unicode_escape")
        elif value == "null":
            value = None
        elif value == "true":
            value = True
        elif value == "false":
            value = False
        out[key] = value
    return out