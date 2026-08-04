#!/usr/bin/env python3
"""Behavior tests for the public-safe hybrid knowledge system."""

import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from knowledge_system.capabilities import CORE_TOOLS, get_capabilities, open_workspace
from knowledge_system.compiler import compile_wiki, discover_sources, slugify
from knowledge_system.store import KnowledgeStore
from knowledge_system import mcp_server, tool_attention


def test_slugify_is_public_safe_and_stable():
    assert slugify("Client X: Q2 Strategy / Timeline") == "client-x-q2-strategy-timeline"


def test_discover_sources_ignores_generated_and_hidden_dirs():
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "sources").mkdir()
        (root / "sources" / "meeting.md").write_text("# Meeting\nTimeline is 8 weeks.")
        (root / "wiki").mkdir()
        (root / "wiki" / "generated.md").write_text("# Generated")
        (root / "llm-wiki" / "wiki").mkdir(parents=True)
        (root / "llm-wiki" / "wiki" / "generated.md").write_text("# Generated")
        (root / "llm-wiki" / "raw").mkdir(parents=True)
        (root / "llm-wiki" / "raw" / "raw-note.md").write_text("# Raw Note\nKeep this source.")
        (root / ".git").mkdir()
        (root / ".git" / "secret.md").write_text("do not read")

        resolved_root = root.resolve()
        found = [p.relative_to(resolved_root).as_posix() for p in discover_sources(root, ["sources/*.md", "llm-wiki/**/*.md"])]

        assert found == ["llm-wiki/raw/raw-note.md", "sources/meeting.md"]


def test_compile_wiki_builds_sourced_index_log_and_topic_page():
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        source_dir = root / "sources"
        source_dir.mkdir()
        (source_dir / "meeting.md").write_text(
            "# Client Timeline Meeting\n\n"
            "Engineering said delivery is 12 weeks. Sales promised 8 weeks.\n"
            "The team discussed Mem0, Qdrant, OpenBrain, and Karpathy wiki architecture.\n"
            "Decision: keep source data authoritative and use the wiki as a compiled view.\n"
            "Action item: reconcile timeline before proposal.\n"
        )

        result = compile_wiki(root=root, source_globs=["sources/*.md"])

        assert result["sources_processed"] == 1
        assert result["pages_written"] >= 1
        index = (root / "wiki" / "index.md").read_text()
        log = (root / "wiki" / "log.md").read_text()
        topic_pages = list((root / "wiki" / "topics").glob("*.md"))
        source_pages = list((root / "wiki" / "sources").glob("*.md"))
        decision_pages = list((root / "wiki" / "decisions").glob("*.md"))

        assert "client-timeline-meeting" in index
        assert "compile" in log
        assert topic_pages, "expected at least one topic page"
        assert source_pages, "expected at least one source page"
        assert decision_pages, "expected at least one decision/action page"
        assert (root / "wiki" / "topic-map.md").exists()
        assert (root / "wiki" / "concepts" / "agent-memory-architecture.md").exists()
        assert (root / "wiki" / "entities" / "mem0.md").exists()
        graph = json.loads((root / "wiki" / "graph" / "knowledge-graph.json").read_text())
        assert any(edge["relation"] == "derived_from" for edge in graph["edges"])
        assert any(edge["relation"] == "mentions_entity" for edge in graph["edges"])
        assert (root / "wiki" / "dashboard" / "manifest.json").exists()
        page = topic_pages[0].read_text()
        assert "sources/meeting.md" in page
        assert "Contradictions / Tensions" in page
        assert "12 weeks" in page
        assert "8 weeks" in page


def test_knowledge_store_search_reads_source_and_wiki_files():
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "sources").mkdir()
        (root / "sources" / "note.md").write_text("Important agent memory architecture note")
        (root / "wiki" / "topics").mkdir(parents=True)
        (root / "wiki" / "topics" / "memory.md").write_text("Compiled memory architecture")

        store = KnowledgeStore(root)
        results = store.search("architecture", limit=10)

        paths = {r["path"] for r in results}
        assert "sources/note.md" in paths
        assert "wiki/topics/memory.md" in paths


def test_knowledge_store_manifest_is_json_safe():
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "wiki").mkdir()
        (root / "wiki" / "index.md").write_text("# Index")

        manifest = KnowledgeStore(root).manifest()
        json.dumps(manifest)

        assert manifest["root"] == str(root.resolve())
        assert "wiki/index.md" in manifest["known_files"]


def test_chatgpt_search_returns_connector_result_shape(monkeypatch):
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "sources").mkdir()
        (root / "sources" / "note.md").write_text("# Agent Memory\n\nImportant agent memory architecture note")
        monkeypatch.setenv("KNOWLEDGE_ROOT", str(root))
        monkeypatch.setenv("MEMROOS_MCP_PUBLIC_BASE_URL", "https://memroos.example.test")

        payload = mcp_server.search("architecture")

        assert list(payload) == ["results"]
        assert payload["results"] == [
            {
                "id": "sources/note.md#L3",
                "title": "Agent Memory",
                "url": "https://memroos.example.test/knowledge/sources/note.md#L3",
            }
        ]


def test_chatgpt_fetch_returns_connector_document_shape(monkeypatch):
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "sources").mkdir()
        (root / "sources" / "note.md").write_text("# Agent Memory\n\nImportant agent memory architecture note")
        monkeypatch.setenv("KNOWLEDGE_ROOT", str(root))
        monkeypatch.setenv("MEMROOS_MCP_PUBLIC_BASE_URL", "https://memroos.example.test")

        payload = mcp_server.fetch("sources/note.md#L3")

        assert payload == {
            "id": "sources/note.md#L3",
            "title": "Agent Memory",
            "text": "# Agent Memory\n\nImportant agent memory architecture note",
            "url": "https://memroos.example.test/knowledge/sources/note.md#L3",
            "metadata": {
                "path": "sources/note.md",
                "source": "memroos",
                "truncated": False,
            },
        }


