"""Phase 130 / MSIQ-01/02/03: knowledge-repo labels.

Exercises:
  1. `_validate_knowledge_labels`: valid + invalid + default-open (no labels).
  2. Label-aware `search`: restricted docs filtered for agents, visible for admins.
  3. Label-aware `read_text`: restricted doc returns forbidden for agents.
  4. Ranking: authoritative first, expired last with `expired: true`.
  5. `flag_expired_unverified`: finds expired and unverified docs.
  6. Unlabeled docs: default-open in both search and read.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from knowledge_system.store import (  # noqa: E402
    KnowledgeStore,
    _validate_knowledge_labels,
)


# ---------------------------------------------------------------------------
# Fixtures + helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def solo_store(tmp_path, monkeypatch):
    """A KnowledgeStore in solo mode (no operator URL) backed by tmp_path."""
    monkeypatch.delenv("MEMROOS_APP_URL", raising=False)
    monkeypatch.delenv("MEMROOS_BASE_URL", raising=False)
    monkeypatch.delenv("MEMROOS_AGENT_API_KEY", raising=False)
    monkeypatch.delenv("MEMROOS_AGENT_ROLE", raising=False)
    root = tmp_path / "kb"
    root.mkdir()
    return KnowledgeStore(root)


def _seed(root: Path, relpath: str, body: str) -> None:
    target = root / relpath
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body, encoding="utf-8")


# ---------------------------------------------------------------------------
# 1. Frontmatter label validation
# ---------------------------------------------------------------------------


class TestValidateKnowledgeLabels:
    def test_no_frontmatter_is_valid(self):
        ok, err = _validate_knowledge_labels("just a body\n")
        assert ok is True
        assert err == ""

    def test_valid_labels_pass(self):
        body = (
            "---\n"
            "name: doc\n"
            "description: x\n"
            "sensitivity: internal\n"
            "authoritative: true\n"
            "verified_at: 2026-01-15\n"
            "expires_at: 2027-01-15\n"
            "---\n"
            "body\n"
        )
        ok, err = _validate_knowledge_labels(body)
        assert ok is True
        assert err == ""

    def test_invalid_sensitivity_rejected(self):
        body = "---\nsensitivity: top-secret\n---\nbody\n"
        ok, err = _validate_knowledge_labels(body)
        assert ok is False
        assert "sensitivity" in err
        assert "top-secret" in err

    def test_invalid_authoritative_rejected(self):
        body = "---\nauthoritative: maybe\n---\nbody\n"
        ok, err = _validate_knowledge_labels(body)
        assert ok is False
        assert "authoritative" in err

    def test_invalid_date_rejected(self):
        body = "---\nverified_at: yesterday\n---\nbody\n"
        ok, err = _validate_knowledge_labels(body)
        assert ok is False
        assert "verified_at" in err

    def test_full_iso_datetime_accepted(self):
        body = "---\nverified_at: 2026-01-15T00:00:00Z\n---\nbody\n"
        ok, _err = _validate_knowledge_labels(body)
        assert ok is True


# ---------------------------------------------------------------------------
# 2. Label-aware search
# ---------------------------------------------------------------------------


class TestLabelAwareSearch:
    def test_restricted_doc_filtered_for_agent(self, solo_store):
        root = solo_store.root
        _seed(
            root,
            "content/public.md",
            "---\nsensitivity: public\n---\nthe rain in spain\n",
        )
        _seed(
            root,
            "content/restricted.md",
            "---\nsensitivity: restricted\n---\nthe rain in spain\n",
        )

        results = solo_store.search("rain", agent_role="agent")
        paths = {r["path"] for r in results}
        assert "content/public.md" in paths
        assert "content/restricted.md" not in paths
        # Every returned row is authorized.
        for r in results:
            assert r["label_authorized"] is True

    def test_restricted_doc_visible_for_admin(self, solo_store):
        root = solo_store.root
        _seed(
            root,
            "content/restricted.md",
            "---\nsensitivity: restricted\n---\nrain\n",
        )
        results = solo_store.search("rain", agent_role="admin")
        paths = {r["path"] for r in results}
        assert "content/restricted.md" in paths

    def test_confidential_doc_filtered_for_agent_visible_for_reviewer(self, solo_store):
        root = solo_store.root
        _seed(
            root,
            "content/confidential.md",
            "---\nsensitivity: confidential\n---\nrain\n",
        )
        # Agent: hidden.
        agent_results = solo_store.search("rain", agent_role="agent")
        assert {r["path"] for r in agent_results} == set()
        # Reviewer: visible.
        rev_results = solo_store.search("rain", agent_role="reviewer")
        assert {r["path"] for r in rev_results} == {"content/confidential.md"}

    def test_unlabeled_doc_default_open(self, solo_store):
        root = solo_store.root
        _seed(root, "content/plain.md", "rain rain go away\n")
        results = solo_store.search("rain", agent_role="agent")
        paths = {r["path"] for r in results}
        assert "content/plain.md" in paths
        for r in results:
            # No labels => no `authoritative` flag, `unverified` may be set.
            assert r["label_authorized"] is True
            assert r.get("authoritative") is not True


# ---------------------------------------------------------------------------
# 3. Label-aware read
# ---------------------------------------------------------------------------


class TestLabelAwareRead:
    def test_restricted_doc_forbidden_for_agent(self, solo_store):
        root = solo_store.root
        _seed(
            root,
            "content/secret.md",
            "---\nsensitivity: restricted\n---\nSECRET BODY\n",
        )
        result = solo_store.read_text("content/secret.md", agent_role="agent")
        assert result["status"] == "forbidden"
        assert result["label_authorized"] is False
        # Body must NEVER appear in the response.
        assert "content" not in result or "SECRET BODY" not in result.get("content", "")

    def test_restricted_doc_visible_for_admin(self, solo_store):
        root = solo_store.root
        _seed(
            root,
            "content/secret.md",
            "---\nsensitivity: restricted\n---\nSECRET BODY\n",
        )
        result = solo_store.read_text("content/secret.md", agent_role="admin")
        assert result.get("label_authorized") is True
        assert "SECRET BODY" in result["content"]

    def test_confidential_doc_forbidden_for_agent_visible_for_reviewer(self, solo_store):
        root = solo_store.root
        _seed(
            root,
            "content/conf.md",
            "---\nsensitivity: confidential\n---\nC BODY\n",
        )
        agent_res = solo_store.read_text("content/conf.md", agent_role="agent")
        assert agent_res["status"] == "forbidden"
        rev_res = solo_store.read_text("content/conf.md", agent_role="reviewer")
        assert rev_res.get("label_authorized") is True
        assert "C BODY" in rev_res["content"]

    def test_unlabeled_doc_default_open(self, solo_store):
        root = solo_store.root
        _seed(root, "content/plain.md", "plain body\n")
        result = solo_store.read_text("content/plain.md", agent_role="agent")
        assert result.get("label_authorized") is True
        assert "plain body" in result["content"]


# ---------------------------------------------------------------------------
# 4. Ranking in search
# ---------------------------------------------------------------------------


class TestRanking:
    def test_authoritative_first_expired_last(self, solo_store, monkeypatch):
        """Stable sort puts authoritative rows at the top and expired at the end."""
        from datetime import datetime, timedelta, timezone

        # Freeze "today" so the expires_at math is deterministic.
        class FakeDT(datetime):
            @classmethod
            def now(cls, tz=None):  # type: ignore[override]
                return datetime(2026, 7, 7, tzinfo=timezone.utc)

        monkeypatch.setattr(
            "knowledge_system.store.datetime", FakeDT
        )

        root = solo_store.root
        _seed(
            root,
            "content/normal.md",
            "---\nsensitivity: internal\n---\nrain in here\n",
        )
        _seed(
            root,
            "content/auth.md",
            "---\nsensitivity: internal\nauthoritative: true\nverified_at: 2026-07-01\n---\nrain in auth\n",
        )
        _seed(
            root,
            "content/expired.md",
            "---\nsensitivity: internal\nexpires_at: 2026-01-01\nverified_at: 2025-12-01\n---\nrain in expired\n",
        )

        results = solo_store.search("rain", limit=10, agent_role="admin")
        paths = [r["path"] for r in results]
        # authoritative first; expired last; the plain one lands in the middle.
        assert paths[0] == "content/auth.md"
        assert paths[-1] == "content/expired.md"
        assert paths[-1].endswith("expired.md")
        # Verify the flag is set on the expired row.
        expired_row = next(r for r in results if r["path"] == "content/expired.md")
        assert expired_row.get("expired") is True
        # Verify authoritative flag is set on the auth row.
        auth_row = next(r for r in results if r["path"] == "content/auth.md")
        assert auth_row.get("authoritative") is True

    def test_unverified_does_not_demote(self, solo_store, monkeypatch):
        """A doc without verified_at gets unverified=true but is not demoted."""
        from datetime import datetime, timezone

        class FakeDT(datetime):
            @classmethod
            def now(cls, tz=None):  # type: ignore[override]
                return datetime(2026, 7, 7, tzinfo=timezone.utc)

        monkeypatch.setattr("knowledge_system.store.datetime", FakeDT)

        root = solo_store.root
        _seed(
            root,
            "content/a.md",
            "---\nsensitivity: internal\nverified_at: 2026-07-01\n---\nneedle here\n",
        )
        _seed(
            root,
            "content/b.md",
            "---\nsensitivity: internal\n---\nneedle here\n",
        )

        results = solo_store.search("needle", limit=10, agent_role="admin")
        b_row = next(r for r in results if r["path"] == "content/b.md")
        assert b_row.get("unverified") is True
        # And it's still ranked alongside the verified doc (not demoted).
        assert "content/b.md" in [r["path"] for r in results]


# ---------------------------------------------------------------------------
# 5. flag_expired_unverified
# ---------------------------------------------------------------------------


class TestFlagExpiredUnverified:
    def test_finds_expired_and_unverified(self, solo_store, monkeypatch):
        from datetime import datetime, timezone

        class FakeDT(datetime):
            @classmethod
            def now(cls, tz=None):  # type: ignore[override]
                return datetime(2026, 7, 7, tzinfo=timezone.utc)

        monkeypatch.setattr("knowledge_system.store.datetime", FakeDT)

        root = solo_store.root
        _seed(
            root,
            "content/expired.md",
            "---\nverified_at: 2024-01-01\nexpires_at: 2024-12-31\n---\nbody\n",
        )
        _seed(
            root,
            "content/unverified.md",
            "---\nsensitivity: internal\n---\nbody\n",
        )
        _seed(
            root,
            "content/fresh.md",
            "---\nverified_at: 2026-07-01\n---\nbody\n",
        )

        findings = solo_store.flag_expired_unverified()
        paths = {f["path"] for f in findings}
        assert "content/expired.md" in paths
        assert "content/unverified.md" in paths
        assert "content/fresh.md" not in paths

        expired = next(f for f in findings if f["path"] == "content/expired.md")
        assert expired["expired"] is True
        unverified = next(f for f in findings if f["path"] == "content/unverified.md")
        assert unverified["unverified"] is True
        # Expired entries come first (most urgent).
        assert findings[0]["path"] == "content/expired.md"

    def test_fresh_vault_is_empty(self, solo_store, monkeypatch):
        from datetime import datetime, timezone

        class FakeDT(datetime):
            @classmethod
            def now(cls, tz=None):  # type: ignore[override]
                return datetime(2026, 7, 7, tzinfo=timezone.utc)

        monkeypatch.setattr("knowledge_system.store.datetime", FakeDT)

        root = solo_store.root
        _seed(
            root,
            "content/fresh.md",
            "---\nverified_at: 2026-06-01\n---\nbody\n",
        )
        assert solo_store.flag_expired_unverified() == []

    def test_files_with_no_labels_are_excluded(self, solo_store, monkeypatch):
        """A doc with NO frontmatter at all is unlabeled -- not unverified."""
        from datetime import datetime, timezone

        class FakeDT(datetime):
            @classmethod
            def now(cls, tz=None):  # type: ignore[override]
                return datetime(2026, 7, 7, tzinfo=timezone.utc)

        monkeypatch.setattr("knowledge_system.store.datetime", FakeDT)

        root = solo_store.root
        _seed(root, "content/nolabels.md", "no frontmatter body\n")
        assert solo_store.flag_expired_unverified() == []