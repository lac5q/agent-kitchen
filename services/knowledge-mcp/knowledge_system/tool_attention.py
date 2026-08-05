"""Tool-attention catalog for progressive MCP discovery."""

from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

try:
    from .capabilities import CORE_TOOLS, WORKSPACES
except ImportError:  # pragma: no cover
    from knowledge_system.capabilities import CORE_TOOLS, WORKSPACES

SUCCESS_OUTCOMES = {"helped", "success", "successful", "useful", "pass", "passed", "worked"}
FAILURE_OUTCOMES = {"failed", "failure", "not_helpful", "not helpful", "miss", "error", "blocked"}
SUPPORTED_OPTIONAL_CAPABILITIES = {"gitnexus", "agent-lightning"}

# Knowledge storage policy: Artyfacts tools that should trigger a warning when used for knowledge storage
ARTYFACTS_KNOWLEDGE_TOOLS = {
    "mcp_artyfacts_save_document_as_artifact",
    "mcp_artyfacts_create_section",
    "mcp_artyfacts_update_section",
    "mcp_artyfacts_start_section",
    "mcp_artyfacts_edit_section",
}

# Task keywords that suggest knowledge storage (not research)
KNOWLEDGE_STORAGE_KEYWORDS = {
    "save", "file", "document", "archive", "store", "knowledge", "report",
    "analysis", "plan", "spec", "research", "artifact", "deliverable",
    "write up", "write-up", "draft", "produce", "summary", "guide",
}

# Task keywords that suggest research (Artyfacts acceptable)
RESEARCH_KEYWORDS = {
    "search", "find", "look up", "reference", "temporary", "scratch",
    "draft review", "quick check", "explore", "browse", "discover",
}


def repo_root() -> Path:
    configured = os.environ.get("MEMROOS_ROOT")
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


def _optional_capability_names() -> set[str]:
    raw = os.environ.get("MEMROOS_OPTIONAL_CAPABILITIES", "")
    return {
        item.strip().lower()
        for item in raw.split(",")
        if item.strip().lower() in SUPPORTED_OPTIONAL_CAPABILITIES
    }


def _gitnexus_status(root: Path) -> str:
    has_cli = shutil.which("gitnexus") is not None
    registry = Path(os.environ.get("GITNEXUS_REGISTRY", str(Path.home() / ".gitnexus" / "registry.json"))).expanduser()
    has_registry = registry.exists()
    mcp = _read_json(root / ".mcp.json")
    has_mcp = bool(mcp.get("mcpServers", {}).get("gitnexus"))
    if has_cli and has_mcp and has_registry:
        return "available"
    if has_cli or has_mcp or has_registry:
        return "degraded"
    return "missing"


def _agent_lightning_status(root: Path) -> str:
    home = Path.home()
    proposals = Path(os.environ.get("APO_PROPOSALS_PATH", str(home / ".openclaw" / "skills" / "proposals"))).expanduser()
    cron_log = Path(os.environ.get("APO_CRON_LOG_PATH", str(home / ".openclaw" / "logs" / "agent-lightning-cron.log"))).expanduser()
    package = _read_json(root / "apps" / "memroos" / "package.json")
    has_worker = bool(package.get("scripts", {}).get("apo:worker"))
    if has_worker and proposals.exists() and cron_log.exists():
        return "available"
    if has_worker or proposals.exists() or cron_log.exists():
        return "degraded"
    return "missing"


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


def _public_path(value: str | Path | None) -> str | None:
    if value is None:
        return None
    text = str(value)
    if text.startswith(("http://", "https://")):
        return text
    if not Path(text).expanduser().is_absolute():
        return text

    try:
        resolved = Path(text).expanduser().resolve()
    except OSError:
        resolved = Path(text).expanduser()

    try:
        return str(resolved.relative_to(repo_root()))
    except ValueError:
        pass

    try:
        return f"~/{resolved.relative_to(Path.home().resolve())}"
    except ValueError:
        return resolved.name or text