def test_agent_memory_save_posts_to_memroos_app_with_agent_key(monkeypatch):
    calls = []

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"ok": True, "tier": "vector"}

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return Response()

    monkeypatch.setenv("MEMROOS_APP_URL", "http://memroos.test")
    monkeypatch.setenv("MEMROOS_AGENT_ID", "multica-vega")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")
    monkeypatch.setattr(mcp_server.httpx, "post", fake_post)

    payload = mcp_server.agent_memory_save(
        "Vega learned the Multica bridge should use MemroOS for recall.",
        type="vector",
        metadata={"source_type": "multica", "multica_issue_id": "MUL-18"},
    )

    assert payload == {"status": "ok", "response": {"ok": True, "tier": "vector"}}
    assert calls[0][0] == "http://memroos.test/api/memory/add"
    assert calls[0][1]["headers"]["Authorization"] == "Bearer agent-key"
    body = calls[0][1]["json"]
    assert body["agentId"] == "multica-vega"
    assert body["content"] == "Vega learned the Multica bridge should use MemroOS for recall."
    assert body["text"] == body["content"]
    assert body["type"] == "vector"
    assert body["metadata"]["source_type"] == "multica"
    assert body["metadata"]["saved_by_agent"] == "multica-vega"


def test_agent_memory_save_requires_agent_key(monkeypatch):
    monkeypatch.delenv("MEMROOS_AGENT_API_KEY", raising=False)

    payload = mcp_server.agent_memory_save("no key")

    assert payload["status"] == "missing_agent_key"
    assert "MEMROOS_AGENT_API_KEY" in payload["error"]


def test_memory_save_routes_through_governed_memroos_app(monkeypatch):
    calls = []

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"ok": True, "result": {"status": "bronze_captured"}}

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return Response()

    monkeypatch.setenv("MEMROOS_APP_URL", "http://memroos.test")
    monkeypatch.setenv("MEMROOS_AGENT_ID", "governed-agent")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")
    monkeypatch.setattr(mcp_server.httpx, "post", fake_post)

    payload = mcp_server.memory_save("The deploy outcome was green.", agent_id="governed-agent")

    assert payload == {"status": "ok", "response": {"ok": True, "result": {"status": "bronze_captured"}}}
    assert calls[0][0] == "http://memroos.test/api/memory/add"
    assert calls[0][1]["headers"]["Authorization"] == "Bearer agent-key"
    assert calls[0][1]["json"]["agentId"] == "governed-agent"


def test_memory_search_routes_through_governed_prior_work_trace(monkeypatch):
    calls = []

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"ok": True, "items": [{"id": "agent_memory_candidates:one"}]}

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return Response()

    monkeypatch.setenv("MEMROOS_APP_URL", "http://memroos.test")
    monkeypatch.setenv("MEMROOS_AGENT_ID", "governed-agent")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")
    monkeypatch.setattr(mcp_server.httpx, "post", fake_post)

    payload = mcp_server.memory_search("green deploy", agent_id="governed-agent", limit=3)

    assert payload["status"] == "ok"
    assert payload["results"] == [{"id": "agent_memory_candidates:one"}]
    assert calls[0][0] == "http://memroos.test/api/memory/prior-work"
    assert calls[0][1]["json"]["task"] == "green deploy"


def test_memory_prior_work_posts_bounded_probe_payload_and_exposes_trigger_contract(monkeypatch):
    calls = []

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"ok": True, "decision": "search_skipped", "items": []}

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return Response()

    monkeypatch.setenv("MEMROOS_APP_URL", "http://memroos.test")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")
    monkeypatch.setattr(mcp_server.httpx, "post", fake_post)

    payload = mcp_server.memory_prior_work(
        task="Have we done this before?",
        repo="lac5q/memroos",
        project="memroos",
        entities=["prior-work"],
        timing="before_plan",
    )

    assert payload == {"status": "ok", "response": {"ok": True, "decision": "search_skipped", "items": []}}
    assert calls[0][0] == "http://memroos.test/api/memory/prior-work"
    assert calls[0][1]["headers"]["Authorization"] == "Bearer agent-key"
    assert calls[0][1]["json"] == {
        "task": "Have we done this before?",
        "repo": "lac5q/memroos",
        "project": "memroos",
        "entities": ["prior-work"],
        "timing": "before_plan",
    }

    contract = mcp_server.build_mcp_tool_contract()
    entry = next(tool for tool in contract["tools"] if tool["name"] == "memory_prior_work")
    assert "start of any task" in entry["description"]
    assert "topic shifts" in entry["description"]
    assert "have we done this before?" in entry["description"]
    assert "not content" in entry["description"]


def test_memory_tool_descriptions_and_orientation_carry_habit_contract():
    contract = mcp_server.build_mcp_tool_contract()
    descriptions = {
        tool["name"]: tool["description"]
        for tool in contract["tools"]
        if tool["name"] in {"memory_prior_work", "memory_recall", "memory_search", "memory_save", "agent_memory_save"}
    }

    assert set(descriptions) == {
        "memory_prior_work",
        "memory_recall",
        "memory_search",
        "memory_save",
        "agent_memory_save",
    }
    for description in descriptions.values():
        assert "memory_prior_work" in description
        assert "task start" in description
        assert "governed" in description
        assert "typed skip receipt" in description

    orientation = mcp_server.knowledge_system_orientation()
    assert "memory_prior_work" in orientation
    assert "task start" in orientation
    assert "governed memory save" in orientation
    assert "typed skip receipt" in orientation
    assert "Skills > Memory" in orientation


def test_agent_context_packet_uses_topic_without_goal_id(monkeypatch):
    calls = []

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"ok": True, "packet": {"memories": []}}

    def fake_get(url, **kwargs):
        calls.append((url, kwargs))
        return Response()

    monkeypatch.setenv("MEMROOS_APP_URL", "http://memroos.test")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")
    monkeypatch.setattr(mcp_server.httpx, "get", fake_get)

    payload = mcp_server.agent_context_packet(topic="prior work on onboarding")

    assert payload == {"status": "ok", "response": {"ok": True, "packet": {"memories": []}}}
    assert calls[0][0] == "http://memroos.test/api/agent-context"
    assert calls[0][1]["headers"]["Authorization"] == "Bearer agent-key"
    assert calls[0][1]["params"] == {"topic": "prior work on onboarding"}


