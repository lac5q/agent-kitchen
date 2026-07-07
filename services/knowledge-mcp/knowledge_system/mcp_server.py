"""Unified MCP server for the hybrid knowledge system.

The server is one external facade for agents. It deliberately exposes a small
core surface, then uses progressive disclosure for deeper workspaces so agents
do not start every session with a giant tool menu.
"""

from __future__ import annotations

import os
import inspect
import secrets
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional, get_args, get_origin, get_type_hints
from urllib.parse import quote

try:
    from fastmcp.server.auth.providers.debug import DebugTokenVerifier  # type: ignore
except Exception:  # pragma: no cover - optional when FastMCP auth extras are unavailable
    DebugTokenVerifier = None  # type: ignore

try:  # FastMCP is available as either fastmcp or mcp.server.fastmcp depending on install.
    from fastmcp import FastMCP  # type: ignore
except Exception:  # pragma: no cover - environment compatibility
    try:
        from mcp.server.fastmcp import FastMCP  # type: ignore
    except Exception:  # pragma: no cover - lets smoke tests import wrappers without MCP installed
        class FastMCP:  # type: ignore[no-redef]
            def __init__(self, _name: str, *args, **kwargs):
                pass

            def tool(self):
                return lambda fn: fn

            def resource(self, _uri: str):
                return lambda fn: fn

            def prompt(self):
                return lambda fn: fn

            def run(self, *args, **kwargs):
                raise RuntimeError("FastMCP runtime is not installed")

try:
    import httpx  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    httpx = None

MEMORY_SERVICE_DIR = Path(__file__).resolve().parents[2] / "memory"
if str(MEMORY_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(MEMORY_SERVICE_DIR))

from provenance import extract_metadata, normalize_metadata, provenance_label  # noqa: E402

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


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer, got {raw!r}") from exc


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _normalize_transport(value: str) -> str:
    transport = value.strip().lower().replace("_", "-")
    aliases = {
        "http": "streamable-http",
        "streamable": "streamable-http",
        "streamablehttp": "streamable-http",
    }
    transport = aliases.get(transport, transport)
    if transport not in {"stdio", "sse", "streamable-http"}:
        raise ValueError("MEMROOS_MCP_TRANSPORT must be one of: stdio, sse, streamable-http")
    return transport


def _server_transport() -> str:
    return _normalize_transport(os.environ.get("MEMROOS_MCP_TRANSPORT", "stdio"))


def _server_options() -> dict:
    """Return FastMCP options controlled by env for local or remote clients."""
    return {
        "host": os.environ.get("MEMROOS_MCP_HOST", "127.0.0.1"),
        "port": _env_int("MEMROOS_MCP_PORT", 8765),
        "streamable_http_path": os.environ.get("MEMROOS_MCP_STREAMABLE_HTTP_PATH", "/mcp"),
        "sse_path": os.environ.get("MEMROOS_MCP_SSE_PATH", "/sse"),
        "message_path": os.environ.get("MEMROOS_MCP_MESSAGE_PATH", "/messages/"),
        "stateless_http": _env_bool("MEMROOS_MCP_STATELESS_HTTP", False),
    }


def _auth_provider():
    token = os.environ.get("MEMROOS_MCP_BEARER_TOKEN", "").strip()
    if not token:
        return None
    if DebugTokenVerifier is None:
        raise RuntimeError("MEMROOS_MCP_BEARER_TOKEN requires FastMCP auth support")
    return DebugTokenVerifier(
        validate=lambda candidate: secrets.compare_digest(candidate, token),
        client_id="memroos-mcp-client",
    )


def _build_mcp() -> FastMCP:
    options = _server_options()
    try:
        return FastMCP("knowledge-system", auth=_auth_provider(), **options)
    except TypeError:  # pragma: no cover - older FastMCP compatibility
        return FastMCP("knowledge-system")


mcp = _build_mcp()
MCP_TOOL_CONTRACT_ID = "memroos-mcp-tools.v1"
_MCP_TOOL_REGISTRY: list = []


def _mcp_tool(fn):
    mcp.tool()(fn)
    _MCP_TOOL_REGISTRY.append(fn)
    return fn


def _annotation_schema(annotation: Any) -> dict:
    if annotation in {inspect.Signature.empty, Any}:
        return {}

    origin = get_origin(annotation)
    args = get_args(annotation)
    if origin is not None and type(None) in args:
        non_null = [arg for arg in args if arg is not type(None)]
        schema = _annotation_schema(non_null[0]) if non_null else {}
        schema["nullable"] = True
        return schema

    if annotation is str:
        return {"type": "string"}
    if annotation is int:
        return {"type": "integer"}
    if annotation is float:
        return {"type": "number"}
    if annotation is bool:
        return {"type": "boolean"}
    if annotation is dict or origin is dict:
        return {"type": "object", "additionalProperties": True}
    if annotation is list or origin is list:
        item_schema = _annotation_schema(args[0]) if args else {}
        return {"type": "array", "items": item_schema}

    return {"type": "string", "description": str(annotation)}


