"""Filesystem-backed knowledge store utilities.

The store is intentionally boring: Markdown in, Markdown out. It gives MCP tools
and CLI commands one safe interface for listing, reading, and searching the
knowledge root without hardcoding a private machine path.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

DEFAULT_EXCLUDE_DIRS = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
}


@dataclass(frozen=True)
class SearchResult:
    path: str
    line: int
    preview: str


class KnowledgeStore:
    """Read-only helper over a markdown knowledge root."""

    def __init__(self, root: str | Path):
        self.root = Path(root).expanduser().resolve()

    def _is_safe_child(self, path: Path) -> bool:
        try:
            path.resolve().relative_to(self.root)
            return True
        except ValueError:
            return False

    def iter_markdown(self, include_wiki: bool = True) -> Iterable[Path]:
        """Yield markdown files under root, excluding hidden/build directories."""
        if not self.root.exists():
            return
        for path in sorted(self.root.rglob("*.md")):
            if any(part in DEFAULT_EXCLUDE_DIRS for part in path.parts):
                continue
            if not include_wiki and "wiki" in path.relative_to(self.root).parts:
                continue
            yield path

    def read_text(self, relative_path: str, max_chars: int = 20000) -> dict:
        """Read a file by repo-relative path with path traversal protection."""
        path = (self.root / relative_path).resolve()
        if not self._is_safe_child(path):
            raise ValueError("path must stay inside knowledge root")
        if not path.exists() or not path.is_file():
            raise FileNotFoundError(relative_path)
        text = path.read_text(errors="replace")
        return {
            "path": path.relative_to(self.root).as_posix(),
            "content": text[:max_chars],
            "truncated": len(text) > max_chars,
        }

    def search(self, query: str, limit: int = 20) -> list[dict]:
        """Simple deterministic text search over markdown files."""
        needle = query.lower().strip()
        if not needle:
            return []
        results: list[SearchResult] = []
        for path in self.iter_markdown(include_wiki=True):
            try:
                lines = path.read_text(errors="replace").splitlines()
            except OSError:
                continue
            rel = path.relative_to(self.root).as_posix()
            for idx, line in enumerate(lines, start=1):
                if needle in line.lower():
                    results.append(SearchResult(rel, idx, line.strip()[:240]))
                    if len(results) >= limit:
                        return [r.__dict__ for r in results]
        return [r.__dict__ for r in results]

    def manifest(self) -> dict:
        """Return a compact JSON-safe manifest for agents."""
        known_files = [p.relative_to(self.root).as_posix() for p in self.iter_markdown()]
        return {
            "root": str(self.root),
            "known_files": known_files[:500],
            "file_count": len(known_files),
            "wiki_present": (self.root / "wiki").exists() or (self.root / "llm-wiki" / "wiki").exists(),
        }
