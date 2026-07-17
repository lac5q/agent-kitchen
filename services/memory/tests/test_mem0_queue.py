import importlib.util
import asyncio
import sqlite3
import sys
import types
from pathlib import Path

import httpx
import pytest


MEMORY_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MEMORY_DIR))

import mem0_queue  # noqa: E402
from provenance import format_memory_result, normalize_metadata, provenance_label  # noqa: E402


def queued_count(db_path: Path) -> int:
    with sqlite3.connect(db_path) as conn:
        return conn.execute("SELECT COUNT(*) FROM queued_requests").fetchone()[0]


def load_mem0_server(monkeypatch, module_name: str):
    fastapi = types.ModuleType("fastapi")

    class FastAPI:
        def __init__(self, *args, **kwargs):
            self.router = types.SimpleNamespace(lifespan_context=None)

        def exception_handler(self, *args, **kwargs):
            return lambda func: func

        def post(self, *args, **kwargs):
            return lambda func: func

        def get(self, *args, **kwargs):
            return lambda func: func

        def delete(self, *args, **kwargs):
            return lambda func: func

    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: str):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    def Query(default, **kwargs):
        return default

    fastapi.FastAPI = FastAPI
    fastapi.HTTPException = HTTPException
    fastapi.Query = Query
    fastapi.Request = object

    responses = types.ModuleType("fastapi.responses")

    class JSONResponse:
        def __init__(self, status_code: int, content: dict):
            self.status_code = status_code
            self.content = content

    responses.JSONResponse = JSONResponse

    monkeypatch.setitem(sys.modules, "fastapi", fastapi)
    monkeypatch.setitem(sys.modules, "fastapi.responses", responses)

    module_path = MEMORY_DIR / "mem0-server.py"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_retryable_response_detects_provider_and_backend_failures():
    assert mem0_queue.is_retryable_response(httpx.Response(429, text="quota exceeded"))
    assert mem0_queue.is_retryable_response(httpx.Response(503, text="service unavailable"))
    assert mem0_queue.is_retryable_response(
        httpx.Response(403, text="SERVICE_DISABLED for project 498437118126")
    )

    assert not mem0_queue.is_retryable_response(httpx.Response(400, text="bad request"))
    assert not mem0_queue.is_retryable_response(httpx.Response(403, text="forbidden"))


def test_provenance_metadata_defaults_and_preserves_source_fields():
    metadata = normalize_metadata(
        {
            "source_type": "email",
            "source_title": "Juan: Getting started with 1-1s",
            "source_path": "knowledge/emails/2026-05-11-juan.md",
        },
        agent_id="shared",
        default_source="mcp-mem0",
    )

    assert metadata["source"] == "mcp-mem0"
    assert metadata["source_type"] == "email"
    assert metadata["source_title"] == "Juan: Getting started with 1-1s"
    assert metadata["source_path"] == "knowledge/emails/2026-05-11-juan.md"
    assert metadata["saved_by_agent"] == "shared"
    assert metadata["ingested_at"].endswith("Z")


def test_memory_format_includes_provenance_for_consuming_agents():
    memory = {
        "memory": "Juan asked for 1:1s with Eric, Lior, and Sagi.",
        "score": 0.87,
        "metadata": {
            "source": "gmail",
            "source_type": "email",
            "source_title": "Getting started with 1-1s",
            "source_url": "https://mail.google.com/mail/u/0/#inbox/abc",
            "captured_at": "2026-05-11T21:25:00-04:00",
            "saved_by_agent": "shared",
        },
    }

    assert provenance_label(memory).startswith("source: email/gmail")
    formatted = format_memory_result(1, memory)
    assert "Juan asked for 1:1s" in formatted
    assert "relevance: 0.87" in formatted
    assert "title: Getting started with 1-1s" in formatted
    assert "url: https://mail.google.com/mail/u/0/#inbox/abc" in formatted


def test_queue_request_preserves_retryable_http_failures(monkeypatch, tmp_path):
    db_path = tmp_path / "queue.db"
    queue = mem0_queue.Mem0Queue(db_path=str(db_path), start_replay=False)
    payload = {"text": "Cordant email context", "agent_id": "shared"}

    monkeypatch.setattr(
        mem0_queue.httpx,
        "post",
        lambda *args, **kwargs: httpx.Response(429, text="RESOURCE_EXHAUSTED quota"),
    )

    assert queue.queue_request("/memory/add", "POST", payload) is True
    assert queued_count(db_path) == 1