def _public_source(source: dict[str, Any]) -> dict[str, Any]:
    redacted = dict(source)
    if "path" in redacted:
        redacted["path"] = _public_path(redacted.get("path"))
    return redacted


def _public_load_command(command: Optional[str]) -> Optional[str]:
    if not command:
        return command
    redacted = command.replace(str(repo_root()), ".")
    home = str(Path.home().resolve())
    return redacted.replace(home, "~")


def _public_capability(capability: dict[str, Any]) -> dict[str, Any]:
    redacted = dict(capability)
    redacted["loadCommand"] = _public_load_command(redacted.get("loadCommand"))
    return redacted


def _outcome_summaries(outcomes: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    summaries: dict[str, dict[str, Any]] = {}
    for outcome in outcomes:
        tool_id = str(outcome.get("toolId") or outcome.get("tool_id") or "")
        if not tool_id:
            continue
        label = str(outcome.get("outcome", "")).strip().lower()
        summary = summaries.setdefault(
            tool_id,
            {
                "toolId": tool_id,
                "uses": 0,
                "successes": 0,
                "failures": 0,
                "lastOutcome": "",
                "lastUsedAt": "",
                "score": 0,
            },
        )
        summary["uses"] += 1
        if label in SUCCESS_OUTCOMES:
            summary["successes"] += 1
            summary["score"] += 2
        elif label in FAILURE_OUTCOMES:
            summary["failures"] += 1
            summary["score"] -= 2
        else:
            summary["score"] += 1
        if not summary["lastUsedAt"]:
            summary["lastUsedAt"] = str(outcome.get("timestamp", ""))
            summary["lastOutcome"] = str(outcome.get("outcome", ""))
    return summaries


def _with_outcome_signal(
    capabilities: list[dict[str, Any]],
    outcome_summaries: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    enriched = []
    for capability in capabilities:
        item = dict(capability)
        summary = outcome_summaries.get(str(item.get("id", "")))
        if summary:
            item["outcomeSummary"] = summary
        enriched.append(item)
    return enriched


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
    category: str = "",
) -> dict[str, Any]:
    return {
        "id": capability_id,
        "name": name,
        "type": capability_type,
        "category": category,
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
    optional = _optional_capability_names()
    for server_id in sorted((data.get("mcpServers") or {}).keys()):
        status = "available"
        if server_id == "gitnexus" and "gitnexus" in optional:
            status = _gitnexus_status(root)
        capabilities.append(
            _capability(
                capability_id=f"mcp-server:{server_id}",
                name=server_id,
                capability_type="mcp-server",
                source="root-mcp-json",
                description=f"Configured MCP server `{server_id}` from the monorepo root MCP config.",
                status=status,
                tags=["mcp", "configured"],
                use_when=[f"Need tools exposed by the {server_id} MCP server."],
                top_level=True,
                load_command=f"Use MCP server `{server_id}`",
                category="mcp-server",
            )
        )
    return capabilities, [source]


def _optional_capabilities(root: Path) -> list[dict[str, Any]]:
    capabilities: list[dict[str, Any]] = []
    optional = _optional_capability_names()
    if "agent-lightning" in optional:
        capabilities.append(
            _capability(
                capability_id="capability:agent-lightning",
                name="agent-lightning",
                capability_type="capability",
                source="optional-capabilities",
                description="Agent Lightning/APO proposal review and approved-skill-improvement workflow.",
                status=_agent_lightning_status(root),
                tags=["agent-lightning", "apo", "skills", "proposals", "progressive"],
                use_when=[
                    "Need to review or process APO skill-improvement proposals",
                    "Need human-gated self-learning changes to skills or agent instructions",
                    "Need Agent Lightning approval worker guidance",
                ],
                load_command="Use /apo or npm --prefix apps/memroos run apo:worker",
                category="capability",
            )
        )
    return capabilities


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
            category="mcp-tool",
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
                category="workspace",
            )
        )
    return capabilities


