"""CONNMEM-06 — Projector tests."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest import TestCase, main

from services.connmem.canonical_envelope import CanonicalRecord
from services.connmem.projections import (
    FsBoundary,
    Projector,
    RealFsBoundary,
    claims_path,
    edges_path,
    qmd_path,
)


class MemFs(FsBoundary):
    """In-memory filesystem for tests — no disk writes."""

    def __init__(self) -> None:
        self._files: dict[Path, str] = {}

    def write_text(self, *, path: Path, content: str) -> None:
        self._files[path] = content

    def read_text(self, *, path: Path) -> str:
        if path not in self._files:
            raise FileNotFoundError(str(path))
        return self._files[path]

    def exists(self, *, path: Path) -> bool:
        return path in self._files

    def append_text(self, *, path: Path, content: str) -> None:
        self._files[path] = self._files.get(path, "") + content

    # Path-rglob support: track every path that was ever written so
    # `Path.rglob` (used by the recall module) can find them without
    # touching the real filesystem.
    def list_paths(self, root: Path, pattern: str) -> list[Path]:
        suffix = pattern.lstrip("*")
        out: list[Path] = []
        for path in self._files:
            if not str(path).endswith(suffix):
                continue
            try:
                rel = path.relative_to(root)
            except ValueError:
                continue
            if len(rel.parts) >= 3:
                out.append(path)
        return out


def make_record(
    *,
    source: str = "linear",
    workspace_id: str = "team-001",
    source_id: str = "issue-1",
    parents: tuple[str, ...] = (),
    owners: tuple[str, ...] = (),
    object_type: str = "issue",
) -> CanonicalRecord:
    return CanonicalRecord(
        source=source,
        workspace_id=workspace_id,
        object_type=object_type,
        source_id=source_id,
        source_url=f"https://example.com/{source}/{source_id}",
        created_at="2026-01-15T10:00:00Z",
        updated_at="2026-01-15T11:00:00Z",
        deleted_at=None,
        content_hash=(
            "0" * 64
        ),  # canonical envelope requires 64-char lowercase hex sha256
        parent_ids=parents,
        participants=("u-1",),
        owners=owners,
        visibility="team",
        sensitivity="sensitive",
        captured_at="2026-01-15T11:00:01Z",
        schema_version="connmem/canonical-envelope/v1",
    )


class QmdPathTests(TestCase):
    def test_qmd_path_is_deterministic(self) -> None:
        a = qmd_path(root=Path("/x"), source="linear", workspace_id="team-001", source_id="i-1")
        b = qmd_path(root=Path("/x"), source="linear", workspace_id="team-001", source_id="i-1")
        self.assertEqual(a, b)
        self.assertEqual(str(a), "/x/linear/team-001/i-1.md")

    def test_edges_path_per_source(self) -> None:
        self.assertEqual(
            str(edges_path(root=Path("/x"), source="circleback")),
            "/x/circleback/_edges.jsonl",
        )
        self.assertEqual(
            str(claims_path(root=Path("/x"), source="linear")),
            "/x/linear/_claims.jsonl",
        )


class ProjectorWriteTests(TestCase):
    def _setup(self) -> tuple[Projector, MemFs]:
        fs = MemFs()
        proj = Projector(root=Path("/mem"), fs=fs)
        return proj, fs

    def test_writes_qmd_with_frontmatter(self) -> None:
        proj, fs = self._setup()
        record = make_record()
        result = proj.project(record)
        self.assertTrue(result.qmd_written)
        body = fs.read_text(
            path=qmd_path(
                root=Path("/mem"),
                source="linear",
                workspace_id="team-001",
                source_id="issue-1",
            )
        )
        self.assertTrue(body.startswith("---\n"))
        self.assertIn("source: linear", body)
        self.assertIn("object_type: issue", body)
        self.assertIn("source_id: issue-1", body)
        self.assertIn("# issue: issue-1", body)

    def test_writes_edges_for_parents_and_owners(self) -> None:
        proj, fs = self._setup()
        record = make_record(parents=("issue-parent",), owners=("u-1", "u-2"))
        result = proj.project(record)
        self.assertEqual(len(result.edges_written), 3)
        body = fs.read_text(path=edges_path(root=Path("/mem"), source="linear"))
        lines = [json.loads(line) for line in body.splitlines() if line]
        predicates = sorted(e["predicate"] for e in lines)
        self.assertEqual(predicates, ["child_of", "owned_by", "owned_by"])

    def test_writes_claims_with_provenance(self) -> None:
        proj, fs = self._setup()
        record = make_record(parents=("issue-parent",), owners=("u-1",))
        result = proj.project(record)
        self.assertEqual(len(result.claims_written), 2)  # 1 owned_by + 1 child_of
        claims = proj.read_claims(source="linear")
        # All claims have full provenance per the spec.
        for c in claims:
            self.assertIn("claim_id", c)
            self.assertEqual(c["source"], "linear")
            self.assertEqual(c["source_id"], "issue-1")
            self.assertEqual(c["extraction_version"], "connmem/claim-extraction/v1")
            self.assertIn("observed_at", c)
            self.assertIn("quote", c)

    def test_re_project_supersedes_prior_claims(self) -> None:
        proj, fs = self._setup()
        # First projection with content_hash_a.
        proj.project(make_record(owners=("u-1",)) if False else self._record_with_hash("a" * 64, owners=("u-1",)))
        # Second projection with the same source_id but content_hash_b.
        record2 = self._record_with_hash("b" * 64, owners=("u-1",))
        result2 = proj.project(record2)
        self.assertEqual(len(result2.claim_superseded), 1)
        claims = proj.read_claims(source="linear")
        # Original claim now has superseded_by=<hash_b>.
        superseded = [c for c in claims if c.get("superseded_by") == "b" * 64]
        self.assertEqual(len(superseded), 1)
        # And a new claim with hash_b exists.
        active = [
            c
            for c in claims
            if c.get("content_hash") == "b" * 64 and not c.get("superseded_by")
        ]
        self.assertEqual(len(active), 1)

    def _record_with_hash(
        self, content_hash: str, *, owners: tuple[str, ...] = ()
    ) -> CanonicalRecord:
        return CanonicalRecord(
            source="linear",
            workspace_id="team-001",
            object_type="issue",
            source_id="issue-1",
            source_url="https://example.com/linear/issue-1",
            created_at="2026-01-15T10:00:00Z",
            updated_at="2026-01-15T11:00:00Z",
            deleted_at=None,
            content_hash=content_hash,
            parent_ids=(),
            participants=("u-1",),
            owners=owners,
            visibility="team",
            sensitivity="sensitive",
            captured_at="2026-01-15T11:00:01Z",
            schema_version="connmem/canonical-envelope/v1",
        )

    def test_re_project_idempotent_for_same_content_hash(self) -> None:
        proj, _ = self._setup()
        record = make_record()
        proj.project(record)
        # Read claims once.
        first = proj.read_claims(source="linear")
        # Re-project with identical record.
        proj.project(record)
        second = proj.read_claims(source="linear")
        self.assertEqual(len(first), len(second))

    def test_qmd_overwrite_is_idempotent(self) -> None:
        proj, fs = self._setup()
        record = make_record()
        proj.project(record)
        first = fs.read_text(
            path=qmd_path(
                root=Path("/mem"),
                source="linear",
                workspace_id="team-001",
                source_id="issue-1",
            )
        )
        proj.project(record)
        second = fs.read_text(
            path=qmd_path(
                root=Path("/mem"),
                source="linear",
                workspace_id="team-001",
                source_id="issue-1",
            )
        )
        self.assertEqual(first, second)

    def test_frontmatter_yaml_scalars_are_escaped(self) -> None:
        proj, fs = self._setup()
        record = make_record(source_id="issue: weird")
        proj.project(record)
        body = fs.read_text(
            path=qmd_path(
                root=Path("/mem"),
                source="linear",
                workspace_id="team-001",
                source_id="issue: weird",
            )
        )
        # Source id containing ":" should be quoted in YAML.
        self.assertIn('source_id: "issue: weird"', body)


class ProjectorWithRealFsTests(TestCase):
    def test_real_filesystem_round_trip(self) -> None:
        tmp = Path(tempfile.mkdtemp(prefix="connmem-proj-test-"))
        try:
            proj = Projector(root=tmp, fs=RealFsBoundary())
            proj.project(make_record(owners=("u-1",)))
            # QMD + edges + claims files all on disk.
            self.assertTrue(
                (tmp / "linear" / "team-001" / "issue-1.md").exists()
            )
            self.assertTrue((tmp / "linear" / "_edges.jsonl").exists())
            self.assertTrue((tmp / "linear" / "_claims.jsonl").exists())
        finally:
            import shutil

            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()