def test_agent_context_send_posts_to_memroos_and_waits_for_reply(monkeypatch):
    calls = []

    class PostResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"ok": True, "message": {"id": "acm-1", "threadId": "thread-1"}}

    class GetResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"ok": True, "reply": {"id": "acm-2", "parentId": "acm-1"}, "timedOut": False}

    def fake_post(url, **kwargs):
        calls.append(("post", url, kwargs))
        return PostResponse()

    def fake_get(url, **kwargs):
        calls.append(("get", url, kwargs))
        return GetResponse()

    monkeypatch.setenv("MEMROOS_APP_URL", "http://memroos.test")
    monkeypatch.setenv("MEMROOS_AGENT_ID", "agent-alpha")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")
    monkeypatch.setattr(mcp_server.httpx, "post", fake_post)
    monkeypatch.setattr(mcp_server.httpx, "get", fake_get)

    payload = mcp_server.agent_context_send(
        to_agent="agent-beta",
        body="Please sync context.",
        message_type="request",
        reply_required=True,
        wait_for_reply_ms=250,
    )

    assert payload["status"] == "ok"
    assert payload["reply"]["response"]["reply"]["id"] == "acm-2"
    assert calls[0][0] == "post"
    assert calls[0][1] == "http://memroos.test/api/agent-context/messages"
    body = calls[0][2]["json"]
    assert body["agentId"] == "agent-alpha"
    assert body["fromAgent"] == "agent-alpha"
    assert body["toAgent"] == "agent-beta"
    assert body["messageType"] == "request"
    assert body["replyRequired"] is True
    assert calls[1][0] == "get"
    assert calls[1][1] == "http://memroos.test/api/agent-context/messages/acm-1"
    assert calls[1][2]["params"]["wait_for"] == "reply"


def test_agent_context_inbox_reply_and_ack_use_agent_key(monkeypatch):
    calls = []

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"ok": True}

    def fake_get(url, **kwargs):
        calls.append(("get", url, kwargs))
        return Response()

    def fake_post(url, **kwargs):
        calls.append(("post", url, kwargs))
        return Response()

    monkeypatch.setenv("MEMROOS_APP_URL", "http://memroos.test/")
    monkeypatch.setenv("MEMROOS_AGENT_ID", "agent-beta")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")
    monkeypatch.setattr(mcp_server.httpx, "get", fake_get)
    monkeypatch.setattr(mcp_server.httpx, "post", fake_post)

    assert mcp_server.agent_context_inbox(status="pending")["status"] == "ok"
    assert mcp_server.agent_context_reply("acm-1", "Done")["status"] == "ok"
    assert mcp_server.agent_context_ack("acm-1")["status"] == "ok"

    assert calls[0][0] == "get"
    assert calls[0][1] == "http://memroos.test/api/agent-context/messages"
    assert calls[0][2]["params"]["agent"] == "agent-beta"
    assert calls[1][1] == "http://memroos.test/api/agent-context/messages/acm-1/reply"
    assert calls[1][2]["json"]["fromAgent"] == "agent-beta"
    assert calls[2][1] == "http://memroos.test/api/agent-context/messages/acm-1/ack"
    assert calls[2][2]["headers"]["Authorization"] == "Bearer agent-key"


def test_agent_tool_outcome_record_posts_to_memroos_app(monkeypatch):
    calls = []

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"ok": True}

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return Response()

    monkeypatch.setenv("MEMROOS_APP_URL", "http://memroos.test/")
    monkeypatch.setenv("MEMROOS_AGENT_ID", "multica-vega")
    monkeypatch.setenv("MEMROOS_AGENT_API_KEY", "agent-key")
    monkeypatch.setattr(mcp_server.httpx, "post", fake_post)

    payload = mcp_server.agent_tool_outcome_record(
        tool_id="memroos",
        task="Multica issue MUL-18",
        outcome="helped",
        metadata={"multica_task_id": "task-123"},
    )

    assert payload == {"status": "ok", "response": {"ok": True}}
    assert calls[0][0] == "http://memroos.test/api/tool-attention/record"
    body = calls[0][1]["json"]
    assert body["agentId"] == "multica-vega"
    assert body["toolId"] == "memroos"
    assert body["task"] == "Multica issue MUL-18"
    assert body["outcome"] == "helped"
    assert body["metadata"]["multica_task_id"] == "task-123"


def test_core_tools_stay_small_for_progressive_disclosure():
    assert CORE_TOOLS == [
        "knowledge_health",
        "knowledge_manifest",
        "knowledge_search",
        "knowledge_read",
        "memory_recall",
        "memory_prior_work",
        "memory_search",
        "memory_save",
        "agent_memory_save",
        "agent_context_packet",
    ]


def test_mcp_transport_env_supports_stdio_and_remote_http(monkeypatch):
    monkeypatch.delenv("MEMROOS_MCP_TRANSPORT", raising=False)
    assert mcp_server._server_transport() == "stdio"

    monkeypatch.setenv("MEMROOS_MCP_TRANSPORT", "http")
    assert mcp_server._server_transport() == "streamable-http"

    monkeypatch.setenv("MEMROOS_MCP_TRANSPORT", "streamable_http")
    assert mcp_server._server_transport() == "streamable-http"

    monkeypatch.setenv("MEMROOS_MCP_TRANSPORT", "sse")
    assert mcp_server._server_transport() == "sse"


def test_mcp_server_options_are_env_configurable(monkeypatch):
    monkeypatch.setenv("MEMROOS_MCP_HOST", "0.0.0.0")
    monkeypatch.setenv("MEMROOS_MCP_PORT", "8765")
    monkeypatch.setenv("MEMROOS_MCP_STREAMABLE_HTTP_PATH", "/mcp")
    monkeypatch.setenv("MEMROOS_MCP_STATELESS_HTTP", "true")

    assert mcp_server._server_options() == {
        "host": "0.0.0.0",
        "port": 8765,
        "streamable_http_path": "/mcp",
        "sse_path": "/sse",
        "message_path": "/messages/",
        "stateless_http": True,
    }