def _skill_capabilities() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    skills_root = Path(os.environ.get("SKILLS_PATH", str(Path.home() / ".claude" / "skills"))).expanduser()
    source = {
        "id": "skills-path",
        "label": "Memroos-visible skills",
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
                load_command=f"Read skill {child.name}",
                category="skill",
            )
        )
    return capabilities, [source]


_UNAVAILABLE_STATUSES = {"missing", "invalid", "degraded"}


def _external_catalog_capabilities() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    data = _read_json(catalog_path())
    raw_caps: list[dict[str, Any]] = list(data.get("capabilities", []))
    # Annotate category for external catalog entries unless already set.
    annotated = []
    for cap in raw_caps:
        if not cap.get("category"):
            status = str(cap.get("status", "available"))
            cap = dict(cap)
            cap["category"] = "unavailable" if status in _UNAVAILABLE_STATUSES else "reference"
        annotated.append(cap)
    return annotated, list(data.get("sources", []))


def build_catalog() -> dict[str, Any]:
    root = repo_root()
    capabilities: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []

    mcp_caps, mcp_sources = _mcp_server_capabilities(root)
    skill_caps, skill_sources = _skill_capabilities()
    external_caps, external_sources = _external_catalog_capabilities()

    optional_caps = _optional_capabilities(root)
    capabilities.extend(mcp_caps)
    capabilities.extend(optional_caps)
    capabilities.extend(_knowledge_capabilities())
    capabilities.extend(skill_caps)
    capabilities.extend(external_caps)
    sources.extend(mcp_sources)
    if optional_caps:
        sources.append(
            {
                "id": "optional-capabilities",
                "label": "Optional Progressive Capabilities",
                "type": "local-config",
                "path": ".env",
                "status": "available",
            }
        )
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
    outcome_summaries = _outcome_summaries(outcomes)
    public_capabilities = _with_outcome_signal(
        [_public_capability(capability) for capability in capabilities],
        outcome_summaries,
    )
    unique_sources = {source["id"]: _public_source(source) for source in sources if "id" in source}
    return {
        "status": "ok",
        "summary": _summary(public_capabilities, list(unique_sources.values()), outcomes),
        "capabilities": public_capabilities,
        "sources": list(unique_sources.values()),
        "recentOutcomes": outcomes,
        "recommendations": _recommendations(public_capabilities),
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
            "reason": _recommendation_reason(by_id[cap_id]),
        }
        for cap_id in preferred
        if cap_id in by_id
    ]


def _recommendation_reason(capability: dict[str, Any]) -> str:
    outcome = capability.get("outcomeSummary")
    if isinstance(outcome, dict) and outcome.get("uses"):
        return (
            f"High-leverage starting point with {outcome['uses']} recorded "
            f"outcome(s) and score {outcome['score']}."
        )
    return "High-leverage starting point for progressive discovery."


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
        "catalog": "available" if catalog.exists() else "missing",
        "outcomes": "available" if outcomes.exists() else "missing",
        "messages": messages,
    }


