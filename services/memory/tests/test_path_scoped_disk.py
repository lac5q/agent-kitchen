"""Phase 156 — path-scoped disk must not treat home df% alone as vector failure."""

from __future__ import annotations

from test_mem0_queue import load_mem0_server


def test_check_mem0_disk_space_is_path_scoped(monkeypatch, tmp_path):
    module = load_mem0_server(monkeypatch, "mem0_server_disk_scope_under_test")

    module.QUEUE_DB_PATH = tmp_path / "queue.db"
    module.LOG_DIR = tmp_path / "logs"
    module.LOG_DIR.mkdir()
    (tmp_path / "queue.db").write_text("")

    calls: list[str] = []

    def fake_check(path="~"):
        calls.append(path)
        # Simulate home critical while Mem0 paths are fine.
        if path == "~":
            return {
                "path": "/home/fake",
                "percent_used": 99.0,
                "free_gb": 0.5,
                "critical": True,
                "warning": True,
            }
        return {
            "path": path,
            "percent_used": 40.0,
            "free_gb": 50.0,
            "critical": False,
            "warning": False,
        }

    monkeypatch.setattr(module, "check_disk_space", fake_check)
    result = module.check_mem0_disk_space()
    assert result["critical"] is False
    assert result["home_advisory"]["critical"] is True
    assert any("queue" in str(p) or str(tmp_path) in str(p) for p in [e.get("path") for e in result["paths"]])
    assert "~" in calls


def test_health_home_critical_alone_keeps_vector_connected(monkeypatch, tmp_path):
    module = load_mem0_server(monkeypatch, "mem0_server_disk_health_under_test")

    monkeypatch.setattr(module, "QDRANT_AVAILABLE", True)
    monkeypatch.setattr(module, "QUEUE_DB_PATH", tmp_path / "queue.db")
    monkeypatch.setattr(module, "LOG_DIR", tmp_path / "logs")
    (tmp_path / "logs").mkdir()
    monkeypatch.setattr(module, "check_qdrant_vector_store", lambda _cfg: "connected")
    monkeypatch.setattr(module, "check_sqlite_db", lambda: {"status": "healthy"})
    monkeypatch.setattr(module, "check_mem0_runtime", lambda: {"status": "available"})
    monkeypatch.setattr(
        module,
        "load_config",
        lambda: {"vector_store": {"provider": "qdrant", "config": {"url": "https://example.invalid"}}},
    )
    module._qdrant_probe_ok = None
    module._qdrant_probe_last = 0

    def fake_check(path="~"):
        if path == "~":
            return {"path": "/home/fake", "percent_used": 99.0, "critical": True, "warning": True, "free_gb": 0.1}
        return {"path": path, "percent_used": 10.0, "critical": False, "warning": False, "free_gb": 80.0}

    monkeypatch.setattr(module, "check_disk_space", fake_check)

    health = module.health()
    assert health.vector_store == "connected"
    assert health.disk["critical"] is False
    assert health.disk["home_advisory"]["critical"] is True
    assert health.status == "ok"
