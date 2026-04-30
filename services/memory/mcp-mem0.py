#!/usr/bin/env python3
"""
MCP server for mem0 agent memory.
Exposes memory_save, memory_search, memory_get_all, memory_health tools.
Wraps the mem0 HTTP API running on localhost:3201.
Falls back to SQLite queue when server is down (replays on recovery).
"""

import sys
import os
import json
import logging
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import httpx
from mcp.server.fastmcp import FastMCP
from mem0_queue import Mem0Queue

MEM0_URL = "http://localhost:3201"

# ---------------------------------------------------------------------------
# Logging Setup
# ---------------------------------------------------------------------------

LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stderr),
        logging.FileHandler(LOG_DIR / "mcp-mem0.log")
    ]
)
logger = logging.getLogger("mcp-mem0")

# Failure log for MCP-level errors
failure_logger = logging.getLogger("mcp-failures")
failure_logger.setLevel(logging.ERROR)
failure_handler = logging.FileHandler(LOG_DIR / "mcp-failures.log")
failure_handler.setFormatter(logging.Formatter(
    '%(asctime)s - %(levelname)s - %(message)s'
))
failure_logger.addHandler(failure_handler)

mcp = FastMCP("mem0-memory")

_queue = Mem0Queue(db_path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs/queue.db"))


def log_failure(error_type: str, details: dict, exc: Exception = None):
    """Log a structured failure for later investigation."""
    record = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "error_type": error_type,
        "details": details,
    }
    if exc:
        record["exception"] = str(exc)

    failure_logger.error(json.dumps(record))
    logger.error(f"[{error_type}] {details} - {exc}")


def check_server_health() -> dict:
    """Check if mem0 server is healthy."""
    try:
        r = httpx.get(f"{MEM0_URL}/health", timeout=5)
        data = r.json()
        return {
            "up": True,
            "status": data.get("status", "unknown"),
            "qdrant": data.get("qdrant", "unknown"),
            "disk": data.get("disk", {}),
            "sqlite": data.get("sqlite", {})
        }
    except Exception as e:
        return {"up": False, "error": str(e)}