def test_mcp_auth_provider_is_disabled_without_token(monkeypatch):
    monkeypatch.delenv("MEMROOS_MCP_BEARER_TOKEN", raising=False)
    assert mcp_server._auth_provider() is None


def test_mcp_auth_provider_accepts_only_configured_bearer_token(monkeypatch):
    monkeypatch.setenv("MEMROOS_MCP_BEARER_TOKEN", "secret-token")
    if mcp_server.DebugTokenVerifier is None:
        with pytest.raises(RuntimeError, match="requires FastMCP auth support"):
            mcp_server._auth_provider()
        return

    provider = mcp_server._auth_provider()

    assert provider is not None
    assert provider.validate("secret-token")
    assert not provider.validate("wrong-token")


def test_mcp_tool_contract_exports_registered_tool_schemas():
    contract = mcp_server.mcp_tool_contract()
    tools = contract["tools"]
    by_name = {tool["name"]: tool for tool in tools}

    assert contract["id"] == mcp_server.MCP_TOOL_CONTRACT_ID
    assert contract["server"] == "knowledge-system"
    assert set(by_name) == {tool.__name__ for tool in mcp_server._MCP_TOOL_REGISTRY}
    json.dumps(contract)

    for tool in tools:
        assert tool["description"]
        assert tool["inputSchema"]["type"] == "object"
        assert "properties" in tool["inputSchema"]
        assert "outputSchema" in tool

    search_schema = by_name["knowledge_search"]["inputSchema"]
    assert search_schema["required"] == ["query"]
    assert search_schema["properties"]["query"]["type"] == "string"
    assert search_schema["properties"]["limit"]["type"] == "integer"
    assert search_schema["properties"]["limit"]["default"] == 20

    context_schema = by_name["agent_context_send"]["inputSchema"]
    assert context_schema["required"] == ["to_agent", "body"]
    assert context_schema["properties"]["reply_required"]["type"] == "boolean"
    assert context_schema["properties"]["context_refs"]["nullable"] is True

    assert mcp_server._mcp_tool_contract_resource_payload() == contract


def test_capability_registry_hides_deep_tools_until_requested():
    core = get_capabilities()
    assert core["mode"] == "core"
    assert "wiki_compile" not in core["tools"]
    assert "vector_search" not in core["tools"]

    wiki = get_capabilities("wiki")
    assert wiki["mode"] == "workspace"
    assert "wiki_compile" in wiki["tools"]
    assert "wiki_lint" in wiki["tools"]

    ingestion = get_capabilities("ingestion")
    assert ingestion["mode"] == "workspace"
    assert "recipe_catalog" in ingestion["tools"]
    assert "knowledge://recipes/catalog" in ingestion["resources"]

    tool_workspace = get_capabilities("tool-attention")
    assert tool_workspace["mode"] == "workspace"
    assert "tool_discover" in tool_workspace["tools"]


def test_vector_workspace_routes_search_to_qmd_json(monkeypatch):
    calls = []

    class Completed:
        returncode = 0
        stdout = json.dumps([{"file": "qmd://memroos/README.md", "score": 0.9}])
        stderr = ""

    def fake_run(command, **kwargs):
        calls.append((command, kwargs))
        return Completed()

    monkeypatch.setenv("QMD_BIN", "/opt/homebrew/bin/qmd")
    monkeypatch.delenv("QMD_FORCE_CPU", raising=False)
    monkeypatch.setattr(mcp_server.subprocess, "run", fake_run)

    result = mcp_server.knowledge_workspace_call(
        "vector",
        "search",
        {"query": "agent memory", "collection": "memroos", "limit": 3},
    )

    assert result["status"] == "ok"
    assert result["data"] == [{"file": "qmd://memroos/README.md", "score": 0.9}]
    assert calls[0][0] == [
        "/opt/homebrew/bin/qmd",
        "search",
        "agent memory",
        "-n",
        "3",
        "--json",
        "-c",
        "memroos",
    ]
    assert calls[0][1]["env"]["QMD_FORCE_CPU"] == "1"


def test_vector_workspace_rejects_missing_query():
    result = mcp_server.knowledge_workspace_call("vector", "search", {"query": ""})

    assert result == {"status": "error", "error": "query is required"}


def test_open_brain_catalog_doc_tracks_imports_workflows_skills_and_integrations():
    catalog = (Path(__file__).resolve().parents[1] / "docs" / "OPEN_BRAIN_RECIPES_CATALOG.md").read_text()
    assert "ChatGPT Import" in catalog
    assert "Obsidian Vault Import" in catalog
    assert "Auto-Capture Protocol" in catalog
    assert "World Model Readiness Diagnostic" in catalog
    assert "Discord Capture" in catalog
    assert "Content Fingerprint Dedup" in catalog


def test_open_workspace_returns_instructions_and_no_secret_config():
    opened = open_workspace("admin")
    json.dumps(opened)

    assert opened["workspace"] == "admin"
    assert "admin" in opened["description"].lower()
    assert "tools" in opened
    assert "api_key" not in json.dumps(opened).lower()