def test_replay_request_uses_local_llm_timeout(monkeypatch, tmp_path):
    db_path = tmp_path / "queue.db"
    queue = mem0_queue.Mem0Queue(db_path=str(db_path), start_replay=False)
    seen = {}

    def fake_post(*args, **kwargs):
        seen["timeout"] = kwargs["timeout"]
        return httpx.Response(200, json={"status": "ok"})

    monkeypatch.setattr(mem0_queue.httpx, "post", fake_post)

    assert queue._replay_request(
        {"endpoint": "/memory/add", "method": "POST", "payload": '{"text":"slow local llm"}', "id": 1}
    )
    assert seen["timeout"] == mem0_queue.REPLAY_TIMEOUT_SECONDS


def test_queue_dedupes_identical_payloads(tmp_path):
    db_path = tmp_path / "queue.db"
    queue = mem0_queue.Mem0Queue(db_path=str(db_path), start_replay=False)
    payload = {"agent_id": "shared", "text": "same memory"}

    assert queue._add_to_queue("/memory/add", "POST", payload) is True
    assert queue._add_to_queue("/memory/add", "POST", dict(reversed(payload.items()))) is False
    assert queued_count(db_path) == 1


def test_mem0_server_queues_retryable_provider_exception(monkeypatch, tmp_path):
    module = load_mem0_server(monkeypatch, "mem0_server_under_test")

    class FailingMemory:
        def add(self, *args, **kwargs):
            raise RuntimeError("RESOURCE_EXHAUSTED: quota exceeded")

    class Request:
        headers = {}

    monkeypatch.setattr(module, "QUEUE_DB_PATH", tmp_path / "queue.db")
    monkeypatch.setattr(module, "_failure_file", tmp_path / "failures.log")
    monkeypatch.setattr(module, "get_memory", lambda: FailingMemory())

    response = module.add_memory(
        module.AddMemoryRequest(text="Juan sent the Cordant next steps", agent_id="shared"),
        Request(),
    )

    assert response.status == "queued"
    assert response.result["queued"] is True
    assert queued_count(tmp_path / "queue.db") == 1


def test_mem0_server_replay_header_does_not_duplicate_queue(monkeypatch, tmp_path):
    module = load_mem0_server(monkeypatch, "mem0_server_replay_under_test")

    class FailingMemory:
        def add(self, *args, **kwargs):
            raise RuntimeError("RESOURCE_EXHAUSTED: quota exceeded")

    class ReplayRequest:
        headers = {"x-mem0-queue-replay": "1"}

    monkeypatch.setattr(module, "QUEUE_DB_PATH", tmp_path / "queue.db")
    monkeypatch.setattr(module, "_failure_file", tmp_path / "failures.log")
    monkeypatch.setattr(module, "get_memory", lambda: FailingMemory())

    with pytest.raises(module.HTTPException):
        module.add_memory(
            module.AddMemoryRequest(text="queued memory", agent_id="shared"),
            ReplayRequest(),
        )

    assert not (tmp_path / "queue.db").exists()


def test_build_mem0_config_resolves_provider_env_values(monkeypatch):
    module = load_mem0_server(monkeypatch, "mem0_server_config_under_test")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://ollama.test:11434")

    config = module.build_mem0_config(
        {
            "vector_store": {
                "provider": "qdrant",
                "config": {"collection_name": "agent_memory_local"},
            },
            "llm": {
                "provider": "ollama",
                "config": {
                    "model": "qwen2.5:3b",
                    "ollama_base_url_env": "OLLAMA_BASE_URL",
                },
            },
            "embedder": {
                "provider": "ollama",
                "config": {
                    "model": "nomic-embed-text",
                    "embedding_dims": 768,
                    "ollama_base_url_env": "OLLAMA_BASE_URL",
                },
            },
            "custom_fact_extraction_prompt": "Return JSON with facts as flat strings only.",
        }
    )

    assert config["llm"]["config"]["ollama_base_url"] == "http://ollama.test:11434"
    assert config["embedder"]["config"]["ollama_base_url"] == "http://ollama.test:11434"
    assert "ollama_base_url_env" not in config["llm"]["config"]
    assert "ollama_base_url_env" not in config["embedder"]["config"]
    assert config["custom_fact_extraction_prompt"] == "Return JSON with facts as flat strings only."