def _json_safe_default(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, list):
        return [_json_safe_default(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_safe_default(item) for key, item in value.items()}
    return str(value)


def _tool_input_schema(fn) -> dict:
    signature = inspect.signature(fn)
    type_hints = get_type_hints(fn)
    properties = {}
    required = []
    for name, parameter in signature.parameters.items():
        if parameter.kind in {parameter.VAR_KEYWORD, parameter.VAR_POSITIONAL}:
            continue
        schema = _annotation_schema(type_hints.get(name, parameter.annotation))
        if parameter.default is inspect.Signature.empty:
            required.append(name)
        else:
            schema = dict(schema)
            schema["default"] = _json_safe_default(parameter.default)
        properties[name] = schema

    input_schema = {
        "type": "object",
        "additionalProperties": False,
        "properties": properties,
    }
    if required:
        input_schema["required"] = required
    return input_schema


def _tool_contract_entry(fn) -> dict:
    doc = inspect.getdoc(fn) or ""
    type_hints = get_type_hints(fn)
    return {
        "name": fn.__name__,
        "description": doc.splitlines()[0] if doc else "",
        "inputSchema": _tool_input_schema(fn),
        "outputSchema": _annotation_schema(type_hints.get("return", inspect.Signature.empty)),
    }


def build_mcp_tool_contract() -> dict:
    """Return the stable machine-readable contract for registered MemRoOS MCP tools."""
    return {
        "id": MCP_TOOL_CONTRACT_ID,
        "server": "knowledge-system",
        "tools": [_tool_contract_entry(fn) for fn in _MCP_TOOL_REGISTRY],
    }


def _mcp_tool_contract_resource_payload() -> dict:
    return build_mcp_tool_contract()


def _root() -> Path:
    return Path(os.environ.get("KNOWLEDGE_ROOT", ".")).expanduser().resolve()


def _recipes_catalog_path() -> Path:
    return _root() / "docs" / "OPEN_BRAIN_RECIPES_CATALOG.md"


def _skills_root_public() -> Path:
    """Public skills directory inside the knowledge repo."""
    return _root() / "skills"


def _skills_root_private() -> Path:
    """Private skills directory on the local machine (never committed)."""
    private_dir = os.environ.get("MEMROOS_PRIVATE_SKILLS_DIR", "")
    if private_dir:
        return Path(private_dir).expanduser().resolve()
    return Path.home() / ".memroos" / "skills"


def _safe_skill_path(root: Path, name: str) -> "Path | None":
    """Return resolved path only if it stays inside root. Returns None on traversal."""
    import re
    if not re.fullmatch(r"[A-Za-z0-9_.\-]+", name):
        return None
    try:
        candidate = (root / name / "SKILL.md").resolve()
        candidate.relative_to(root.resolve())
        return candidate
    except (ValueError, OSError):
        return None


def _parse_skill_frontmatter(content: str, fallback_name: str = "") -> dict:
    """Parse YAML frontmatter from a SKILL.md file.

    Returns a dict with keys: name, description, category, tags, auto_load.
    Defaults: auto_load=False, tags=[], category="", description="".
    Falls back to fallback_name (directory name) if 'name' not in frontmatter.
    Uses PyYAML for correct list handling.
    """
    defaults: dict = {
        "name": fallback_name,
        "description": "",
        "category": "",
        "tags": [],
        "auto_load": False,
    }
    try:
        import yaml  # noqa: PLC0415 — deferred to avoid top-level dep when unused

        if not content.startswith("---"):
            return defaults

        parts = content.split("---", 2)
        if len(parts) < 3:
            return defaults

        frontmatter_text = parts[1].strip()
        if not frontmatter_text:
            return defaults

        data = yaml.safe_load(frontmatter_text)
        if not isinstance(data, dict):
            return defaults

        tags_raw = data.get("tags", [])
        if isinstance(tags_raw, str):
            tags_raw = [tags_raw]
        elif not isinstance(tags_raw, list):
            tags_raw = []

        return {
            "name": str(data.get("name", fallback_name) or fallback_name),
            "description": str(data.get("description", "") or ""),
            "category": str(data.get("category", "") or ""),
            "tags": tags_raw,
            "auto_load": bool(data.get("auto-load", False)),
        }
    except Exception:  # noqa: BLE001 — parse errors return safe defaults
        return defaults


def _recipes_catalog_text() -> str:
    path = _recipes_catalog_path()
    if path.exists():
        return path.read_text(errors="replace")
    return "# Open Brain Recipe Catalog\n\nNo recipe catalog found at docs/OPEN_BRAIN_RECIPES_CATALOG.md.\n"


def _mem0_url() -> str:
    return os.environ.get("MEM0_URL", "http://localhost:3201").rstrip("/")


def _memroos_app_url() -> str:
    return os.environ.get("MEMROOS_APP_URL", os.environ.get("MEMROOS_BASE_URL", "http://localhost:3002")).rstrip("/")


def _memroos_agent_id(agent_id: Optional[str] = None) -> str:
    return (agent_id or os.environ.get("MEMROOS_AGENT_ID") or "shared").strip() or "shared"


def _memroos_agent_role(agent_role: Optional[str] = None) -> str:
    """Resolve the active agent role for label-aware authorization.

    Phase 130 / MSIQ-02: same precedence as `_memroos_tenant_id` --
    explicit tool argument first, then the `MEMROOS_AGENT_ROLE` env var,
    then the conservative default `"agent"` (which cannot read restricted
    or confidential docs).
    """
    explicit = (agent_role or "").strip()
    if explicit:
        return explicit
    env_value = os.environ.get("MEMROOS_AGENT_ROLE", "").strip()
    return env_value or "agent"


def _memroos_tenant_id(tenant_id: Optional[str] = None) -> Optional[str]:
    """Resolve the active tenant id for a knowledge op.

    Phase 125 / ENTOPS-02: ordered precedence:
      1. Explicit tool argument (caller-provided, e.g. from authenticated session).
      2. `MEMROOS_TENANT_ID` env var (set by the runtime harness / operator).
      3. None -- represents the default-tenant solo path (today's behaviour).
    """
    explicit = (tenant_id or "").strip()
    if explicit:
        return explicit
    env_value = os.environ.get("MEMROOS_TENANT_ID", "").strip()
    return env_value or None


def _memroos_user_id(user_id: Optional[str] = None) -> Optional[str]:
    """Resolve the active user id for a knowledge op (Phase 125, ENTOPS-03).

    Same precedence as `_memroos_tenant_id`. Optional everywhere because
    solo mode pre-dates user identity -- leaving it None matches the
    pre-Phase-125 behaviour exactly.
    """
    explicit = (user_id or "").strip()
    if explicit:
        return explicit
    env_value = os.environ.get("MEMROOS_USER_ID", "").strip()
    return env_value or None


def _memroos_agent_headers() -> dict[str, str] | None:
    key = os.environ.get("MEMROOS_AGENT_API_KEY", "").strip()
    if not key:
        return None
    return {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _post_memroos_agent_api(path: str, payload: dict, timeout: int = 10) -> dict:
    if httpx is None:
        return {"status": "unavailable", "error": "httpx is not installed"}

    headers = _memroos_agent_headers()
    if headers is None:
        return {
            "status": "missing_agent_key",
            "error": "Set MEMROOS_AGENT_API_KEY for audited MemroOS agent writes.",
        }

    try:
        response = httpx.post(
            f"{_memroos_app_url()}{path}",
            json=payload,
            headers=headers,
            timeout=timeout,
        )
        response.raise_for_status()
        return {"status": "ok", "response": response.json()}
    except Exception as exc:
        return {"status": "unavailable", "error": str(exc)}


def _get_memroos_agent_api(path: str, params: Optional[dict] = None, timeout: int = 10) -> dict:
    if httpx is None:
        return {"status": "unavailable", "error": "httpx is not installed"}

    headers = _memroos_agent_headers()
    if headers is None:
        return {
            "status": "missing_agent_key",
            "error": "Set MEMROOS_AGENT_API_KEY for audited MemRoOS agent reads.",
        }

    try:
        response = httpx.get(
            f"{_memroos_app_url()}{path}",
            params=params or {},
            headers=headers,
            timeout=timeout,
        )
        response.raise_for_status()
        return {"status": "ok", "response": response.json()}
    except Exception as exc:
        return {"status": "unavailable", "error": str(exc)}


def _qmd_bin() -> str:
    return os.environ.get("QMD_BIN", "qmd")


def _qmd_env() -> dict[str, str]:
    env = dict(os.environ)
    env.setdefault("QMD_FORCE_CPU", "1")
    return env


def _qmd_run(args: list[str], timeout: int = 30) -> dict:
    try:
        completed = subprocess.run(
            [_qmd_bin(), *args],
            check=False,
            capture_output=True,
            env=_qmd_env(),
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError:
        return {"status": "unavailable", "error": f"qmd binary not found: {_qmd_bin()}"}
    except subprocess.TimeoutExpired as exc:
        return {"status": "timeout", "error": str(exc), "args": args}

    payload = {
        "status": "ok" if completed.returncode == 0 else "error",
        "returncode": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    }
    if completed.returncode != 0:
        payload["args"] = args
    return payload


def _qmd_json(args: list[str], timeout: int = 60) -> dict:
    result = _qmd_run(args, timeout=timeout)
    if result.get("status") != "ok":
        return result
    try:
        import json

        result["data"] = json.loads(str(result.get("stdout") or "null"))
        result.pop("stdout", None)
        return result
    except Exception as exc:
        return {
            **result,
            "status": "error",
            "error": f"qmd returned invalid JSON: {exc}",
        }


def _public_base_url() -> str:
    return os.environ.get("MEMROOS_MCP_PUBLIC_BASE_URL", "https://memroos.local").rstrip("/")


def _split_chatgpt_id(document_id: str) -> tuple[str, Optional[int]]:
    path, _, line_fragment = document_id.partition("#L")
    line = int(line_fragment) if line_fragment.isdigit() else None
    return path, line


def _chatgpt_document_id(path: str, line: Optional[int] = None) -> str:
    return f"{path}#L{line}" if line else path


def _chatgpt_url(path: str, line: Optional[int] = None) -> str:
    encoded_path = "/".join(quote(part) for part in path.split("/"))
    suffix = f"#L{line}" if line else ""
    return f"{_public_base_url()}/knowledge/{encoded_path}{suffix}"


def _chatgpt_title(path: str, text: str = "") -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip() or Path(path).stem
    return Path(path).stem.replace("-", " ").replace("_", " ").title()


# ---------------------------------------------------------------------------
# Core lightweight surface
# ---------------------------------------------------------------------------


@_mcp_tool
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


@_mcp_tool
def knowledge_manifest() -> dict:
    """List known markdown files and whether a generated wiki is present."""
    return KnowledgeStore(_root()).manifest()


@_mcp_tool
def knowledge_search(
    query: str,
    limit: int = 20,
    tenant_id: str = "",
    user_id: str = "",
    agent_role: str = "",
) -> list[dict]:
    """Search source and generated wiki markdown for a literal query.

    Phase 125 / ENTOPS-02/03: the active tenant/user is resolved from the
    tool args or the `MEMROOS_TENANT_ID` / `MEMROOS_USER_ID` env vars, and
    forwarded to the underlying `KnowledgeStore.search` so the vault
    isolation + central audit bridge apply. Solo mode (no env, no args)
    preserves the pre-Phase-125 behaviour exactly.

    Phase 130 / MSIQ-02: `agent_role` (or `MEMROOS_AGENT_ROLE` env) is
    forwarded so restricted/confidential docs are filtered per-role.
    """
    store = KnowledgeStore(_root(), tenant_id=_memroos_tenant_id(tenant_id))
    return store.search(
        query=query,
        limit=limit,
        tenant_id=_memroos_tenant_id(tenant_id),
        user_id=_memroos_user_id(user_id),
        agent_id=_memroos_agent_id(),
        agent_role=_memroos_agent_role(agent_role),
    )


@_mcp_tool
def knowledge_read(
    path: str,
    max_chars: int = 20000,
    tenant_id: str = "",
    user_id: str = "",
    agent_role: str = "",
) -> dict:
    """Read a knowledge file by repo-relative path with traversal protection.

    Phase 125 / ENTOPS-02/03: tenant-scoped read. Tenant + user identity
    forwarded for the central audit bridge.

    Phase 130 / MSIQ-02: `agent_role` forwarded so restricted/confidential
    docs return a forbidden dict instead of the content.
    """
    store = KnowledgeStore(_root(), tenant_id=_memroos_tenant_id(tenant_id))
    return store.read_text(
        path,
        max_chars=max_chars,
        tenant_id=_memroos_tenant_id(tenant_id),
        user_id=_memroos_user_id(user_id),
        agent_id=_memroos_agent_id(),
        agent_role=_memroos_agent_role(agent_role),
    )


@_mcp_tool
def knowledge_write(
    path: str,
    content: str,
    agent_id: str = "unknown",
    role: str = "agent",
    append: bool = False,
    require_frontmatter: bool = False,
    auto_commit: bool = True,
    commit_message: str = "",
    tenant_id: str = "",
    user_id: str = "",
) -> dict:
    """Write content to a knowledge file. Agents MUST use this instead of direct filesystem access.

    Args:
        path: Repo-relative path (e.g., "skills/my-skill/SKILL.md")
        content: Content to write
        agent_id: Agent identifier for audit trail
        role: Agent role — "agent" (default), "curator", or "admin"
        append: If True, append to existing file instead of overwriting
        require_frontmatter: If True, validate YAML frontmatter before writing
        auto_commit: If True, automatically stage and commit the change
        commit_message: Custom git commit message (auto-generated if empty)
        tenant_id: Tenant identifier (Phase 125, ENTOPS-02/03)
        user_id: User identifier (Phase 125, ENTOPS-03)

    Returns:
        dict with status, path, bytes_written, commit_sha
    """
    store = KnowledgeStore(_root(), tenant_id=_memroos_tenant_id(tenant_id))
    return store.write_text(
        relative_path=path,
        content=content,
        agent_id=agent_id,
        role=role,
        append=append,
        require_frontmatter=require_frontmatter,
        auto_commit=auto_commit,
        commit_message=commit_message,
        tenant_id=_memroos_tenant_id(tenant_id),
        user_id=_memroos_user_id(user_id),
    )


@_mcp_tool
def knowledge_delete(
    path: str,
    agent_id: str = "unknown",
    role: str = "agent",
    auto_commit: bool = True,
    tenant_id: str = "",
    user_id: str = "",
) -> dict:
    """Delete a knowledge file. Requires admin role.

    Args:
        path: Repo-relative path to delete
        agent_id: Agent identifier for audit trail
        role: Must be "admin" to delete files
        auto_commit: If True, automatically stage and commit the deletion
        tenant_id: Tenant identifier (Phase 125, ENTOPS-02/03)
        user_id: User identifier (Phase 125, ENTOPS-03)

    Returns:
        dict with status, path, deleted, commit_sha
    """
    store = KnowledgeStore(_root(), tenant_id=_memroos_tenant_id(tenant_id))
    return store.delete_file(
        relative_path=path,
        agent_id=agent_id,
        role=role,
        auto_commit=auto_commit,
        tenant_id=_memroos_tenant_id(tenant_id),
        user_id=_memroos_user_id(user_id),
    )


@_mcp_tool
def knowledge_ensure_dir(path: str) -> dict:
    """Create directory structure in knowledge root.

    Args:
        path: Repo-relative directory path (e.g., "skills/my-skill/")

    Returns:
        dict with status, path, created
    """
    store = KnowledgeStore(_root())
    return store.ensure_dir(path)


@_mcp_tool
def knowledge_git_status() -> dict:
    """Return git status of the knowledge repository.

    Returns:
        dict with status, changes, has_changes, root
    """
    store = KnowledgeStore(_root())
    return store.git_status()


@_mcp_tool
def knowledge_git_commit(
    message: str,
    agent_id: str = "unknown",
    paths: list[str] | None = None,
) -> dict:
    """Stage and commit pending changes in the knowledge repository.

    Args:
        message: Git commit message
        agent_id: Agent identifier for audit trail
        paths: Specific paths to stage (None = stage all changes)

    Returns:
        dict with status, commit_sha, message
    """
    store = KnowledgeStore(_root())
    return store.git_commit(
        message=message,
        agent_id=agent_id,
        paths=paths,
    )


@_mcp_tool
def search(query: str) -> dict:
    """Use this for ChatGPT connector search. Returns matching MemroOS knowledge documents."""
    store = KnowledgeStore(_root())
    results = []
    for item in store.search(query=query, limit=10):
        path = str(item["path"])
        line = int(item.get("line") or 0) or None
        try:
            document = store.read_text(path, max_chars=4000)
            title = _chatgpt_title(path, document.get("content", ""))
        except Exception:
            title = _chatgpt_title(path, str(item.get("preview", "")))
        results.append({
            "id": _chatgpt_document_id(path, line),
            "title": title,
            "url": _chatgpt_url(path, line),
        })
    return {"results": results}


@_mcp_tool
def fetch(id: str) -> dict:
    """Use this for ChatGPT connector fetch. Returns a full MemroOS knowledge document by search result id."""
    path, line = _split_chatgpt_id(id)
    document = KnowledgeStore(_root()).read_text(path, max_chars=50000)
    text = str(document.get("content", ""))
    return {
        "id": _chatgpt_document_id(path, line),
        "title": _chatgpt_title(path, text),
        "text": text,
        "url": _chatgpt_url(path, line),
        "metadata": {
            "path": path,
            "source": "memroos",
            "truncated": bool(document.get("truncated", False)),
        },
    }


@_mcp_tool
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
        results = response.json().get("results", [])
        enriched = []
        for item in results:
            if isinstance(item, dict):
                result = dict(item)
                result.setdefault("metadata", extract_metadata(item))
                result["provenance"] = provenance_label(item)
                enriched.append(result)
            else:
                enriched.append({"memory": str(item), "metadata": {}, "provenance": "source: unknown"})
        return {"status": "ok", "results": enriched}
    except Exception as exc:
        return {"status": "unavailable", "error": str(exc), "results": []}


@_mcp_tool
def memory_save(text: str, agent_id: str = "shared", metadata: Optional[dict] = None) -> dict:
    """Save a durable memory through the configured memory adapter."""
    if httpx is None:
        return {"status": "unavailable", "error": "httpx is not installed"}
    try:
        response = httpx.post(
            f"{_mem0_url()}/memory/add",
            json={
                "text": text,
                "agent_id": agent_id,
                "metadata": normalize_metadata(
                    metadata,
                    agent_id=agent_id,
                    default_source="knowledge-mcp",
                ),
            },
            timeout=10,
        )
        response.raise_for_status()
        return {"status": "ok", "response": response.json()}
    except Exception as exc:
        return {"status": "unavailable", "error": str(exc)}


@_mcp_tool
def agent_memory_save(
    content: str,
    type: str = "episodic",
    metadata: Optional[dict] = None,
    agent_id: Optional[str] = None,
) -> dict:
    """Save memory through the MemroOS app so agent registry policy and audit rows are applied."""
    resolved_agent_id = _memroos_agent_id(agent_id)
    return _post_memroos_agent_api(
        "/api/memory/add",
        {
            "agentId": resolved_agent_id,
            "content": content,
            "text": content,
            "type": type,
            "metadata": normalize_metadata(
                metadata,
                agent_id=resolved_agent_id,
                default_source="multica-agent",
            ),
        },
    )


@_mcp_tool
def agent_context_send(
    to_agent: str,
    body: str,
    from_agent: Optional[str] = None,
    subject: str = "",
    message_type: str = "message",
    thread_id: str = "",
    correlation_id: str = "",
    context_refs: Optional[list] = None,
    artifacts: Optional[dict] = None,
    priority: int = 5,
    reply_required: bool = False,
    save_to_memory: bool = False,
    wait_for_reply_ms: int = 0,
) -> dict:
    """Send a durable MemRoOS agent-context message, optionally waiting briefly for a reply."""
    resolved_agent_id = _memroos_agent_id(from_agent)
    payload = {
        "agentId": resolved_agent_id,
        "fromAgent": resolved_agent_id,
        "toAgent": to_agent,
        "body": body,
        "subject": subject,
        "messageType": message_type,
        "threadId": thread_id or None,
        "correlationId": correlation_id or None,
        "contextRefs": context_refs or [],
        "artifacts": artifacts or {},
        "priority": priority,
        "replyRequired": reply_required,
        "saveToMemory": save_to_memory,
    }
    result = _post_memroos_agent_api("/api/agent-context/messages", payload)
    if result.get("status") != "ok" or wait_for_reply_ms <= 0:
        return result

    message = result.get("response", {}).get("message", {})
    message_id = message.get("id") if isinstance(message, dict) else None
    if not message_id:
        return result

    reply = _get_memroos_agent_api(
        f"/api/agent-context/messages/{message_id}",
        params={"agent": resolved_agent_id, "wait_for": "reply", "wait_ms": wait_for_reply_ms},
        timeout=max(10, int(wait_for_reply_ms / 1000) + 2),
    )
    return {"status": result["status"], "response": result.get("response"), "reply": reply}


@_mcp_tool
def agent_context_inbox(
    agent_id: Optional[str] = None,
    status: str = "pending",
    box: str = "inbox",
    limit: int = 20,
) -> dict:
    """List durable MemRoOS agent-context messages for the configured agent."""
    resolved_agent_id = _memroos_agent_id(agent_id)
    return _get_memroos_agent_api(
        "/api/agent-context/messages",
        params={"agent": resolved_agent_id, "status": status, "box": box, "limit": limit},
    )


@_mcp_tool
def agent_context_reply(
    message_id: str,
    body: str,
    from_agent: Optional[str] = None,
    subject: str = "",
    context_refs: Optional[list] = None,
    artifacts: Optional[dict] = None,
    priority: int = 5,
    save_to_memory: bool = False,
) -> dict:
    """Reply to a MemRoOS agent-context message in the original thread."""
    resolved_agent_id = _memroos_agent_id(from_agent)
    return _post_memroos_agent_api(
        f"/api/agent-context/messages/{message_id}/reply",
        {
            "agentId": resolved_agent_id,
            "fromAgent": resolved_agent_id,
            "body": body,
            "subject": subject,
            "contextRefs": context_refs or [],
            "artifacts": artifacts or {},
            "priority": priority,
            "saveToMemory": save_to_memory,
        },
    )


@_mcp_tool
def agent_context_ack(message_id: str, agent_id: Optional[str] = None) -> dict:
    """Acknowledge delivery of a MemRoOS agent-context message addressed to this agent."""
    resolved_agent_id = _memroos_agent_id(agent_id)
    return _post_memroos_agent_api(
        f"/api/agent-context/messages/{message_id}/ack",
        {"agentId": resolved_agent_id},
    )


@_mcp_tool
def agent_tool_outcome_record(
    tool_id: str,
    outcome: str,
    task: str = "",
    metadata: Optional[dict] = None,
    agent_id: Optional[str] = None,
) -> dict:
    """Record an authenticated tool outcome through MemroOS for agent/tool auditing."""
    resolved_agent_id = _memroos_agent_id(agent_id)
    return _post_memroos_agent_api(
        "/api/tool-attention/record",
        {
            "agentId": resolved_agent_id,
            "toolId": tool_id,
            "task": task,
            "outcome": outcome,
            "metadata": {
                **(metadata or {}),
                "source": "multica",
            },
        },
    )


# ---------------------------------------------------------------------------
# Progressive tool gateway
# ---------------------------------------------------------------------------


@_mcp_tool
def tool_catalog() -> dict:
    """Return the progressive tool/capability catalog."""
    return tool_attention.build_catalog()


@_mcp_tool
def tool_discover(query: str = "", limit: int = 25) -> dict:
    """Find relevant MCP servers, workspaces, skills, and references for a task."""
    return tool_attention.discover(query=query, limit=limit)


@_mcp_tool
def tool_load(capability_id: str) -> dict:
    """Load instructions for one discovered capability by id."""
    return tool_attention.load_capability(capability_id)


@_mcp_tool
def tool_record_outcome(
    tool_id: str,
    task: str,
    outcome: str,
    metadata: Optional[dict] = None,
) -> dict:
    """Record whether a selected tool helped so future discovery can improve.

    Also runs the knowledge storage policy check — warns (but does not block)
    when Artyfacts is used for durable knowledge storage instead of research.
    """
    return tool_attention.record_outcome_with_policy_check(
        tool_id=tool_id,
        task=task,
        outcome=outcome,
        metadata=metadata,
    )


@_mcp_tool
def knowledge_policy_check(
    tool_id: str,
    task: str = "",
    metadata: Optional[dict] = None,
) -> dict:
    """Check if a tool use complies with the knowledge storage policy.

    Use BEFORE calling Artyfacts knowledge tools to verify the use case is
    research-grade (acceptable) vs durable storage (deprecated).

    Returns a warning with corrective_action when Artyfacts is being used
    inappropriately. Does NOT block — purely advisory for agent self-correction.
    """
    return tool_attention.check_knowledge_storage_policy(
        tool_id=tool_id,
        task=task,
        metadata=metadata,
    )


@_mcp_tool
def tool_stats() -> dict:
    """Return compact progressive tool gateway health and usage stats."""
    return tool_attention.stats()


@_mcp_tool
def mcp_tool_contract() -> dict:
    """Return the MemRoOS MCP tool schema/export contract."""
    return build_mcp_tool_contract()


# ---------------------------------------------------------------------------
# Progressive disclosure meta-tools
# ---------------------------------------------------------------------------


@_mcp_tool
def knowledge_capabilities(workspace: Optional[str] = None) -> dict:
    """Show core capabilities or a deeper workspace manifest."""
    return get_capabilities(workspace)


@_mcp_tool
def knowledge_open_workspace(workspace: str) -> dict:
    """Open a deeper capability workspace for the current task."""
    return open_workspace(workspace)


@_mcp_tool
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
    if workspace == "vector":
        limit = max(1, min(int(args.get("limit", 5)), 50))
        collection = str(args.get("collection", "")).strip()
        qmd_args: list[str]
        if action in {"search", "query", "vector_search"}:
            query = str(args.get("query", "")).strip()
            if not query:
                return {"status": "error", "error": "query is required"}
            command = "query" if action == "query" else "search"
            qmd_args = [command, query, "-n", str(limit), "--json"]
            if collection:
                qmd_args.extend(["-c", collection])
            return _qmd_json(qmd_args)
        if action in {"vsearch", "semantic_search"}:
            query = str(args.get("query", "")).strip()
            if not query:
                return {"status": "error", "error": "query is required"}
            qmd_args = ["vsearch", query, "-n", str(limit), "--json"]
            if collection:
                qmd_args.extend(["-c", collection])
            return _qmd_json(qmd_args)
        if action in {"status", "index_status"}:
            return _qmd_run(["status"])
        if action == "ls":
            target = str(args.get("target", collection)).strip()
            return _qmd_run(["ls", target] if target else ["ls"])
        if action == "get":
            document = str(args.get("document", args.get("file", ""))).strip()
            if not document:
                return {"status": "error", "error": "document is required"}
            lines = int(args.get("lines", 80))
            return _qmd_run(["get", document, "-l", str(max(1, min(lines, 1000)))])
        if action == "update":
            return _qmd_run(["update"], timeout=300)
        if action == "embed":
            qmd_args = ["embed"]
            if collection:
                qmd_args.extend(["-c", collection])
            if bool(args.get("force", False)):
                qmd_args.append("-f")
            return _qmd_run(qmd_args, timeout=600)
        return {
            "status": "unsupported_action",
            "workspace": workspace,
            "action": action,
            "capabilities": get_capabilities(workspace),
        }
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
    if workspace == "skill-packs":
        if action == "catalog":
            skills_by_name: dict[str, dict] = {}

            # Walk public skills dir
            public_root = _skills_root_public()
            if public_root.exists():
                for skill_dir in sorted(public_root.iterdir()):
                    if not skill_dir.is_dir():
                        continue
                    skill_md = skill_dir / "SKILL.md"
                    if not skill_md.exists():
                        continue
                    try:
                        content = skill_md.read_text(errors="replace")
                    except Exception:  # noqa: BLE001
                        continue
                    entry = _parse_skill_frontmatter(content, fallback_name=skill_dir.name)
                    skills_by_name[entry["name"]] = entry

            # Walk private skills dir (private overrides public on same name)
            private_root = _skills_root_private()
            if private_root.exists():
                for skill_dir in sorted(private_root.iterdir()):
                    if not skill_dir.is_dir():
                        continue
                    skill_md = skill_dir / "SKILL.md"
                    if not skill_md.exists():
                        continue
                    try:
                        content = skill_md.read_text(errors="replace")
                    except Exception:  # noqa: BLE001
                        continue
                    entry = _parse_skill_frontmatter(content, fallback_name=skill_dir.name)
                    skills_by_name[entry["name"]] = entry

            skills = list(skills_by_name.values())

            # Apply filter
            if args.get("filter") == "auto-load":
                skills = [s for s in skills if s.get("auto_load") is True]

            return {"status": "ok", "skills": skills, "count": len(skills)}

        elif action == "read":
            name = args.get("name", "")
            if not name:
                return {"status": "error", "message": "name is required"}

            # Check private first, then public — path-traversal safe
            for root_dir in (_skills_root_private(), _skills_root_public()):
                safe_path = _safe_skill_path(root_dir, name)
                if safe_path is None:
                    return {"status": "error", "message": "invalid skill name"}
                if safe_path.exists():
                    try:
                        content = safe_path.read_text(errors="replace")
                        return {"status": "ok", "name": name, "content": content}
                    except Exception:  # noqa: BLE001
                        pass

            return {
                "status": "not_found",
                "name": name,
                "message": "Skill not found in public or private directories",
            }

        elif action == "install":
            return {
                "status": "ok",
                "message": (
                    "Skills are served as content, not installed as files. "
                    "Use action='read' to retrieve a skill's content, then store it "
                    "in your agent's runtime directory or inline it directly."
                ),
            }

        else:
            return {"status": "unsupported_action", "workspace": "skill-packs", "action": action}

    if workspace in {"ingestion", "workflows", "integrations", "primitives"}:
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
    if workspace == "write":
        if action in {"write", "create", "update"}:
            return knowledge_write(
                path=str(args.get("path", args.get("file", ""))),
                content=str(args.get("content", args.get("text", ""))),
                agent_id=str(args.get("agent_id", args.get("agentId", "unknown"))),
                role=str(args.get("role", "agent")),
                append=bool(args.get("append", False)),
                require_frontmatter=bool(args.get("require_frontmatter", False)),
                auto_commit=bool(args.get("auto_commit", True)),
                commit_message=str(args.get("commit_message", "")),
            )
        if action == "delete":
            return knowledge_delete(
                path=str(args.get("path", args.get("file", ""))),
                agent_id=str(args.get("agent_id", args.get("agentId", "unknown"))),
                role=str(args.get("role", "agent")),
                auto_commit=bool(args.get("auto_commit", True)),
            )
        if action in {"ensure_dir", "mkdir"}:
            return knowledge_ensure_dir(
                path=str(args.get("path", args.get("dir", ""))),
            )
        if action in {"git_status", "status"}:
            return knowledge_git_status()
        if action in {"git_commit", "commit"}:
            return knowledge_git_commit(
                message=str(args.get("message", args.get("commit_message", ""))),
                agent_id=str(args.get("agent_id", args.get("agentId", "unknown"))),
                paths=args.get("paths") if isinstance(args.get("paths"), list) else None,
            )
        return {
            "status": "unsupported_action",
            "workspace": workspace,
            "action": action,
            "capabilities": get_capabilities(workspace),
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


@mcp.resource("mcp://tools/contract")
def mcp_tool_contract_resource() -> dict:
    """Machine-readable MemRoOS MCP tool contract."""
    return _mcp_tool_contract_resource_payload()


@mcp.prompt()
def knowledge_system_orientation() -> str:
    """Prompt that tells an agent how to use the knowledge system safely."""
    return (
        "Use the memroos MCP server as one progressive facade with progressive disclosure. "
        "Start with core tools: health, manifest, search, read, memory_search, memory_save. "
        "If a task needs deeper capability, call knowledge_capabilities or knowledge_open_workspace. "
        "Use knowledge_workspace_call for deep actions like wiki compile. "
        "Available workspaces: wiki, vector, agent-memory, admin, graph, dashboard, ingestion, workflows, skill-packs, integrations, primitives, tool-attention. "
        "Treat source files as authoritative and generated wiki pages as compiled views with citations. "
        "Operators can add private context sources (e.g., meet-recordings via Circleback) by creating ~/.memroos/context-sources.local.json — see context-sources.local.json.example at repo root."
    )


def run_server() -> None:
    """Run the MCP server using env-selected stdio, SSE, or Streamable HTTP transport."""
    try:
        mcp.run(transport=_server_transport())
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    except (BrokenPipeError, ConnectionResetError):
        pass  # client disconnected cleanly
    except BaseException as exc:  # noqa: BLE001
        # anyio wraps TaskGroup errors in ExceptionGroup (Python 3.11+);
        # exit quietly if the group contains only pipe/connection errors.
        excs = getattr(exc, "exceptions", None)
        if excs is not None and all(
            isinstance(e, (BrokenPipeError, ConnectionResetError, OSError)) for e in excs
        ):
            return
        raise


if __name__ == "__main__":
    run_server()