def test_tool_attention_catalog_discovers_and_records_outcomes(monkeypatch):
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "logs").mkdir()
        (root / ".mcp.json").write_text(json.dumps({"mcpServers": {"gitnexus": {"command": "gitnexus"}}}))
        catalog_path = root / "tool-catalog.json"
        catalog_path.write_text(
            json.dumps(
                {
                    "sources": [{"id": "example", "label": "Example", "type": "test", "status": "available"}],
                    "capabilities": [
                        {
                            "id": "external:router",
                            "name": "Router",
                            "type": "framework-pattern",
                            "source": "example",
                            "description": "Routes tool choices",
                            "status": "candidate",
                            "tags": ["router"],
                            "useWhen": ["Need routing"],
                            "topLevel": False,
                            "loadCommand": "test",
                        }
                    ],
                }
            )
        )
        monkeypatch.setenv("MEMROOS_ROOT", str(root))
        monkeypatch.setenv("TOOL_ATTENTION_CATALOG", str(catalog_path))
        monkeypatch.setenv("TOOL_ATTENTION_OUTCOMES", str(root / "logs" / "outcomes.jsonl"))
        monkeypatch.setenv("SKILLS_PATH", str(root / "missing-skills"))

        catalog = tool_attention.build_catalog()
        ids = {item["id"] for item in catalog["capabilities"]}
        assert "mcp-server:gitnexus" in ids
        assert "knowledge-workspace:tool-attention" in ids
        assert "external:router" in ids
        catalog_payload = json.dumps(catalog)
        assert str(root) not in catalog_payload
        assert "catalogPath" not in catalog["health"]
        assert "outcomesPath" not in catalog["health"]
        assert catalog["health"]["catalog"] == "available"
        assert catalog["sources"][0]["path"] == ".mcp.json"

        discovered = tool_attention.discover("router", limit=5)
        assert discovered["capabilities"][0]["id"] == "external:router"
        assert str(root) not in json.dumps(discovered)

        result = tool_attention.record_outcome("external:router", "test task", "helped")
        assert result["status"] == "ok"
        assert str(root) not in json.dumps(result)
        stats = tool_attention.stats()
        assert stats["summary"]["recentOutcomes"] == 1
        assert stats["outcomesByTool"]["external:router"]["successes"] == 1
        assert "test task" not in json.dumps(stats)

        rediscovered = tool_attention.discover("router", limit=5)
        assert rediscovered["capabilities"][0]["outcomeSummary"]["score"] == 2


def test_tool_attention_top_level_mcp_tools(monkeypatch):
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "logs").mkdir()
        (root / ".mcp.json").write_text(json.dumps({"mcpServers": {"gitnexus": {"command": "gitnexus"}}}))
        monkeypatch.setenv("MEMROOS_ROOT", str(root))
        monkeypatch.setenv("TOOL_ATTENTION_CATALOG", str(root / "missing-catalog.json"))
        monkeypatch.setenv("TOOL_ATTENTION_OUTCOMES", str(root / "logs" / "outcomes.jsonl"))
        monkeypatch.setenv("SKILLS_PATH", str(root / "missing-skills"))

        catalog = mcp_server.tool_catalog()
        assert catalog["status"] == "ok"
        assert "mcp-server:gitnexus" in {item["id"] for item in catalog["capabilities"]}

        discovered = mcp_server.tool_discover("gitnexus", limit=3)
        assert discovered["capabilities"][0]["id"] == "mcp-server:gitnexus"

        loaded = mcp_server.tool_load("mcp-server:gitnexus")
        assert loaded["status"] == "ok"
        assert loaded["capability"]["name"] == "gitnexus"

        recorded = mcp_server.tool_record_outcome("mcp-server:gitnexus", "code graph task", "helped")
        assert recorded["status"] == "ok"
        stats = mcp_server.tool_stats()
        assert stats["summary"]["recentOutcomes"] == 1
        assert stats["outcomesByTool"]["mcp-server:gitnexus"]["score"] == 2
        assert str(root) not in json.dumps(recorded)


def test_tool_attention_optional_agent_lightning(monkeypatch):
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "logs").mkdir()
        (root / ".mcp.json").write_text(json.dumps({"mcpServers": {"gitnexus": {"command": "gitnexus"}}}))
        monkeypatch.setenv("MEMROOS_ROOT", str(root))
        monkeypatch.setenv("TOOL_ATTENTION_CATALOG", str(root / "missing-catalog.json"))
        monkeypatch.setenv("TOOL_ATTENTION_OUTCOMES", str(root / "logs" / "outcomes.jsonl"))
        monkeypatch.setenv("SKILLS_PATH", str(root / "missing-skills"))
        monkeypatch.setenv("MEMROOS_OPTIONAL_CAPABILITIES", "gitnexus,agent-lightning")

        discovered = mcp_server.tool_discover("agent lightning APO skill proposals", limit=5)
        assert "capability:agent-lightning" in {item["id"] for item in discovered["capabilities"]}
        agent_lightning = next(item for item in discovered["capabilities"] if item["id"] == "capability:agent-lightning")
        assert agent_lightning["status"] in {"available", "degraded", "missing"}

        catalog = mcp_server.tool_catalog()
        gitnexus = next(item for item in catalog["capabilities"] if item["id"] == "mcp-server:gitnexus")
        assert gitnexus["status"] in {"available", "degraded", "missing"}


# ---------------------------------------------------------------------------
# OPSGW-03: Dedicated coverage for each top-level Knowledge MCP gateway tool
# ---------------------------------------------------------------------------

def _setup_minimal_root(tmp: Path, monkeypatch) -> Path:
    """Write a minimal env so tool_attention functions work in isolation."""
    (tmp / ".mcp.json").write_text(json.dumps({"mcpServers": {"test-server": {"command": "test"}}}))
    monkeypatch.setenv("MEMROOS_ROOT", str(tmp))
    monkeypatch.setenv("TOOL_ATTENTION_CATALOG", str(tmp / "missing-catalog.json"))
    monkeypatch.setenv("TOOL_ATTENTION_OUTCOMES", str(tmp / "outcomes.jsonl"))
    monkeypatch.setenv("SKILLS_PATH", str(tmp / "missing-skills"))
    return tmp


def test_tool_catalog_returns_capabilities_and_sources(monkeypatch):
    """tool_catalog exposes all capabilities and sources without raw task text."""
    with TemporaryDirectory() as tmp:
        root = _setup_minimal_root(Path(tmp), monkeypatch)
        catalog = tool_attention.build_catalog()
        assert "capabilities" in catalog
        assert "sources" in catalog
        assert "summary" in catalog
        assert "status" in catalog
        # Privacy: no raw task text visible — task field only appears in recentOutcomes by design
        payload = json.dumps(catalog)
        assert str(root) not in payload


def test_tool_discover_returns_ranked_results(monkeypatch):
    """tool_discover returns capabilities sorted by score, limited to requested count."""
    with TemporaryDirectory() as tmp:
        _setup_minimal_root(Path(tmp), monkeypatch)
        result = tool_attention.discover(query="knowledge", limit=5)
        assert result["status"] == "ok"
        assert isinstance(result["capabilities"], list)
        assert len(result["capabilities"]) <= 5
        # All returned capabilities match the query
        for cap in result["capabilities"]:
            haystack = " ".join([
                cap.get("id", ""), cap.get("name", ""), cap.get("description", ""),
                cap.get("source", ""), " ".join(cap.get("tags", [])),
            ]).lower()
            assert "knowledge" in haystack


