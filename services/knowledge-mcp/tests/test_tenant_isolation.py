"""Phase 125 / ENTOPS-02/03: per-tenant vault isolation + central-audit bridge.

Behavior contract exercised here:

  1. SOLO MODE (no operator URL): behaviour is preserved exactly -- no
     _post_central_audit network call, local JSONL still written, no tenant
     directory layout imposed.
  2. OPERATOR MODE (MEMROOS_APP_URL + MEMROOS_AGENT_API_KEY): every
     write/read/delete/search on a tenant-bound store MUST POST to
     {MEMROOS_APP_URL}/api/audit/knowledge BEFORE returning.
  3. Cross-tenant isolation: a KnowledgeStore bound to tenant A cannot read,
     write, or even surface paths under tenant B's vault (fail-closed).
  4. Audit-POST failure fails the op (the knowledge op is short-circuited
     with a `audit_unavailable` result).
"""

import io
import json
import sys
import urllib.error
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from knowledge_system.store import (  # noqa: E402
    KnowledgeStore,
    _audit_log,
    _op_hash_for,
    _operator_mode,
    _post_central_audit,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_tenant(root: Path, tenant_id: str, files: dict[str, str]) -> Path:
    """Create tenants/<tenant_id> with the given files. Returns the subpath."""
    subdir = root / "tenants" / tenant_id
    subdir.mkdir(parents=True, exist_ok=True)
    for relpath, content in files.items():
        target = subdir / relpath
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    return subdir


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line]


# ---------------------------------------------------------------------------
# Solo mode guard (HARD RULE: today's behaviour MUST stay unchanged)
# ---------------------------------------------------------------------------


def test_solo_mode_preserved_when_no_operator_url(monkeypatch):
    """No MEMROOS_APP_URL + no MEMROOS_AGENT_API_KEY => _operator_mode is False.

    The store must keep using self.root as the on-disk root and NOT
    impose a tenants/ layout. The local JSONL audit mirror is still
    written (pre-Phase-125 behaviour).
    """
    monkeypatch.delenv("MEMROOS_APP_URL", raising=False)
    monkeypatch.delenv("MEMROOS_BASE_URL", raising=False)
    monkeypatch.delenv("MEMROOS_AGENT_API_KEY", raising=False)

    assert _operator_mode() is False

    with TemporaryDirectory() as tmp:
        root = Path(tmp)

        # No tenants/<id> layout in solo -- write at the raw root works.
        (root / "shared").mkdir()
        (root / "shared" / "COMPANY_FACTS.md").write_text("# facts")
        store = KnowledgeStore(root)
        # No tenant_id bound => effective_root == self.root
        assert store.effective_root() == root.resolve()
        assert store.tenant_root("doesnt-matter") == root.resolve()

        # No network POST in solo, even with a bound tenant_id.
        with mock.patch(
            "knowledge_system.store._post_central_audit",
            return_value={"status": "unavailable"},
        ) as post_mock:
            result = store.write_text(
                relative_path="solo-note.md",
                content="solo body",
                agent_id="solo-agent",
                role="agent",
                auto_commit=False,
                tenant_id="ignored-in-solo",
            )

        assert result["status"] == "ok"
        assert post_mock.call_count == 0
        assert (root / "solo-note.md").exists()


def test_solo_mode_unchanged_local_audit_mirror(monkeypatch, tmp_path):
    """Local JSONL audit mirror is written regardless of mode."""
    monkeypatch.delenv("MEMROOS_APP_URL", raising=False)
    monkeypatch.delenv("MEMROOS_BASE_URL", raising=False)
    monkeypatch.delenv("MEMROOS_AGENT_API_KEY", raising=False)

    # Redirect HOME so _audit_log writes into our tmp dir.
    monkeypatch.setenv("HOME", str(tmp_path))

    store = KnowledgeStore(tmp_path / "kb")
    (tmp_path / "kb").mkdir()
    res = store.write_text(
        relative_path="notes/today.md",
        content="hello",
        agent_id="solo-agent",
        role="agent",
        auto_commit=False,
    )
    assert res["status"] == "ok"

    audit_file = tmp_path / ".memroos" / "audit" / "knowledge-writes.jsonl"
    entries = _read_jsonl(audit_file)
    writes = [e for e in entries if e["operation"] == "write"]
    assert writes, "local JSONL audit mirror must be written"
    last = writes[-1]
    assert last["path"] == "notes/today.md"
    assert last["agent_id"] == "solo-agent"
    assert last["tenant_id"] == "default-tenant"
    assert last["op_hash"].startswith("sha256:")


