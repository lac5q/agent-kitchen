"""Tool-attention catalog for progressive MCP discovery."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

try:
    from .capabilities import CORE_TOOLS, WORKSPACES
except ImportError:  # pragma: no cover
    from knowledge_system.capabilities import CORE_TOOLS, WORKSPACES


def repo_root() -> Path:
    configured = os.environ.get("AGENT_KITCHEN_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[3]


def catalog_path() -> Path:
    return Path(
        os.environ.get(
            "TOOL_ATTENTION_CATALOG",
            str(repo_root() / "services" / "knowledge-mcp" / "tool-catalog.json"),
        )
    ).expanduser()


def outcomes_path() -> Path:
    return Path(
        os.environ.get(
            "TOOL_ATTENTION_OUTCOMES",
            str(repo_root() / "logs" / "tool-attention-outcomes.jsonl"),
        )
    ).expanduser()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(errors="replace"))


def _read_jsonl(path: Path, limit: int = 20) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(errors="replace").splitlines()[-limit:]:
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return list(reversed(rows))


def _capability(
    *,
    capability_id: str,
    name: str,
    capability_type: str,
    source: str,
    description: str,
    status: str = "available",
    tags: Optional[list[str]] = None,
    use_when: Optional[list[str]] = None,
    top_level: bool = False,
    load_command: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "id": capability_id,
        "name": name,
        "type": capability_type,
        "source": source,
        "description": description,
        "status": status,
        "tags": tags or [],
        "useWhen": use_when or [],
        "topLevel": top_level,
        "loadCommand": load_command,
    }


def _mcp_server_capabilities(root: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    path = root / ".mcp.json"
    source = {
        "id": "root-mcp-json",
        "label": ".mcp.json",
        "type": "local-config",
        "path": str(path),
        "status": "available" if path.exists() else "missing",
    }
    if not path.exists():
        return [], [source]
    try:
        data = json.loads(path.read_text(errors="replace"))
    except json.JSONDecodeError:
        source["status"] = "invalid"
        return [], [source]

    capabilities = []
    for server_id in sorted((data.get("mcpServers") or {}).keys()):
        capabilities.append(
            _capability(
                capability_id=f"mcp-server:{server_id}",
                name=server_id,
                capability_type="mcp-server",
                source="root-mcp-json",
                description=f"Configured MCP server `{server_id}` from the monorepo root MCP config.",
                tags=["mcp", "configured"],
                use_when=[f"Need tools exposed by the {server_id} MCP server."],
                top_level=True,
                load_command=f"Use MCP server `{server_id}`",
            )
        )
    return capabilities, [source]


def _knowledge_capabilities() -> list[dict[str, Any]]:
    capabilities = [
        _capability(
            capability_id=f"knowledge-core:{tool}",
            name=tool,
            capability_type="mcp-tool",
            source="knowledge-system",
            description=f"Core knowledge-system MCP tool `{tool}`.",
            tags=["knowledge", "core", "mcp"],
            top_level=True,
            load_command=tool,
        )
        for tool in CORE_TOOLS
    ]
    for workspace, data in WORKSPACES.items():
        capabilities.append(
            _capability(
                capability_id=f"knowledge-workspace:{workspace}",
                name=workspace,
                capability_type="workspace",
                source="knowledge-system",
                description=data.get("description", ""),
                tags=["knowledge", "workspace", "progressive"],
                use_when=list(data.get("use_when", [])),
                load_command=f'knowledge_open_workspace("{workspace}")',
            )
        )
    return capabilities


def _skill_capabilities() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    skills_root = Path(os.environ.get("SKILLS_PATH", str(Path.home() / ".claude" / "skills"))).expanduser()
    source = {
        "id": "skills-path",
        "label": "Kitchen-visible skills",
        "type": "skills",
        "path": str(skills_root),
        "status": "available" if skills_root.exists() else "missing",
    }
    if not skills_root.exists():
        return [], [source]

    capabilities = []
    for child in sorted(p for p in skills_root.iterdir() if p.is_dir() and not p.name.startswith(".")):
        skill_file = child / "SKILL.md"
        description = f"Agent skill `{child.name}`."
        if skill_file.exists():
            try:
                first_lines = skill_file.read_text(errors="replace").splitlines()[:20]
                for line in first_lines:
                    if line.startswith("description:"):
                        description = line.split(":", 1)[1].strip().strip('"')
                        break
            except OSError:
                pass
        capabilities.append(
            _capability(
                capability_id=f"skill:{child.name}",
                name=child.name,
                capability_type="skill",
                source="skills-path",
                description=description,
                tags=["skill", "agent-context"],
                use_when=[f"Need the {child.name} reusable agent skill."],
                load_command=f"Read {skill_file}",
            )
        )
    return capabilities, [source]


def _external_catalog_capabilities() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    data = _read_json(catalog_path())
    return list(data.get("capabilities", [])), list(data.get("sources", []))


def build_catalog() -> dict[str, Any]:
    root = repo_root()
    capabilities: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []

    mcp_caps, mcp_sources = _mcp_server_capabilities(root)
    skill_caps, skill_sources = _skill_capabilities()
    external_caps, external_sources = _external_catalog_capabilities()

    capabilities.extend(mcp_caps)
    capabilities.extend(_knowledge_capabilities())
    capabilities.extend(skill_caps)
    capabilities.extend(external_caps)
    sources.extend(mcp_sources)
    sources.append(
        {
            "id": "knowledge-system",
            "label": "Knowledge MCP",
            "type": "service",
            "path": str(root / "services" / "knowledge-mcp"),
            "status": "available",
        }
    )
    sources.extend(skill_sources)
    sources.extend(external_sources)

    outcomes = _read_jsonl(outcomes_path())
    unique_sources = {source["id"]: source for source in sources if "id" in source}
    return {
        "status": "ok",
        "summary": _summary(capabilities, list(unique_sources.values()), outcomes),
        "capabilities": capabilities,
        "sources": list(unique_sources.values()),
        "recentOutcomes": outcomes,
        "recommendations": _recommendations(capabilities),
        "health": _health(),
        "timestamp": _now(),
    }


def _summary(
    capabilities: list[dict[str, Any]],
    sources: list[dict[str, Any]],
    outcomes: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "totalCapabilities": len(capabilities),
        "topLevelTools": sum(1 for item in capabilities if item.get("topLevel")),
        "workspaces": sum(1 for item in capabilities if item.get("type") == "workspace"),
        "sources": len(sources),
        "recentOutcomes": len(outcomes),
    }


def _recommendations(capabilities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    preferred = [
        "knowledge-workspace:tool-attention",
        "mcp-server:knowledge-system",
        "knowledge-workspace:agent-memory",
        "mcp-server:gitnexus",
    ]
    by_id = {item["id"]: item for item in capabilities}
    return [
        {
            "capabilityId": cap_id,
            "title": by_id[cap_id]["name"],
            "reason": "High-leverage starting point for progressive discovery.",
        }
        for cap_id in preferred
        if cap_id in by_id
    ]


def _health() -> dict[str, Any]:
    catalog = catalog_path()
    outcomes = outcomes_path()
    messages = []
    status = "ok"
    if not catalog.exists():
        status = "degraded"
        messages.append("Optional curated tool catalog is missing.")
    if not outcomes.exists():
        messages.append("No tool outcome log has been recorded yet.")
    return {
        "status": status,
        "catalogPath": str(catalog),
        "outcomesPath": str(outcomes),
        "messages": messages,
    }


def discover(query: str = "", limit: int = 25) -> dict[str, Any]:
    catalog = build_catalog()
    normalized = query.lower().strip()
    capabilities = catalog["capabilities"]
    if normalized:
        def score(item: dict[str, Any]) -> int:
            haystack = " ".join(
                [
                    item.get("id", ""),
                    item.get("name", ""),
                    item.get("description", ""),
                    item.get("source", ""),
                    " ".join(item.get("tags", [])),
                    " ".join(item.get("useWhen", [])),
                ]
            ).lower()
            return sum(1 for term in normalized.split() if term in haystack)

        capabilities = [item for item in capabilities if score(item) > 0]
        capabilities.sort(key=score, reverse=True)
    catalog["capabilities"] = capabilities[: max(1, min(limit, 100))]
    catalog["summary"] = _summary(catalog["capabilities"], catalog["sources"], catalog["recentOutcomes"])
    return catalog


def load_capability(capability_id: str) -> dict[str, Any]:
    catalog = build_catalog()
    for item in catalog["capabilities"]:
        if item.get("id") == capability_id:
            return {
                "status": "ok",
                "capability": item,
                "instructions": [
                    "Load only for the current task scope.",
                    "Record the outcome after use so future agents can learn the selection.",
                ],
            }
    return {"status": "not_found", "capabilityId": capability_id}


def record_outcome(
    tool_id: str,
    task: str,
    outcome: str,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    path = outcomes_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp": _now(),
        "toolId": tool_id,
        "task": task,
        "outcome": outcome,
        "metadata": metadata or {},
    }
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True) + "\n")
    return {"status": "ok", "record": record, "path": str(path)}


def stats() -> dict[str, Any]:
    catalog = build_catalog()
    return {
        "status": "ok",
        "summary": catalog["summary"],
        "health": catalog["health"],
        "timestamp": catalog["timestamp"],
    }
