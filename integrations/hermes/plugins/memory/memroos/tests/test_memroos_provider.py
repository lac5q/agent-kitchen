"""Unit tests for MemRoOS Hermes dual-mode memory provider (observe).

These tests do not require a running Hermes agent or MemRoOS server.
They import the provider module directly and stub HTTP.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

PLUGIN_INIT = (
    Path(__file__).resolve().parents[1] / "__init__.py"
)


def _load_plugin_module():
    """Load plugin without requiring hermes `agent` package on PYTHONPATH."""
    # Provide a minimal MemoryProvider ABC stub if hermes isn't importable.
    if "agent.memory_provider" not in sys.modules:
        agent_pkg = SimpleNamespace()
        mem_mod = SimpleNamespace()

        class MemoryProvider:  # noqa: D401 — test stub
            """Minimal ABC stand-in."""

            pass

        mem_mod.MemoryProvider = MemoryProvider
        sys.modules["agent"] = agent_pkg
        sys.modules["agent.memory_provider"] = mem_mod

    spec = importlib.util.spec_from_file_location(
        "memroos_hermes_memory_plugin_under_test",
        PLUGIN_INIT,
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def plugin(tmp_path, monkeypatch):
    mod = _load_plugin_module()
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.delenv("MEMROOS_AGENT_API_KEY", raising=False)
    monkeypatch.delenv("MEMROOS_OPERATOR_API_KEY", raising=False)
    monkeypatch.setenv("MEMROOS_HERMES_DRY_RUN", "1")
    (tmp_path / "memroos-memory.json").write_text(
        json.dumps(
            {
                "mode": "observe",
                "operator_url": "http://127.0.0.1:3000",
                "rewrite_local": False,
                "agent_id": "hermes-test",
                "user_id": "luis",
            }
        ),
        encoding="utf-8",
    )
    provider = mod.MemroosMemoryProvider()
    provider.initialize("sess-1", hermes_home=str(tmp_path), agent_context="primary")
    return mod, provider, tmp_path


def test_default_config_forces_rewrite_local_false(plugin):
    mod, provider, tmp_path = plugin
    cfg = mod.load_memroos_config(tmp_path)
    assert cfg["rewrite_local"] is False
    assert cfg["mode"] == "observe"


def test_observe_memory_write_records_receipt_without_http(plugin):
    _mod, provider, tmp_path = plugin
    provider.on_memory_write("add", "memory", "User prefers dual-mode memory testing")
    receipts = tmp_path / "memroos-memory" / "observe-receipts.jsonl"
    assert receipts.is_file()
    lines = [json.loads(l) for l in receipts.read_text(encoding="utf-8").splitlines() if l.strip()]
    assert len(lines) == 1
    assert lines[0]["action"] == "add"
    assert lines[0]["rewrite_local"] is False
    assert lines[0]["error"] == "dry_run_or_missing_credentials"
    assert provider._mirror_count == 1


def test_ingest_failure_is_fail_open(plugin, monkeypatch):
    mod, provider, tmp_path = plugin
    monkeypatch.delenv("MEMROOS_HERMES_DRY_RUN", raising=False)
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "test-key")

    def boom(**kwargs):
        raise RuntimeError("operator down")

    monkeypatch.setattr(mod, "post_native_memory_ingest", boom)
    # Must not raise — Hermes write already happened.
    provider.on_memory_write("add", "memory", "fact about dual mode")
    assert provider._last_ingest_ok is False
    assert "operator down" in (provider._last_error or "")
    receipts = (tmp_path / "memroos-memory" / "observe-receipts.jsonl").read_text(
        encoding="utf-8"
    )
    assert "operator down" in receipts


def test_successful_ingest_records_budget(plugin, monkeypatch):
    mod, provider, tmp_path = plugin
    monkeypatch.delenv("MEMROOS_HERMES_DRY_RUN", raising=False)
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "test-key")

    def ok(**kwargs):
        assert kwargs["body"]["source"] == "hermes"
        assert "MEMORY.md" in kwargs["body"]["memoryPath"]
        return {"budgetStatus": "ok", "alerts": [], "replay": kwargs["body"]["content"]}

    monkeypatch.setattr(mod, "post_native_memory_ingest", ok)
    provider.on_memory_write("add", "memory", "mirrored fact")
    assert provider._last_ingest_ok is True
    line = (tmp_path / "memroos-memory" / "observe-receipts.jsonl").read_text(
        encoding="utf-8"
    ).strip().splitlines()[-1]
    receipt = json.loads(line)
    assert receipt["ingest_ok"] is True
    assert receipt["budget_status"] == "ok"


def test_status_tool_reports_dual_mode(plugin):
    _mod, provider, _tmp = plugin
    payload = json.loads(provider.handle_tool_call("memroos_memory_status", {}))
    assert payload["provider"] == "memroos"
    assert payload["builtin_memory"] == "always_on"
    assert payload["rewrite_local"] is False


def test_save_config_never_enables_rewrite(plugin, tmp_path):
    mod, _provider, home = plugin
    mod.MemroosMemoryProvider().save_config(
        {"mode": "governed", "operator_url": "http://example.test", "rewrite_local": True},
        str(home),
    )
    cfg = json.loads((home / "memroos-memory.json").read_text(encoding="utf-8"))
    assert cfg["rewrite_local"] is False
    assert cfg["mode"] == "governed"


def test_plugin_source_never_writes_memory_md():
    text = PLUGIN_INIT.read_text(encoding="utf-8")
    assert "MEMORY.md#" in text  # path label for ingest only
    # Must not open/write MEMORY.md as a filesystem target.
    assert "open(\"MEMORY.md\"" not in text
    assert "open('MEMORY.md'" not in text
    assert "/ MEMORY.md" not in text.replace("MEMORY.md#", "")
    assert 'Path("MEMORY.md")' not in text
    assert "memories/MEMORY.md" not in text