def test_vector_store_metadata_serializes_nested_values(monkeypatch):
    module = load_mem0_server(monkeypatch, "mem0_server_metadata_under_test")

    metadata = module.vector_store_metadata(
        {
            "source": "unit",
            "pii": {
                "protected": True,
                "provider": "microsoft-presidio",
                "entity_types": ["PERSON"],
            },
        }
    )

    assert metadata["source"] == "unit"
    assert metadata["pii"] == (
        '{"entity_types":["PERSON"],"protected":true,"provider":"microsoft-presidio"}'
    )


def test_health_degrades_when_memory_queue_has_pending_saves(monkeypatch, tmp_path):
    module = load_mem0_server(monkeypatch, "mem0_server_health_under_test")

    monkeypatch.setattr(module, "QDRANT_AVAILABLE", False)
    monkeypatch.setattr(module, "QUEUE_DB_PATH", tmp_path / "queue.db")
    monkeypatch.setattr(module, "check_disk_space", lambda *args, **kwargs: {"critical": False})
    monkeypatch.setattr(module, "check_sqlite_db", lambda: {"status": "healthy"})
    monkeypatch.setattr(
        module,
        "load_config",
        lambda: {
            "vector_store": {
                "provider": "qdrant",
                "config": {"collection_name": "agent_memory_local"},
            }
        },
    )

    module._queue_failed_memory_add(
        module.AddMemoryRequest(text="queued but not visible", agent_id="shared")
    )

    health = module.health()

    assert health.status == "degraded"
    assert health.queue["queued"] == 1


def test_sqlite_health_defaults_to_queue_db(monkeypatch, tmp_path):
    module = load_mem0_server(monkeypatch, "mem0_server_sqlite_default_under_test")
    queue_db = tmp_path / "queue.db"
    monkeypatch.setattr(module, "QUEUE_DB_PATH", queue_db)

    module._queue_failed_memory_add(
        module.AddMemoryRequest(text="queued for sqlite health", agent_id="shared")
    )

    assert module.check_sqlite_db() == {
        "path": str(queue_db),
        "status": "healthy",
    }


def test_health_degrades_when_mem0_runtime_is_unavailable(monkeypatch, tmp_path):
    module = load_mem0_server(monkeypatch, "mem0_server_runtime_health_under_test")

    monkeypatch.setattr(module, "QDRANT_AVAILABLE", True)
    monkeypatch.setattr(module, "check_qdrant_vector_store", lambda _vector_cfg: "connected")
    monkeypatch.setattr(module, "QUEUE_DB_PATH", tmp_path / "queue.db")
    monkeypatch.setattr(module, "check_disk_space", lambda *args, **kwargs: {"critical": False})
    monkeypatch.setattr(module, "check_sqlite_db", lambda: {"status": "healthy"})
    monkeypatch.setattr(
        module,
        "check_mem0_runtime",
        lambda: {"status": "unavailable", "error": "No module named 'mem0'"},
    )
    monkeypatch.setattr(
        module,
        "load_config",
        lambda: {
            "vector_store": {
                "provider": "qdrant",
                "config": {"url": "http://qdrant.test", "collection_name": "agent_memory_local"},
            }
        },
    )

    health = module.health()

    assert health.status == "degraded"
    assert health.vector_store == "connected"
    assert health.memory_runtime["status"] == "unavailable"


def test_lifespan_starts_queue_replay_worker(monkeypatch):
    module = load_mem0_server(monkeypatch, "mem0_server_lifespan_under_test")
    created = []

    class FakeTask:
        def cancel(self):
            pass

        def __await__(self):
            async def done():
                return None

            return done().__await__()

    def fake_create_task(coro):
        created.append(coro.__name__)
        coro.close()
        return FakeTask()

    monkeypatch.setattr(module.asyncio, "create_task", fake_create_task)

    async def run_lifespan():
        async with module.lifespan(module.app):
            pass

    asyncio.run(run_lifespan())

    assert "_qdrant_health_checker" in created
    assert "_queue_replay_worker" in created
