#!/usr/bin/env python3
"""Behavior tests for the public-safe hybrid knowledge system."""

import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

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


def test_core_tools_stay_small_for_progressive_disclosure():
    assert CORE_TOOLS == [
        "knowledge_health",
        "knowledge_manifest",
        "knowledge_search",
        "knowledge_read",
        "memory_search",
        "memory_save",
    ]


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
        monkeypatch.setenv("AGENT_KITCHEN_ROOT", str(root))
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
        monkeypatch.setenv("AGENT_KITCHEN_ROOT", str(root))
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