# ---------------------------------------------------------------------------
# Operator-mode tenant isolation
# ---------------------------------------------------------------------------


def test_operator_mode_resolves_tenant_subdirectory(monkeypatch, tmp_path):
    monkeypatch.setenv("MEMROOS_APP_URL", "https://ops.example.com")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")

    root = tmp_path / "shared-root"
    root.mkdir()
    _seed_tenant(root, "acme", {"a.md": "acme content"})
    _seed_tenant(root, "globex", {"g.md": "globex content"})

    acme = KnowledgeStore(root, tenant_id="acme")
    globex = KnowledgeStore(root, tenant_id="globex")

    assert acme.effective_root() == (root / "tenants" / "acme").resolve()
    assert globex.effective_root() == (root / "tenants" / "globex").resolve()
    assert acme.effective_root() != globex.effective_root()


def test_cross_tenant_read_fails_closed(monkeypatch, tmp_path):
    """Tenant A cannot read tenant B's vault (fail-closed)."""
    monkeypatch.setenv("MEMROOS_APP_URL", "https://ops.example.com")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")

    root = tmp_path / "shared-root"
    root.mkdir()
    _seed_tenant(root, "acme", {"notes/a.md": "acme secret"})
    _seed_tenant(root, "globex", {"notes/g.md": "globex public"})

    # Acme tries to read a globex file -- relative path starts with "notes/"
    # but it lives under tenants/globex/notes/g.md, so _validate_path
    # resolves it under acme's effective root, then `notes/notes/g.md`
    # does not exist OR we try to read it within acme's vault.
    acme = KnowledgeStore(root, tenant_id="acme")

    # Sanity: acme can read its own file (mock operator audit POST OK).
    with mock.patch("knowledge_system.store.urlopen", return_value=_ok_post_response()):
        own = acme.read_text(
            "notes/a.md",
            tenant_id="acme",
            user_id="u-acme",
            agent_id="a",
        )
    assert "content" in own and own["content"] == "acme secret"

    # Cross-tenant attempt: a path that would only live under globex's
    # vault. The validation guard rejects it outright before any disk
    # read -- ValueError is the fail-closed behaviour.
    with mock.patch("knowledge_system.store.urlopen", return_value=_ok_post_response()):
        with pytest.raises(ValueError):
            acme.read_text(
                "../../globex/notes/g.md",  # traversal -- defence-in-depth
                tenant_id="acme",
                user_id="u-acme",
                agent_id="a",
            )

    # Also confirm _validate_path rejects plain traversal outright.
    with pytest.raises(ValueError):
        acme._validate_path("../escape.md")


def test_cross_tenant_write_fails_closed(monkeypatch, tmp_path):
    monkeypatch.setenv("MEMROOS_APP_URL", "https://ops.example.com")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")

    root = tmp_path / "shared-root"
    root.mkdir()
    _seed_tenant(root, "acme", {})
    _seed_tenant(root, "globex", {"existing/g.md": "globex"})

    acme = KnowledgeStore(root, tenant_id="acme")
    # Acme tries to overwrite a globex file via path traversal.
    with pytest.raises(ValueError):
        acme._validate_path("../globex/existing/g.md")

    # Even a flat traversal to anywhere outside the tenant vault fails.
    with pytest.raises(ValueError):
        acme._validate_path("../../../etc/passwd")