@mcp.tool()
def memory_save(text: str, agent_id: str = "shared") -> str:
    """
    Save something worth remembering to long-term memory.
    Call this when you learn a fact, preference, decision, or context
    that would be useful to you or other agents in future sessions.
    agent_id identifies who the memory belongs to (e.g. 'gwen', 'ceo', 'shared').
    """
    # Pre-check server health
    health = check_server_health()

    if not health["up"]:
        # Server is down - queue the request
        _queue._add_to_queue("/memory/add", "POST", {"text": text, "agent_id": agent_id})
        qs = _queue.get_queue_status()
        log_failure("server_down", {"agent_id": agent_id, "text_preview": text[:50]})
        return f"Queued (mem0 offline). {qs['queued']} pending saves — will auto-replay when server recovers."

    # Check for degraded conditions
    warnings = []
    if health.get("disk", {}).get("critical"):
        warnings.append("⚠️ Disk critical - save may fail")
    if health.get("sqlite", {}).get("status") == "readonly":
        warnings.append("⚠️ SQLite readonly - save will fail")

    try:
        r = httpx.post(
            f"{MEM0_URL}/memory/add",
            json={"text": text, "agent_id": agent_id},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        logger.info(f"Saved memory for {agent_id}: {text[:50]}...")

        result = f"Saved. Status: {data.get('status', 'ok')}"
        if warnings:
            result += "\n" + "\n".join(warnings)
        return result

    except httpx.HTTPStatusError as e:
        # Server returned an error
        try:
            error_detail = e.response.json()
        except:
            error_detail = {"detail": str(e)}

        log_failure("save_failed", {
            "agent_id": agent_id,
            "text_preview": text[:50],
            "status_code": e.response.status_code,
            "error": error_detail
        }, e)

        return f"Error saving memory (HTTP {e.response.status_code}): {error_detail.get('detail', str(e))}"

    except (httpx.ConnectError, httpx.TimeoutException) as e:
        # Server became unavailable
        _queue._add_to_queue("/memory/add", "POST", {"text": text, "agent_id": agent_id})
        qs = _queue.get_queue_status()
        log_failure("connection_lost", {"agent_id": agent_id, "text_preview": text[:50]}, e)
        return f"Queued (connection lost). {qs['queued']} pending saves — will auto-replay when server recovers."

    except Exception as e:
        log_failure("unexpected_error", {"agent_id": agent_id, "text_preview": text[:50]}, e)
        return f"Error saving memory: {e}"


@mcp.tool()
def memory_search(query: str, agent_id: str = "", limit: int = 5) -> str:
    """
    Search long-term memory for relevant context.
    Call this at the start of a task to recall relevant facts, past decisions,
    user preferences, or prior work. Returns semantically similar memories.
    Leave agent_id empty to search across all agents.
    """
    try:
        params: dict = {"q": query, "limit": limit}
        if agent_id:
            params["agent_id"] = agent_id
        r = httpx.get(f"{MEM0_URL}/memory/search", params=params, timeout=30)
        r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            return "No relevant memories found."
        lines = []
        for i, m in enumerate(results, 1):
            mem_text = m.get("memory", m.get("text", str(m)))
            score = m.get("score", "")
            score_str = f" (relevance: {score:.2f})" if isinstance(score, float) else ""
            lines.append(f"{i}. {mem_text}{score_str}")
        return "\n".join(lines)

    except httpx.HTTPStatusError as e:
        try:
            error_detail = e.response.json()
        except:
            error_detail = {"detail": str(e)}
        log_failure("search_failed", {"query": query[:50], "agent_id": agent_id, "status_code": e.response.status_code}, e)
        return f"Error searching memory (HTTP {e.response.status_code}): {error_detail.get('detail', str(e))}"

    except (httpx.ConnectError, httpx.TimeoutException) as e:
        log_failure("search_server_down", {"query": query[:50], "agent_id": agent_id}, e)
        return f"Error searching memory: Server unavailable. Check with memory_health."

    except Exception as e:
        log_failure("search_unexpected", {"query": query[:50], "agent_id": agent_id}, e)
        return f"Error searching memory: {e}"


@mcp.tool()
def memory_get_all(agent_id: str = "shared") -> str:
    """
    Retrieve all memories stored for a given agent.
    Useful for getting full context at session start.
    """
    try:
        r = httpx.get(
            f"{MEM0_URL}/memory/all", params={"agent_id": agent_id}, timeout=30
        )
        r.raise_for_status()
        memories = r.json().get("memories", [])
        if not memories:
            return f"No memories found for agent '{agent_id}'."
        lines = [f"Memories for '{agent_id}' ({len(memories)} total):"]
        for i, m in enumerate(memories, 1):
            mem_text = m.get("memory", m.get("text", str(m)))
            lines.append(f"{i}. {mem_text}")
        return "\n".join(lines)

    except httpx.HTTPStatusError as e:
        try:
            error_detail = e.response.json()
        except:
            error_detail = {"detail": str(e)}
        log_failure("get_all_failed", {"agent_id": agent_id, "status_code": e.response.status_code}, e)
        return f"Error retrieving memories (HTTP {e.response.status_code}): {error_detail.get('detail', str(e))}"

    except (httpx.ConnectError, httpx.TimeoutException) as e:
        log_failure("get_all_server_down", {"agent_id": agent_id}, e)
        return f"Error retrieving memories: Server unavailable. Check with memory_health."

    except Exception as e:
        log_failure("get_all_unexpected", {"agent_id": agent_id}, e)
        return f"Error retrieving memories: {e}"


@mcp.tool()
def memory_health() -> str:
    """
    Check health of the memory stack (mem0 server + Qdrant vector DB).
    Returns status of each component and number of queued saves pending replay.
    Call this to verify memory services are running before relying on them.
    """
    health = check_server_health()

    if not health["up"]:
        mem0_status = f"DOWN ({health.get('error', 'unknown')})"
        qdrant_status = "unknown"
        disk_status = "unknown"
        sqlite_status = "unknown"
    else:
        mem0_status = health.get("status", "unknown")
        qdrant_status = health.get("qdrant", "unknown")
        disk = health.get("disk", {})
        disk_status = f"{disk.get('percent_used', '?')}% used, {disk.get('free_gb', '?')}GB free"
        if disk.get("critical"):
            disk_status += " ⚠️ CRITICAL"
        elif disk.get("warning"):
            disk_status += " ⚠️ WARNING"
        sqlite = health.get("sqlite", {})
        sqlite_status = sqlite.get("status", "unknown")
        if sqlite_status != "healthy":
            sqlite_status += f" ⚠️ ({sqlite.get('error', '')})"

    qs = _queue.get_queue_status()
    queued = qs.get("queued", 0)
    oldest = qs.get("oldest", "none")

    lines = [
        f"mem0 server : {mem0_status}",
        f"qdrant      : {qdrant_status}",
        f"disk        : {disk_status}",
        f"sqlite      : {sqlite_status}",
        f"queued saves: {queued}" + (f" (oldest: {oldest})" if queued else ""),
    ]
    return "\n".join(lines)


@mcp.tool()
def memory_failures(limit: int = 10) -> str:
    """
    Get recent failures from the failure logs.
    Useful for debugging memory issues.
    """
    failures = []

    # Check server failures
    try:
        r = httpx.get(f"{MEM0_URL}/failures", params={"limit": limit}, timeout=10)
        if r.status_code == 200:
            server_failures = r.json().get("failures", [])
            for f in server_failures:
                f["source"] = "server"
                failures.append(f)
    except:
        pass

    # Check MCP failures
    mcp_failure_file = LOG_DIR / "mcp-failures.log"
    if mcp_failure_file.exists():
        try:
            with open(mcp_failure_file, "r") as f:
                lines = f.readlines()[-limit:]
            for line in lines:
                try:
                    if " - {" in line:
                        json_part = line.split(" - ", 2)[-1]
                        record = json.loads(json_part)
                        record["source"] = "mcp"
                        failures.append(record)
                except:
                    pass
        except:
            pass

    if not failures:
        return "No recent failures found."

    lines = [f"Recent failures ({len(failures)} total):"]
    for i, f in enumerate(failures[:limit], 1):
        lines.append(f"{i}. [{f.get('source', '?')}] {f.get('error_type', 'unknown')}: {f.get('details', {})}")

    return "\n".join(lines)


if __name__ == "__main__":
    mcp.run()