def test_tool_load_returns_capability_by_id(monkeypatch):
    """tool_load returns a single capability by ID with instructions."""
    with TemporaryDirectory() as tmp:
        _setup_minimal_root(Path(tmp), monkeypatch)
        result = tool_attention.load_capability("knowledge-workspace:tool-attention")
        assert result["status"] == "ok"
        assert result["capability"]["id"] == "knowledge-workspace:tool-attention"
        assert "instructions" in result
        not_found = tool_attention.load_capability("nonexistent:capability")
        assert not_found["status"] == "not_found"


def test_tool_record_outcome_writes_jsonl(monkeypatch, tmp_path):
    """tool_record_outcome appends a well-formed record to the outcomes log."""
    outcomes_path = tmp_path / "outcomes.jsonl"
    monkeypatch.setenv("TOOL_ATTENTION_OUTCOMES", str(outcomes_path))
    monkeypatch.setenv("MEMROOS_ROOT", str(tmp_path))
    monkeypatch.setenv("TOOL_ATTENTION_CATALOG", str(tmp_path / "missing-catalog.json"))
    monkeypatch.setenv("SKILLS_PATH", str(tmp_path / "missing-skills"))

    result = tool_attention.record_outcome(
        tool_id="skill:test-tool",
        task="implement feature X",
        outcome="helped",
        metadata={"task_type": "coding", "repo": "my-repo"},
    )
    assert result["status"] == "ok"
    assert outcomes_path.exists()
    lines = [json.loads(line) for line in outcomes_path.read_text().splitlines() if line.strip()]
    assert len(lines) == 1
    rec = lines[0]
    assert rec["toolId"] == "skill:test-tool"
    assert rec["outcome"] == "helped"
    assert rec["metadata"]["task_type"] == "coding"
    assert "timestamp" in rec
    # task is stored in JSONL (intentional — stats layer never exposes it)
    assert "task" in rec


def test_tool_stats_omits_raw_task_text(monkeypatch, tmp_path):
    """tool_stats aggregate output never exposes raw task text."""
    outcomes_path = tmp_path / "outcomes.jsonl"
    outcomes_path.write_text(
        json.dumps({
            "timestamp": "2026-05-04T00:00:00Z",
            "toolId": "skill:sensitive",
            "task": "top secret task description that must not leak",
            "outcome": "helped",
            "metadata": {"task_type": "review"},
        }) + "\n"
    )
    monkeypatch.setenv("TOOL_ATTENTION_OUTCOMES", str(outcomes_path))
    monkeypatch.setenv("MEMROOS_ROOT", str(tmp_path))
    monkeypatch.setenv("TOOL_ATTENTION_CATALOG", str(tmp_path / "missing-catalog.json"))
    monkeypatch.setenv("SKILLS_PATH", str(tmp_path / "missing-skills"))

    result = tool_attention.stats()
    payload = json.dumps(result)
    assert "top secret task description" not in payload
    assert result["status"] == "ok"
    assert "outcomesByTool" in result
    assert "skill:sensitive" in result["outcomesByTool"]
    assert result["outcomesByTool"]["skill:sensitive"]["successes"] == 1


# ---------------------------------------------------------------------------
# TOOLGW-03: category field distinguishes capability types in tool_discover
# ---------------------------------------------------------------------------

def test_tool_discover_categories_distinguish_types(monkeypatch, tmp_path):
    """tool_discover includes a categories summary distinguishing MCP servers, workspaces, skills."""
    # Set up a root with at least an MCP server and a skills dir
    (tmp_path / ".mcp.json").write_text(json.dumps({"mcpServers": {"my-server": {"command": "cmd"}}}))
    skills_dir = tmp_path / "skills" / "my-skill"
    skills_dir.mkdir(parents=True)
    (skills_dir / "SKILL.md").write_text("# my-skill\ndescription: A test skill\n")

    monkeypatch.setenv("MEMROOS_ROOT", str(tmp_path))
    monkeypatch.setenv("TOOL_ATTENTION_CATALOG", str(tmp_path / "missing-catalog.json"))
    monkeypatch.setenv("TOOL_ATTENTION_OUTCOMES", str(tmp_path / "outcomes.jsonl"))
    monkeypatch.setenv("SKILLS_PATH", str(tmp_path / "skills"))

    result = tool_attention.discover()
    assert "categories" in result, "discover() must include a 'categories' summary"
    cats = result["categories"]
    assert isinstance(cats, dict)
    assert "mcp-server" in cats, f"Expected mcp-server category, got: {cats}"
    assert "workspace" in cats, f"Expected workspace category, got: {cats}"
    assert "skill" in cats, f"Expected skill category, got: {cats}"
    # Each returned capability must have a non-empty category field
    for cap in result["capabilities"]:
        assert cap.get("category"), f"Capability {cap.get('id')} missing category field"


def test_capability_category_field_set_on_all_types(monkeypatch, tmp_path):
    """Every capability returned by build_catalog has a category field."""
    (tmp_path / ".mcp.json").write_text(json.dumps({"mcpServers": {"srv": {}}}))
    monkeypatch.setenv("MEMROOS_ROOT", str(tmp_path))
    monkeypatch.setenv("TOOL_ATTENTION_CATALOG", str(tmp_path / "missing-catalog.json"))
    monkeypatch.setenv("TOOL_ATTENTION_OUTCOMES", str(tmp_path / "outcomes.jsonl"))
    monkeypatch.setenv("SKILLS_PATH", str(tmp_path / "missing-skills"))

    catalog = tool_attention.build_catalog()
    for cap in catalog["capabilities"]:
        assert cap.get("category"), f"Capability {cap.get('id')} has no category"


# ---------------------------------------------------------------------------
# Phase 98: skill-packs workspace — catalog, read, install
# ---------------------------------------------------------------------------