def test_operator_mode_no_bound_tenant_fails_closed(monkeypatch, tmp_path):
    """Operator mode + no bound tenant MUST fail closed on every data op.

    Regression for the fail-OPEN gap: without this guard, effective_root()
    falls back to the unscoped shared root, leaking it to a caller who did
    not resolve a tenant (e.g. MEMROOS_TENANT_ID unset, no tool arg).
    """
    monkeypatch.setenv("MEMROOS_APP_URL", "https://ops.example.com")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")

    root = tmp_path / "shared-root"
    root.mkdir()
    # Seed a file at the unscoped shared root -- this must NOT be reachable.
    (root / "shared").mkdir()
    (root / "shared" / "SECRET.md").write_text("shared secret", encoding="utf-8")

    # No tenant bound in operator mode.
    store = KnowledgeStore(root)
    assert store.bound_tenant_id() is None
    assert store._operator_scope_ok() is False

    # read: raises (does not return shared content)
    with pytest.raises(PermissionError):
        store.read_text("shared/SECRET.md", agent_id="a")

    # write: forbidden dict, no file written
    write_result = store.write_text(
        relative_path="shared/notes.md",
        content="should not persist",
        agent_id="a",
        role="agent",
        auto_commit=False,
    )
    assert write_result["status"] == "forbidden"

    # delete: forbidden dict
    delete_result = store.delete_file("shared/SECRET.md", agent_id="a", role="admin")
    assert delete_result["status"] == "forbidden"

    # search: single forbidden element, no shared results leaked
    search_result = store.search("secret", agent_id="a")
    assert search_result and search_result[0]["status"] == "forbidden"


# ---------------------------------------------------------------------------
# Central-audit POST bridge
# ---------------------------------------------------------------------------


def _ok_post_response():
    resp = mock.Mock()
    resp.read.return_value = b'{"ok":true,"id":"x","entryHash":"sha256:abc","tenantId":"acme"}'
    resp.status = 201
    resp.getcode.return_value = 201
    # context-manager protocol
    resp.__enter__ = lambda self_: self_
    resp.__exit__ = lambda self_, *exc: False
    return resp


def test_operator_mode_posts_central_audit_before_return(monkeypatch, tmp_path):
    monkeypatch.setenv("MEMROOS_APP_URL", "https://ops.example.com")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")

    root = tmp_path / "kb"
    root.mkdir()
    (root / "tenants" / "acme").mkdir(parents=True)

    store = KnowledgeStore(root, tenant_id="acme")

    # Patch the urllib bridge used by _post_central_audit.
    with mock.patch("knowledge_system.store.urlopen", return_value=_ok_post_response()) as urlopen_mock:
        result = store.write_text(
            relative_path="hello.md",
            content="hi",
            agent_id="agent-1",
            role="agent",
            auto_commit=False,
            tenant_id="acme",
            user_id="user-1",
        )

    assert result["status"] == "ok"
    assert urlopen_mock.call_count == 1
    sent = urlopen_mock.call_args.args[0]
    # verify headers + URL + body
    assert sent.get_full_url() == "https://ops.example.com/api/audit/knowledge"
    assert sent.get_header("Authorization") == "Bearer agent-key"
    body = json.loads(sent.data.decode("utf-8"))
    assert body["tenant_id"] == "acme"
    assert body["user_id"] == "user-1"
    assert body["agent_id"] == "agent-1"
    assert body["operation"] == "write"
    assert body["path"] == "hello.md"
    assert body["op_hash"].startswith("sha256:")


def test_operator_mode_audit_failure_blocks_op(monkeypatch, tmp_path):
    """If the central-audit POST fails, the knowledge op is short-circuited."""
    monkeypatch.setenv("MEMROOS_APP_URL", "https://ops.example.com")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")

    root = tmp_path / "kb"
    root.mkdir()
    (root / "tenants" / "acme").mkdir(parents=True)

    store = KnowledgeStore(root, tenant_id="acme")

    fake_error = urllib.error.URLError("simulated network failure")
    with mock.patch("knowledge_system.store.urlopen", side_effect=fake_error):
        result = store.write_text(
            relative_path="hello.md",
            content="should not be written",
            agent_id="agent-1",
            role="agent",
            auto_commit=False,
            tenant_id="acme",
            user_id="user-1",
        )

    assert result["status"] == "audit_unavailable"
    assert result["operation"] == "write"
    assert result["path"] == "hello.md"
    # And the file must NOT have been created (fail-closed).
    assert not (root / "tenants" / "acme" / "hello.md").exists()