def _category_summary(capabilities: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for cap in capabilities:
        cat = str(cap.get("category") or "other")
        counts[cat] = counts.get(cat, 0) + 1
    return counts


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
            query_score = sum(1 for term in normalized.split() if term in haystack)
            outcome = item.get("outcomeSummary") if isinstance(item.get("outcomeSummary"), dict) else {}
            return query_score * 10 + int(outcome.get("score", 0))

        capabilities = [item for item in capabilities if score(item) > 0]
        capabilities.sort(key=score, reverse=True)
    else:
        capabilities.sort(
            key=lambda item: int(
                item.get("outcomeSummary", {}).get("score", 0)
                if isinstance(item.get("outcomeSummary"), dict)
                else 0
            ),
            reverse=True,
        )
    # Categories are a directory of the capability types present in the
    # (query-filtered) catalog, so summarize before pagination — otherwise a
    # type whose entries fall past `limit` silently disappears from the summary
    # (e.g. one more core tool pushes the last skill off the first page).
    catalog["categories"] = _category_summary(capabilities)
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
    return {"status": "ok", "record": record, "path": _public_path(path)}


def stats() -> dict[str, Any]:
    catalog = build_catalog()
    return {
        "status": "ok",
        "summary": catalog["summary"],
        "outcomesByTool": _outcome_summaries(catalog["recentOutcomes"]),
        "health": catalog["health"],
        "timestamp": catalog["timestamp"],
    }


# ---------------------------------------------------------------------------
# Knowledge storage policy enforcement (warning only, not blocking)
# ---------------------------------------------------------------------------


def check_knowledge_storage_policy(tool_id: str, task: str = "", metadata: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Check if an Artyfacts tool use complies with the knowledge storage policy.

    Returns a warning when Artyfacts knowledge tools are used for durable storage
    instead of research. Does NOT block — emits guidance for the agent to self-correct.
    """
    import re

    normalized_tool = tool_id.strip().lower()
    normalized_task = " " + task.lower() + " "  # pad with spaces for word-boundary matching

    # Only check Artyfacts knowledge tools
    if normalized_tool not in {t.lower() for t in ARTYFACTS_KNOWLEDGE_TOOLS}:
        return {"status": "ok", "policy": "not_applicable", "toolId": tool_id}

    # Use word-boundary matching to avoid substring false positives (e.g. "search" in "research")
    def has_keyword(task_text: str, keywords: set[str]) -> bool:
        for kw in keywords:
            # Match whole words/phrases surrounded by spaces or punctuation
            pattern = r'(?:^|[\s\W])' + re.escape(kw.lower()) + r'(?:[\s\W]|$)'
            if re.search(pattern, task_text):
                return True
        return False

    task_suggests_storage = has_keyword(normalized_task, KNOWLEDGE_STORAGE_KEYWORDS)
    task_suggests_research = has_keyword(normalized_task, RESEARCH_KEYWORDS)

    # Metadata can override (explicit research flag)
    meta = metadata or {}
    if meta.get("intent") == "research" or meta.get("temporary") is True:
        task_suggests_research = True
        task_suggests_storage = False

    if task_suggests_storage and not task_suggests_research:
        return {
            "status": "warning",
            "policy": "knowledge_storage_deprecated",
            "toolId": tool_id,
            "message": (
                "⚠️  POLICY: Artyfacts is deprecated for durable knowledge storage. "
                "Use mcp_memroos_knowledge_write for research, analysis, plans, reports, and guides. "
                "Artyfacts is acceptable only for temporary research when memroos is unavailable."
            ),
            "corrective_action": "Call mcp_memroos_knowledge_write(path='content/<topic-slug>/...', content=..., auto_commit=True)",
            "task": task,
        }

    return {"status": "ok", "policy": "compliant", "toolId": tool_id}


def record_outcome_with_policy_check(
    tool_id: str,
    task: str,
    outcome: str,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Record a tool outcome AND run the knowledge storage policy check.

    This is the preferred entry point for agent tool outcome recording.
    It always records the outcome, but appends a policy warning when
    Artyfacts is being used inappropriately for knowledge storage.
    """
    # Always record the outcome first
    result = record_outcome(tool_id, task, outcome, metadata)

    # Run policy check
    policy_result = check_knowledge_storage_policy(tool_id, task, metadata)

    if policy_result.get("status") == "warning":
        # Append warning to the result without blocking
        result["policyWarning"] = policy_result
        # Also log the warning to the outcomes file for audit trail
        _log_policy_warning(policy_result)

    return result


def _log_policy_warning(warning: dict[str, Any]) -> None:
    """Append a policy warning to the outcomes log for audit trail."""
    path = outcomes_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp": _now(),
        "toolId": warning.get("toolId", ""),
        "task": warning.get("task", ""),
        "outcome": "policy_warning",
        "metadata": {
            "policy": warning.get("policy", ""),
            "message": warning.get("message", ""),
            "corrective_action": warning.get("corrective_action", ""),
        },
    }
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True) + "\n")