_SKILL_MD_FULL = """\
---
name: my-skill
description: A test skill
category: research
tags:
  - search
  - analysis
auto-load: true
---

# My Skill

This skill does research.
"""

_SKILL_MD_NO_AUTOLOAD = """\
---
name: no-autoload-skill
description: Skill without auto-load field
category: misc
tags: []
---

# No Auto-load Skill
"""


def _make_skill(skills_dir: Path, skill_name: str, skill_md_content: str) -> Path:
    """Helper to create a skill directory with a SKILL.md file."""
    skill_dir = skills_dir / skill_name
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(skill_md_content)
    return skill_dir


def test_skill_catalog_returns_public_skills(monkeypatch, tmp_path):
    """Catalog returns public skills with all frontmatter fields."""
    pub_skills = tmp_path / "skills"
    _make_skill(pub_skills, "my-skill", _SKILL_MD_FULL)

    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_public", lambda: pub_skills)
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_private", lambda: tmp_path / ".memroos" / "skills")

    result = mcp_server.knowledge_workspace_call("skill-packs", "catalog", {})

    assert result["status"] == "ok"
    assert result["count"] == 1
    skill = result["skills"][0]
    assert skill["name"] == "my-skill"
    assert skill["description"] == "A test skill"
    assert skill["category"] == "research"
    assert skill["tags"] == ["search", "analysis"]
    assert skill["auto_load"] is True


def test_skill_catalog_merges_private_skills(monkeypatch, tmp_path):
    """Catalog merges public and private skills together."""
    pub_skills = tmp_path / "public" / "skills"
    _make_skill(pub_skills, "public-skill", "---\nname: public-skill\ndescription: Public\n---\n")

    priv_skills = tmp_path / "private" / "skills"
    _make_skill(priv_skills, "private-skill", "---\nname: private-skill\ndescription: Private\n---\n")

    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_public", lambda: pub_skills)
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_private", lambda: priv_skills)

    result = mcp_server.knowledge_workspace_call("skill-packs", "catalog", {})

    assert result["status"] == "ok"
    names = {s["name"] for s in result["skills"]}
    assert "public-skill" in names
    assert "private-skill" in names
    assert result["count"] == 2


def test_skill_catalog_private_overrides_public_same_name(monkeypatch, tmp_path):
    """Private skill with same name as public skill wins in catalog."""
    pub_skills = tmp_path / "public" / "skills"
    _make_skill(pub_skills, "conflict-skill", "---\nname: conflict-skill\ndescription: Public version\n---\n")

    priv_skills = tmp_path / "private" / "skills"
    _make_skill(priv_skills, "conflict-skill", "---\nname: conflict-skill\ndescription: Private version\n---\n")

    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_public", lambda: pub_skills)
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_private", lambda: priv_skills)

    result = mcp_server.knowledge_workspace_call("skill-packs", "catalog", {})

    assert result["status"] == "ok"
    assert result["count"] == 1  # one entry per name
    assert result["skills"][0]["description"] == "Private version"


def test_skill_catalog_private_precedence_is_preserved_with_fallback_metadata(monkeypatch, tmp_path):
    """Private skills still override checkout skills when names collide."""
    repo_root = Path(__file__).resolve().parents[3]
    private_root = tmp_path / "private" / "skills"
    _make_skill(
        private_root,
        "memroos-recall",
        "---\nname: memroos-recall\ndescription: Private recall override\nauto_load: true\n---\n",
    )

    monkeypatch.setenv("KNOWLEDGE_ROOT", str(tmp_path / "missing-knowledge"))
    monkeypatch.setenv("MEMROOS_ROOT", str(repo_root))
    monkeypatch.setenv("MEMROOS_PRIVATE_SKILLS_DIR", str(private_root))

    result = mcp_server.knowledge_workspace_call("skill-packs", "catalog", {"filter": "auto-load"})

    recall = next(skill for skill in result["skills"] if skill["name"] == "memroos-recall")
    assert recall["description"] == "Private recall override"


def test_skill_catalog_filter_auto_load(monkeypatch, tmp_path):
    """filter=auto-load returns only skills with auto-load: true."""
    pub_skills = tmp_path / "skills"
    _make_skill(pub_skills, "my-skill", _SKILL_MD_FULL)  # auto-load: true
    _make_skill(pub_skills, "no-autoload-skill", _SKILL_MD_NO_AUTOLOAD)  # no auto-load

    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_public", lambda: pub_skills)
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_private", lambda: tmp_path / ".memroos" / "skills")

    result = mcp_server.knowledge_workspace_call("skill-packs", "catalog", {"filter": "auto-load"})

    assert result["status"] == "ok"
    assert result["count"] == 1
    assert result["skills"][0]["name"] == "my-skill"


def test_skill_catalog_falls_back_to_checkout_skills_when_knowledge_skills_are_absent(monkeypatch, tmp_path):
    """A clean MemroOS-shaped checkout exposes skills without a corpus skills dir."""
    repo_root = tmp_path / "memroos-checkout"
    checkout_skills = repo_root / ".agents" / "skills"
    _make_skill(
        checkout_skills,
        "memroos-recall",
        "---\nname: memroos-recall\ndescription: Checkout recall\nauto_load: true\n---\n",
    )
    missing_knowledge_root = tmp_path / "knowledge-root-without-skills"
    private_root = tmp_path / "private-skills"

    monkeypatch.setenv("KNOWLEDGE_ROOT", str(missing_knowledge_root))
    monkeypatch.setenv("MEMROOS_ROOT", str(repo_root))
    monkeypatch.setenv("MEMROOS_PRIVATE_SKILLS_DIR", str(private_root))

    result = mcp_server.knowledge_workspace_call("skill-packs", "catalog", {"filter": "auto-load"})

    assert result["status"] == "ok"
    assert result["count"] > 0
    assert "memroos-recall" in {skill["name"] for skill in result["skills"]}
    assert Path(result["public_root"]) == repo_root / ".agents" / "skills"