def test_operator_mode_read_audit_failure_blocks_read(monkeypatch, tmp_path):
    """read_text must also fail-closed in operator mode."""
    monkeypatch.setenv("MEMROOS_APP_URL", "https://ops.example.com")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")

    root = tmp_path / "kb"
    _seed_tenant(root, "acme", {"notes/a.md": "secret"})

    store = KnowledgeStore(root, tenant_id="acme")

    # First mock a successful write to avoid complexity -- we only care about read.
    fake_error = urllib.error.URLError("simulated")
    with mock.patch("knowledge_system.store.urlopen", side_effect=fake_error):
        result = store.read_text(
            "notes/a.md",
            tenant_id="acme",
            user_id="user-1",
            agent_id="agent-1",
        )

    assert result["status"] == "audit_unavailable"


# ---------------------------------------------------------------------------
# Solo unchanged when env vars absent even with tenant_id kwarg
# ---------------------------------------------------------------------------


def test_solo_mode_ignores_bound_tenant_id(monkeypatch, tmp_path):
    """In solo, a tenant_id kwarg must not relayout the vault."""
    monkeypatch.delenv("MEMROOS_APP_URL", raising=False)
    monkeypatch.delenv("MEMROOS_BASE_URL", raising=False)
    monkeypatch.delenv("MEMROOS_AGENT_API_KEY", raising=False)

    root = tmp_path / "kb"
    root.mkdir()
    (root / "shared").mkdir()
    (root / "shared" / "FACTS.md").write_text("# facts")

    store = KnowledgeStore(root, tenant_id="ignored-in-solo")
    assert store.effective_root() == root.resolve()

    result = store.write_text(
        relative_path="shared/notes.md",
        content="# ok",
        agent_id="solo-agent",
        role="agent",
        auto_commit=False,
        tenant_id="ignored-in-solo",
        user_id="ignored",
    )
    # In solo mode the write should succeed exactly as today -- and no
    # tenants/ directory should have been created on disk.
    assert result["status"] == "ok"
    assert (root / "shared" / "notes.md").exists()
    assert not (root / "tenants").exists()


# ---------------------------------------------------------------------------
# Hash chain primitives exposed for the JS side mirror
# ---------------------------------------------------------------------------


def test_op_hash_does_not_include_content(monkeypatch):
    """Phase 125 hard rule: the audit hash must be path-only, never content."""
    h1 = _op_hash_for("write", "shared/x.md")
    h2 = _op_hash_for("read", "shared/x.md")
    # Same path different op => different hash
    assert h1 != h2
    assert h1.startswith("sha256:")
    assert _op_hash_for("write", "shared/x.md") == h1  # deterministic


def test_post_central_audit_uses_bearer(monkeypatch):
    monkeypatch.setenv("MEMROOS_APP_URL", "https://ops.example.com")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "secret-key")

    fake_response = mock.Mock()
    fake_response.read.return_value = b'{"ok":true}'
    fake_response.status = 201
    fake_response.getcode.return_value = 201
    fake_response.__enter__ = lambda s: s
    fake_response.__exit__ = lambda s, *exc: False

    with mock.patch("knowledge_system.store.urlopen", return_value=fake_response) as urlopen_mock:
        result = _post_central_audit(
            tenant_id="t1",
            user_id="u1",
            agent_id="a1",
            operation="write",
            relative_path="x.md",
            op_hash="sha256:abc",
        )

    assert result["status"] == "ok"
    assert result["http_status"] == 201
    sent = urlopen_mock.call_args.args[0]
    assert sent.get_header("Authorization") == "Bearer secret-key"
    assert sent.get_full_url() == "https://ops.example.com/api/audit/knowledge"


def test_post_central_audit_handles_urlerror(monkeypatch):
    monkeypatch.setenv("MEMROOS_APP_URL", "https://ops.example.com")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "k")

    with mock.patch(
        "knowledge_system.store.urlopen",
        side_effect=urllib.error.URLError("nope"),
    ):
        result = _post_central_audit(
            tenant_id="t1",
            user_id="u1",
            agent_id="a1",
            operation="read",
            relative_path="x.md",
            op_hash="sha256:abc",
        )

    assert result["status"] == "unavailable"
    assert result["http_status"] is None
    assert "nope" in result["error"]
