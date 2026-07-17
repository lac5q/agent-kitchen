"""Phase 155 — Mem0 hang immunity: /livez, cached Qdrant health, no self-HTTP checker."""

from __future__ import annotations

import inspect
from pathlib import Path

import pytest

from test_mem0_queue import load_mem0_server, MEMORY_DIR


def test_livez_returns_ok_without_touching_qdrant(monkeypatch, tmp_path):
    module = load_mem0_server(monkeypatch, "mem0_server_livez_under_test")

    called = {"qdrant": 0, "disk": 0}

    def boom_qdrant(_cfg):
        called["qdrant"] += 1
        raise AssertionError("livez must not probe Qdrant")

    def boom_disk(_path="~"):
        called["disk"] += 1
        raise AssertionError("livez must not check disk")

    monkeypatch.setattr(module, "check_qdrant_vector_store", boom_qdrant)
    monkeypatch.setattr(module, "check_disk_space", boom_disk)

    result = module.livez()
    assert result["status"] == "ok"
    assert called["qdrant"] == 0
    assert called["disk"] == 0


def test_health_uses_cached_qdrant_status(monkeypatch, tmp_path):
    module = load_mem0_server(monkeypatch, "mem0_server_health_cache_under_test")

    calls = {"n": 0}

    def fake_qdrant(_cfg):
        calls["n"] += 1
        return "connected"

    monkeypatch.setattr(module, "QDRANT_AVAILABLE", True)
    monkeypatch.setattr(module, "QUEUE_DB_PATH", tmp_path / "queue.db")
    monkeypatch.setattr(module, "check_qdrant_vector_store", fake_qdrant)
    monkeypatch.setattr(module, "check_disk_space", lambda *args, **kwargs: {"critical": False})
    monkeypatch.setattr(module, "check_sqlite_db", lambda: {"status": "healthy"})
    monkeypatch.setattr(module, "check_mem0_runtime", lambda: {"status": "available"})
    monkeypatch.setattr(
        module,
        "load_config",
        lambda: {
            "vector_store": {
                "provider": "qdrant",
                "config": {"url": "https://example.invalid", "collection_name": "agent_memory"},
            }
        },
    )
    module._qdrant_probe_ok = None
    module._qdrant_probe_last = 0
    module._QDRANT_PROBE_INTERVAL = 60

    first = module.health()
    second = module.health()
    assert first.vector_store == "connected"
    assert second.vector_store == "connected"
    assert calls["n"] == 1  # second /health served from cache


def test_qdrant_health_checker_source_has_no_self_http():
    source = (MEMORY_DIR / "mem0-server.py").read_text(encoding="utf-8")
    start = source.index("async def _qdrant_health_checker")
    end = source.index("async def _queue_replay_worker")
    body = source[start:end]
    assert 'client.get("http://localhost:3201/health")' not in body
    assert 'client.post("http://localhost:3201/memory/reset")' not in body
    assert "cached_qdrant_vector_status" in body
    assert "reset_memory" in body
    assert "asyncio.to_thread" in body


def test_qdrant_health_checker_is_async_and_uses_to_thread(monkeypatch, tmp_path):
    module = load_mem0_server(monkeypatch, "mem0_server_checker_under_test")
    assert inspect.iscoroutinefunction(module._qdrant_health_checker)
    source = inspect.getsource(module._qdrant_health_checker)
    assert "asyncio.to_thread" in source
    assert 'http://localhost:3201' not in source