def test_skill_catalog_defaults_auto_load_false(monkeypatch, tmp_path):
    """Skills without auto-load frontmatter field return auto_load=False."""
    pub_skills = tmp_path / "skills"
    _make_skill(pub_skills, "no-autoload-skill", _SKILL_MD_NO_AUTOLOAD)

    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_public", lambda: pub_skills)
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_private", lambda: tmp_path / ".memroos" / "skills")

    result = mcp_server.knowledge_workspace_call("skill-packs", "catalog", {})

    assert result["status"] == "ok"
    assert result["count"] == 1
    assert result["skills"][0]["auto_load"] is False


def test_skill_read_returns_content(monkeypatch, tmp_path):
    """read action returns full SKILL.md content for a known skill."""
    pub_skills = tmp_path / "skills"
    _make_skill(pub_skills, "my-skill", _SKILL_MD_FULL)

    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_public", lambda: pub_skills)
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_private", lambda: tmp_path / ".memroos" / "skills")

    result = mcp_server.knowledge_workspace_call("skill-packs", "read", {"name": "my-skill"})

    assert result["status"] == "ok"
    assert result["name"] == "my-skill"
    assert result["content"] == _SKILL_MD_FULL


def test_skill_read_not_found(monkeypatch, tmp_path):
    """read action returns not_found when skill does not exist."""
    pub_skills = tmp_path / "skills"
    pub_skills.mkdir(parents=True)

    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_public", lambda: pub_skills)
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_private", lambda: tmp_path / ".memroos" / "skills")

    result = mcp_server.knowledge_workspace_call("skill-packs", "read", {"name": "nonexistent"})

    assert result["status"] == "not_found"
    assert result["name"] == "nonexistent"


def test_skill_read_prefers_private(monkeypatch, tmp_path):
    """read action returns private skill content when same name exists in both dirs."""
    pub_skills = tmp_path / "public" / "skills"
    _make_skill(pub_skills, "my-skill", "---\nname: my-skill\n---\nPublic content\n")

    priv_skills = tmp_path / "private" / "skills"
    _make_skill(priv_skills, "my-skill", "---\nname: my-skill\n---\nPrivate content\n")

    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_public", lambda: pub_skills)
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_private", lambda: priv_skills)

    result = mcp_server.knowledge_workspace_call("skill-packs", "read", {"name": "my-skill"})

    assert result["status"] == "ok"
    assert "Private content" in result["content"]


def test_skill_install_returns_guidance(monkeypatch, tmp_path):
    """install action returns status ok with a guidance message, no filesystem writes."""
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_public", lambda: tmp_path / "skills")
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_private", lambda: tmp_path / ".memroos" / "skills")

    result = mcp_server.knowledge_workspace_call("skill-packs", "install", {"name": "any-skill"})

    assert result["status"] == "ok"
    assert "content" in result["message"]
    # Verify no files were written
    assert not list(tmp_path.rglob("*.md"))


def test_skill_catalog_empty_when_no_skills_dir(monkeypatch, tmp_path):
    """catalog returns empty list with no error when skills dirs do not exist."""
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_public", lambda: tmp_path / "nonexistent-pub")
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_private", lambda: tmp_path / "nonexistent-priv")

    result = mcp_server.knowledge_workspace_call("skill-packs", "catalog", {})

    assert result["status"] == "ok"
    assert result["skills"] == []
    assert result["count"] == 0


def test_skill_catalog_skips_dir_without_skill_md(monkeypatch, tmp_path):
    """catalog skips subdirectories that have no SKILL.md file."""
    pub_skills = tmp_path / "skills"
    pub_skills.mkdir()
    empty_dir = pub_skills / "empty-skill"
    empty_dir.mkdir()
    # No SKILL.md in empty_dir

    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_public", lambda: pub_skills)
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_private", lambda: tmp_path / ".memroos" / "skills")

    result = mcp_server.knowledge_workspace_call("skill-packs", "catalog", {})

    assert result["status"] == "ok"
    assert result["skills"] == []
    assert result["count"] == 0


def test_skill_parse_malformed_frontmatter_returns_defaults(tmp_path):
    """_parse_skill_frontmatter returns safe defaults on malformed YAML, no exception raised."""
    malformed_content = "---\n: bad: yaml: [unclosed\n---\n# Body\n"

    result = mcp_server._parse_skill_frontmatter(malformed_content, fallback_name="my-skill")

    assert result["name"] == "my-skill"
    assert result["auto_load"] is False
    assert result["tags"] == []
    assert result["description"] == ""


def test_skill_parse_accepts_underscore_auto_load_frontmatter():
    result = mcp_server._parse_skill_frontmatter(
        "---\nname: underscore-skill\nauto_load: true\n---\n# Skill\n",
        fallback_name="underscore-skill",
    )

    assert result["auto_load"] is True


def test_shipped_memory_skills_have_parseable_auto_load_frontmatter():
    skills_root = Path(__file__).resolve().parents[3] / ".agents" / "skills"

    for skill_name in ("memroos-recall", "memroos-save"):
        content = (skills_root / skill_name / "SKILL.md").read_text()
        parsed = mcp_server._parse_skill_frontmatter(content, fallback_name=skill_name)
        assert parsed["name"] == skill_name
        assert parsed["auto_load"] is True


def test_skill_read_empty_name_returns_error(monkeypatch, tmp_path):
    """read action returns error status when name is empty or omitted."""
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_public", lambda: tmp_path / "skills")
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_private", lambda: tmp_path / ".memroos" / "skills")

    result_empty = mcp_server.knowledge_workspace_call("skill-packs", "read", {"name": ""})
    assert result_empty["status"] == "error"

    result_omitted = mcp_server.knowledge_workspace_call("skill-packs", "read", {})
    assert result_omitted["status"] == "error"


def test_skill_read_path_traversal_rejected(monkeypatch, tmp_path):
    """read action rejects names with path separators or .. sequences."""
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_public", lambda: tmp_path / "skills")
    monkeypatch.setattr("knowledge_system.mcp_server._skills_root_private", lambda: tmp_path / ".memroos" / "skills")

    for traversal in ["../etc/passwd", "../../secret", "foo/bar", "foo\x00bar"]:
        result = mcp_server.knowledge_workspace_call("skill-packs", "read", {"name": traversal})
        assert result["status"] in {"error", "not_found"}, f"traversal '{traversal}' was not blocked"
