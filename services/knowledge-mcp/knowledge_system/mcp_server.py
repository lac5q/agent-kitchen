"""Unified MCP server for the hybrid knowledge system.

The server is one external facade for agents. It deliberately exposes a small
core surface, then uses progressive disclosure for deeper workspaces so agents
do not start every session with a giant tool menu.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

try:  # FastMCP is available as either fastmcp or mcp.server.fastmcp depending on install.
    from fastmcp import FastMCP  # type: ignore
except Exception:  # pragma: no cover - environment compatibility
    from mcp.server.fastmcp import FastMCP  # type: ignore

try:
    import httpx  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    httpx = None

try:
    from .capabilities import get_capabilities, open_workspace
    from .compiler import compile_wiki
    from .store import KnowledgeStore
    from . import tool_attention
except ImportError:  # pragma: no cover - allows `python knowledge_system/mcp_server.py`
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from knowledge_system.capabilities import get_capabilities, open_workspace
    from knowledge_system.compiler import compile_wiki
    from knowledge_system.store import KnowledgeStore
    from knowledge_system import tool_attention


mcp = FastMCP("knowledge-system")


def _root() -> Path:
    return Path(os.environ.get("KNOWLEDGE_ROOT", ".")).expanduser().resolve()


def _recipes_catalog_path() -> Path:
    return _root() / "docs" / "OPEN_BRAIN_RECIPES_CATALOG.md"


def _recipes_catalog_text() -> str:
    path = _recipes_catalog_path()
    if path.exists():
        return path.read_text(errors="replace")
    return "# Open Brain Recipe Catalog\n\nNo recipe catalog found at docs/OPEN_BRAIN_RECIPES_CATALOG.md.\n"


def _mem0_url() -> str:
    return os.environ.get("MEM0_URL", "http://localhost:3201").rstrip("/")


# ---------------------------------------------------------------------------
# Core lightweight surface
# ---------------------------------------------------------------------------


@mcp.tool()
def knowledge_health() -> dict:
    """Return configured knowledge status without exposing secrets."""
    root = _root()
    store = KnowledgeStore(root)
    manifest = store.manifest() if root.exists() else {"known_files": [], "file_count": 0}
    mem0_status = "not_checked"
    if httpx is not None:
        try:
            response = httpx.get(f"{_mem0_url()}/health", timeout=2)
            mem0_status = "ok" if response.status_code == 200 else f"http_{response.status_code}"
        except Exception:
            mem0_status = "unavailable"
    return {
        "status": "ok" if root.exists() else "missing_root",
        "root": str(root),
        "file_count": manifest.get("file_count", 0),
        "wiki_present": manifest.get("wiki_present", False),
        "mem0": mem0_status,
        "capability_model": "core-plus-workspaces",
    }


@mcp.tool()
def knowledge_manifest() -> dict:
    """List known markdown files and whether a generated wiki is present."""
    return KnowledgeStore(_root()).manifest()


@mcp.tool()
def knowledge_search(query: str, limit: int = 20) -> list[dict]:
    """Search source and generated wiki markdown for a literal query."""
    return KnowledgeStore(_root()).search(query=query, limit=limit)


@mcp.tool()
def knowledge_read(path: str, max_chars: int = 20000) -> dict:
    """Read a knowledge file by repo-relative path with traversal protection."""
    return KnowledgeStore(_root()).read_text(path, max_chars=max_chars)


@mcp.tool()
def memory_search(query: str, agent_id: str = "", limit: int = 5) -> dict:
    """Search durable agent memory through the configured memory adapter."""
    if httpx is None:
        return {"status": "unavailable", "error": "httpx is not installed", "results": []}
    try:
        params: dict = {"q": query, "limit": limit}
        if agent_id:
            params["agent_id"] = agent_id
        response = httpx.get(f"{_mem0_url()}/memory/search", params=params, timeout=10)
        response.raise_for_status()
        return {"status": "ok", "results": response.json().get("results", [])}
    except Exception as exc:
        return {"status": "unavailable", "error": str(exc), "results": []}


@mcp.tool()
def memory_save(text: str, agent_id: str = "shared", metadata: Optional[dict] = None) -> dict:
    """Save a durable memory through the configured memory adapter."""
    if httpx is None:
        return {"status": "unavailable", "error": "httpx is not installed"}
    try:
        response = httpx.post(
            f"{_mem0_url()}/memory/add",
            json={"text": text, "agent_id": agent_id, "metadata": metadata or {}},
            timeout=10,
        )
        response.raise_for_status()
        return {"status": "ok", "response": response.json()}
    except Exception as exc:
        return {"status": "unavailable", "error": str(exc)}


# ---------------------------------------------------------------------------
# Progressive disclosure meta-tools
# ---------------------------------------------------------------------------


@mcp.tool()
def knowledge_capabilities(workspace: Optional[str] = None) -> dict:
    """Show core capabilities or a deeper workspace manifest."""
    return get_capabilities(workspace)


@mcp.tool()
def knowledge_open_workspace(workspace: str) -> dict:
    """Open a deeper capability workspace for the current task."""
    return open_workspace(workspace)


@mcp.tool()
def knowledge_workspace_call(workspace: str, action: str, arguments: Optional[dict] = None) -> dict:
    """Execute a deep workspace action without exposing every action as a top-level tool."""
    args = arguments or {}
    if workspace == "wiki" and action == "compile":
        source_glob = args.get("source_glob")
        wiki_subdir = args.get("wiki_subdir", "wiki")
        globs = [source_glob] if source_glob else None
        return compile_wiki(root=_root(), source_globs=globs, wiki_subdir=wiki_subdir)
    if workspace == "wiki" and action == "index":
        return {"status": "ok", "content": wiki_index_resource()}
    if workspace == "agent-memory" and action == "health":
        return {"status": "ok", "health": knowledge_health().get("mem0")}
    if workspace == "graph" and action in {"read", "stats"}:
        root = _root()
        graph_path = root / "wiki" / "graph" / "knowledge-graph.json"
        if not graph_path.exists():
            graph_path = root / "llm-wiki" / "wiki" / "graph" / "knowledge-graph.json"
        if not graph_path.exists():
            return {"status": "missing_graph", "error": "Run wiki compile first."}
        graph = graph_path.read_text(errors="replace")
        if action == "read":
            return {"status": "ok", "path": str(graph_path), "content": graph}
        import json
        parsed = json.loads(graph)
        return {"status": "ok", "nodes": len(parsed.get("nodes", [])), "edges": len(parsed.get("edges", []))}
    if workspace == "dashboard" and action == "manifest":
        root = _root()
        manifest_path = root / "wiki" / "dashboard" / "manifest.json"
        if not manifest_path.exists():
            manifest_path = root / "llm-wiki" / "wiki" / "dashboard" / "manifest.json"
        if not manifest_path.exists():
            return {"status": "missing_manifest", "error": "Run wiki compile first."}
        import json
        return {"status": "ok", "manifest": json.loads(manifest_path.read_text(errors="replace"))}
    if workspace == "tool-attention":
        if action == "catalog":
            return tool_attention.build_catalog()
        if action == "discover":
            return tool_attention.discover(
                query=str(args.get("query", "")),
                limit=int(args.get("limit", 25)),
            )
        if action == "load":
            return tool_attention.load_capability(str(args.get("id", args.get("capability_id", ""))))
        if action == "record_outcome":
            return tool_attention.record_outcome(
                tool_id=str(args.get("tool_id", args.get("toolId", ""))),
                task=str(args.get("task", "")),
                outcome=str(args.get("outcome", "")),
                metadata=args.get("metadata") if isinstance(args.get("metadata"), dict) else None,
            )
        if action == "stats":
            return tool_attention.stats()
        return {
            "status": "unsupported_action",
            "workspace": workspace,
            "action": action,
            "capabilities": get_capabilities(workspace),
        }
    if workspace in {"ingestion", "workflows", "skill-packs", "integrations", "primitives"}:
        if action in {"catalog", "read", "list"}:
            return {
                "status": "ok",
                "workspace": workspace,
                "path": str(_recipes_catalog_path()),
                "content": _recipes_catalog_text(),
            }
        return {
            "status": "not_implemented",
            "workspace": workspace,
            "action": action,
            "message": "This workspace is cataloged, but the runtime adapter is not implemented yet.",
            "catalog": str(_recipes_catalog_path()),
        }
    return {
        "status": "unsupported_action",
        "workspace": workspace,
        "action": action,
        "capabilities": get_capabilities(workspace),
    }


# ---------------------------------------------------------------------------
# Resources and prompts
# ---------------------------------------------------------------------------


@mcp.resource("knowledge://manifest")
def manifest_resource() -> dict:
    """Machine-readable manifest for agent clients."""
    return KnowledgeStore(_root()).manifest()


@mcp.resource("knowledge://wiki/index")
def wiki_index_resource() -> str:
    """Generated wiki index markdown."""
    root = _root()
    for candidate in (root / "wiki" / "index.md", root / "llm-wiki" / "wiki" / "index.md"):
        if candidate.exists():
            return candidate.read_text(errors="replace")
    return "# Wiki Index\n\nNo generated wiki index found. Open the wiki workspace and run action `compile`.\n"


@mcp.resource("knowledge://recipes/catalog")
def recipes_catalog_resource() -> str:
    """Open Brain / OB1 recipe catalog and implementation backlog."""
    return _recipes_catalog_text()


@mcp.prompt()
def knowledge_system_orientation() -> str:
    """Prompt that tells an agent how to use the knowledge system safely."""
    return (
        "Use the knowledge-system MCP server as one facade with progressive disclosure. "
        "Start with core tools: health, manifest, search, read, memory_search, memory_save. "
        "If a task needs deeper capability, call knowledge_capabilities or knowledge_open_workspace. "
        "Use knowledge_workspace_call for deep actions like wiki compile instead of expecting many top-level tools. "
        "Treat source files as authoritative and generated wiki pages as compiled views with citations."
    )


if __name__ == "__main__":
    mcp.run()
