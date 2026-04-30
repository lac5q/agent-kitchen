"""
Mem0 FastAPI server — agent memory backed by Qdrant vector store.
Run with: uvicorn mem0-server:app --host 0.0.0.0 --port 3201
"""

import os
import sys
import yaml
import json
import logging
import traceback
import shutil
from datetime import datetime
from typing import Any, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
try:
    from qdrant_client import QdrantClient
    QDRANT_AVAILABLE = True
except ImportError:
    QDRANT_AVAILABLE = False

# ---------------------------------------------------------------------------
# Logging Setup
# ---------------------------------------------------------------------------

LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

# Main server log
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / "mem0-server.log")
    ]
)
logger = logging.getLogger("mem0-server")

# Failure log - separate file for errors that need investigation
failure_logger = logging.getLogger("mem0-failures")
failure_logger.setLevel(logging.ERROR)
failure_handler = logging.FileHandler(LOG_DIR / "failures.log")
failure_handler.setFormatter(logging.Formatter(
    '%(asctime)s | %(levelname)s | %(message)s'
))
failure_logger.addHandler(failure_handler)

app = FastAPI(title="Mem0 Agent Memory Service", version="1.2.0")

# ---------------------------------------------------------------------------
# Config & initialisation
# ---------------------------------------------------------------------------

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "mem0-config.yaml")

def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def build_mem0_config(cfg: dict) -> dict:
    """Convert YAML config to the dict format mem0 Memory() expects."""
    mem0_cfg: dict = {}

    vc = cfg.get("vector_store", {})
    if vc:
        vc_config = dict(vc.get("config", {}))
        key_env = vc_config.pop("api_key_env", None)
        if key_env:
            api_key = os.environ.get(key_env, "")
            if api_key:
                vc_config["api_key"] = api_key
        mem0_cfg["vector_store"] = {
            "provider": vc["provider"],
            "config": vc_config,
        }

    llm = cfg.get("llm", {})
    if llm:
        llm_config = dict(llm.get("config", {}))
        key_env = llm_config.pop("api_key_env", None)
        if key_env:
            api_key = os.environ.get(key_env, "")
            if api_key:
                llm_config["api_key"] = api_key
        mem0_cfg["llm"] = {"provider": llm["provider"], "config": llm_config}

    embedder = cfg.get("embedder", {})
    if embedder:
        emb_config = dict(embedder.get("config", {}))
        key_env = emb_config.pop("api_key_env", None)
        if key_env:
            api_key = os.environ.get(key_env, "")
            if api_key:
                emb_config["api_key"] = api_key
        mem0_cfg["embedder"] = {
            "provider": embedder["provider"],
            "config": emb_config,
        }

    return mem0_cfg


# Lazily initialised — with Qdrant resilience
_memory = None
_init_error = None
_last_init_attempt = 0
_INIT_COOLDOWN = 15  # seconds before retrying init after failure


def reset_memory():
    """Force-recreate the Memory instance. Use after Qdrant comes back."""
    global _memory, _init_error
    logger.info("Resetting Mem0 Memory instance (Qdrant recovery)")
    _memory = None
    _init_error = None


def get_memory(force_reset: bool = False):
    """
    Lazily initialise Mem0 Memory with Qdrant resilience.

    - On first call: initialise normally.
    - On Qdrant connection error: try to reset and re-initialise once.
    - On repeated failure: cache the error and raise immediately (15s cooldown).
    """
    global _memory, _init_error, _last_init_attempt
    import time

    if force_reset:
        reset_memory()

    if _memory is None:
        now = time.time()
        if _init_error and (now - _last_init_attempt) < _INIT_COOLDOWN:
            raise _init_error

        try:
            from mem0 import Memory
            cfg = load_config()
            mem0_cfg = build_mem0_config(cfg)
            _memory = Memory.from_config(mem0_cfg)
            _init_error = None
            logger.info("Mem0 Memory initialized successfully")
        except Exception as e:
            _init_error = e
            _last_init_attempt = now
            logger.error(f"Failed to initialize Mem0: {e}")
            raise

    # Verify we can actually reach Qdrant before returning the client
    try:
        _memory.search("__health_check__", user_id="__internal__", limit=1)
    except Exception as qe:
        logger.warning(f"Qdrant unreachable, attempting reset: {qe}")
        reset_memory()
        try:
            from mem0 import Memory
            cfg = load_config()
            mem0_cfg = build_mem0_config(cfg)
            _memory = Memory.from_config(mem0_cfg)
            _init_error = None
            logger.info("Mem0 Memory re-initialized after Qdrant reset")
        except Exception as reinit_err:
            _init_error = reinit_err
            _last_init_attempt = time.time()
            raise

    return _memory


def log_failure(error_type: str, details: dict, exc: Exception = None):
    """Log a structured failure for later investigation."""
    record = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "error_type": error_type,
        "details": details,
    }
    if exc:
        record["exception"] = str(exc)
        record["traceback"] = traceback.format_exc()

    failure_logger.error(json.dumps(record))
    logger.error(f"[{error_type}] {details} - {exc}")


def check_disk_space(path: str = "~") -> dict:
    """Check disk space and return status."""
    try:
        usage = shutil.disk_usage(os.path.expanduser(path))
        percent_used = (usage.used / usage.total) * 100
        gb_free = usage.free / (1024**3)
        return {
            "total_gb": round(usage.total / (1024**3), 1),
            "used_gb": round(usage.used / (1024**3), 1),
            "free_gb": round(gb_free, 1),
            "percent_used": round(percent_used, 1),
            "critical": percent_used > 95 or gb_free < 10,
            "warning": percent_used > 90 or gb_free < 20,
        }
    except Exception as e:
        return {"error": str(e), "critical": True}


def check_sqlite_db(db_path: str = "~/.mem0/history.db") -> dict:
    """Check SQLite database health."""
    import sqlite3
    result = {"path": db_path, "status": "unknown"}

    try:
        full_path = os.path.expanduser(db_path)
        if not os.path.exists(full_path):
            return {"status": "not_found", "error": "Database file does not exist"}

        # Check if writable
        if not os.access(full_path, os.W_OK):
            result["status"] = "readonly"
            result["error"] = "Database file is not writable"
            return result

        # Check integrity
        conn = sqlite3.connect(full_path)
        cursor = conn.execute("PRAGMA integrity_check")
        integrity = cursor.fetchone()[0]
        conn.close()

        if integrity == "ok":
            result["status"] = "healthy"
        else:
            result["status"] = "corrupt"
            result["error"] = integrity

    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)

    return result


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AddMemoryRequest(BaseModel):
    text: str
    agent_id: str
    metadata: Optional[dict[str, Any]] = None


class AddMemoryResponse(BaseModel):
    status: str
    result: Any


class SearchResponse(BaseModel):
    results: list[Any]


class AllMemoriesResponse(BaseModel):
    memories: list[Any]


class DeleteResponse(BaseModel):
    status: str


class HealthResponse(BaseModel):
    status: str
    vector_store: str
    disk: Optional[dict] = None
    sqlite: Optional[dict] = None


class FailureEntry(BaseModel):
    local_time: Optional[str] = None  # "Mar 28 07:32:00 PDT"
    relative_time: Optional[str] = None  # "2 hours ago"
    time_utc: Optional[str] = None  # ISO UTC timestamp
    error_type: Optional[str] = None
    details: Optional[dict] = None
    exception: Optional[str] = None
    traceback: Optional[str] = None
    raw: Optional[str] = None  # for unparseable lines


class FailureLogResponse(BaseModel):
    failures: list[dict]      # raw for backward compat
    enriched: list[FailureEntry]
    count: int
    oldest: Optional[str] = None  # local time of oldest
    newest: Optional[str] = None  # local time of newest
    time_range: Optional[str] = None  # "Mar 28 07:17 — Mar 28 12:23"


# ---------------------------------------------------------------------------
# Exception Handler
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions and log them properly."""
    error_id = datetime.utcnow().strftime("%Y%m%d%H%M%S")

    log_failure(
        "unhandled_exception",
        {
            "error_id": error_id,
            "path": str(request.url),
            "method": request.method,
        },
        exc
    )

    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "error_id": error_id,
            "detail": str(exc),
            "message": "An unexpected error occurred. Check failures.log for details."
        }
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/memory/add", response_model=AddMemoryResponse)
def add_memory(req: AddMemoryRequest):
    """Store a new memory for an agent."""
    try:
        mem = get_memory()
        result = mem.add(
            req.text,
            user_id=req.agent_id,
            metadata=req.metadata or {},
        )
        logger.info(f"Memory added for agent {req.agent_id}: {req.text[:50]}...")
        return AddMemoryResponse(status="ok", result=result)
    except Exception as exc:
        log_failure(
            "memory_add_failed",
            {"agent_id": req.agent_id, "text_preview": req.text[:100]},
            exc
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/memory/search", response_model=SearchResponse)
def search_memory(
    q: str = Query(..., description="Search query"),
    agent_id: Optional[str] = Query(None, description="Filter by agent ID"),
    limit: int = Query(5, ge=1, le=100, description="Max results to return"),
):
    """Search memories by semantic similarity."""
    try:
        mem = get_memory()
        kwargs: dict[str, Any] = {"limit": limit}
        kwargs["user_id"] = agent_id if agent_id else "shared"
        results = mem.search(q, **kwargs)
        if isinstance(results, dict):
            results = results.get("results", results)
        logger.debug(f"Search '{q[:30]}...' for {agent_id}: {len(results) if isinstance(results, list) else 1} results")
        return SearchResponse(results=results if isinstance(results, list) else [results])
    except Exception as exc:
        log_failure(
            "memory_search_failed",
            {"query": q[:50], "agent_id": agent_id},
            exc
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/memory/all", response_model=AllMemoriesResponse)
def get_all_memories(
    agent_id: str = Query(..., description="Agent ID to fetch memories for"),
):
    """Retrieve all memories for a given agent."""
    try:
        mem = get_memory()
        memories = mem.get_all(user_id=agent_id)
        if isinstance(memories, dict):
            memories = memories.get("results", memories)
        logger.debug(f"Retrieved {len(memories) if isinstance(memories, list) else 1} memories for {agent_id}")
        return AllMemoriesResponse(
            memories=memories if isinstance(memories, list) else [memories]
        )
    except Exception as exc:
        log_failure(
            "memory_get_all_failed",
            {"agent_id": agent_id},
            exc
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/memory/reset")
def reset_memory_endpoint():
    """Force-reset the Mem0 Memory instance (use after Qdrant restart)."""
    reset_memory()
    return {"status": "reset", "message": "Memory instance has been recreated"}


@app.delete("/memory/{memory_id}", response_model=DeleteResponse)
def delete_memory(memory_id: str):
    """Delete a specific memory by ID."""
    try:
        mem = get_memory()
        mem.delete(memory_id)
        logger.info(f"Memory deleted: {memory_id}")
        return DeleteResponse(status="deleted")
    except Exception as exc:
        log_failure(
            "memory_delete_failed",
            {"memory_id": memory_id},
            exc
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/health", response_model=HealthResponse)
def health():
    """Health check — verifies vector store connectivity, disk space, and SQLite."""
    cfg = load_config()
    vector_provider = cfg.get("vector_store", {}).get("provider", "unknown")
    vector_cfg = cfg.get("vector_store", {}).get("config", {})

    vector_status = "unknown"
    if vector_provider == "qdrant" and QDRANT_AVAILABLE:
        try:
            url = vector_cfg.get("url")
            api_key_env = vector_cfg.get("api_key_env")
            api_key = vector_cfg.get("api_key") or (os.environ.get(api_key_env) if api_key_env else None)
            if url:
                client = QdrantClient(url=url, api_key=api_key, timeout=5)
            else:
                host = vector_cfg.get("host", "localhost")
                port = vector_cfg.get("port", 6333)
                client = QdrantClient(host=host, port=port, timeout=2)
            client.get_collections()
            vector_status = "connected"
        except Exception as e:
            logger.warning(f"Qdrant health check failed: {e}")
            vector_status = "disconnected"
    elif vector_provider == "chroma":
        # Chroma is embedded — if the server is running at all, it's healthy
        try:
            import chromadb
            vector_status = "connected"
        except Exception as e:
            logger.warning(f"Chroma health check failed: {e}")
            vector_status = "disconnected"
    else:
        # Unknown provider — assume healthy if no exception thrown during init
        vector_status = "unknown"

    disk_status = check_disk_space()
    sqlite_status = check_sqlite_db()

    # Log warnings for concerning states
    if disk_status.get("critical"):
        log_failure("disk_critical", disk_status)
    elif disk_status.get("warning"):
        logger.warning(f"Disk space warning: {disk_status}")

    if sqlite_status.get("status") != "healthy":
        log_failure("sqlite_unhealthy", sqlite_status)

    is_ok = (vector_status == "connected" or vector_status == "unknown") and not disk_status.get("critical")
    return HealthResponse(
        status="ok" if is_ok else "degraded",
        vector_store=vector_status,
        disk=disk_status,
        sqlite=sqlite_status
    )


def _enrich_failure(failure: dict) -> dict:
    """Add local time and relative time to a failure record."""
    ts_str = failure.get("timestamp", "")
    try:
        dt_utc = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        dt_local = dt_utc.astimezone()  # local timezone

        # Relative time
        now = datetime.now(dt_local.tzinfo)
        delta = now - dt_utc
        if delta.days > 0:
            rel = f"{delta.days}d ago"
        elif delta.seconds >= 3600:
            rel = f"{delta.seconds // 3600}h ago"
        elif delta.seconds >= 60:
            rel = f"{delta.seconds // 60}m ago"
        elif delta.seconds >= 10:
            rel = f"{delta.seconds}s ago"
        else:
            rel = "just now"

        local_fmt = dt_local.strftime("%b %d %H:%M:%S %Z")
        failure["local_time"] = local_fmt
        failure["relative_time"] = rel
        failure["time_utc"] = ts_str
    except Exception:
        failure["local_time"] = ts_str
        failure["relative_time"] = "unknown"

    return failure


@app.get("/failures", response_model=FailureLogResponse)
def get_failures(limit: int = Query(50, ge=1, le=500)):
    """Get recent failures from the failure log, with local + relative timestamps."""
    failures = []
    failure_file = LOG_DIR / "failures.log"

    if failure_file.exists():
        try:
            with open(failure_file, "r") as f:
                lines = f.readlines()[-limit:]
            for line in lines:
                try:
                    if " | ERROR | {" in line:
                        json_part = line.split(" | ERROR | ", 2)[-1]
                        failures.append(json.loads(json_part))
                    elif " - {" in line:
                        # legacy format
                        json_part = line.split(" - ", 2)[-1]
                        failures.append(json.loads(json_part))
                    else:
                        failures.append({"raw": line.strip()})
                except json.JSONDecodeError:
                    failures.append({"raw": line.strip()})
        except Exception as e:
            logger.error(f"Failed to read failure log: {e}")

    # Enrich all entries with local + relative time
    enriched = [_enrich_failure(dict(f)) for f in failures]

    # Time range
    oldest_local = enriched[-1]["local_time"] if enriched else None
    newest_local = enriched[0]["local_time"] if enriched else None
    time_range = None
    if oldest_local and newest_local and oldest_local != newest_local:
        time_range = f"{oldest_local} — {newest_local}"

    return FailureLogResponse(
        failures=failures,
        enriched=enriched,
        count=len(failures),
        oldest=oldest_local,
        newest=newest_local,
        time_range=time_range,
    )


@app.delete("/failures")
def clear_failures():
    """Clear the failure log."""
    failure_file = LOG_DIR / "failures.log"
    try:
        if failure_file.exists():
            failure_file.unlink()
        logger.info("Failure log cleared")
        return {"status": "cleared"}
    except Exception as e:
        logger.error(f"Failed to clear failure log: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Background health checker — auto-recover from Qdrant blips
# ---------------------------------------------------------------------------

from contextlib import asynccontextmanager
import asyncio

_health_check_task = None
_failure_file = LOG_DIR / "failures.log"


async def _qdrant_health_checker():
    """
    Background task that:
    - Detects when Qdrant has recovered from an outage
    - Auto-resets the memory client so requests succeed again
    - Silences old failure alerts once the system is healthy for a while
    """
    import httpx
    consecutive_healthy = 0
    HEALTH_THRESHOLD = 3  # must be healthy N consecutive checks before clearing

    while True:
        await asyncio.sleep(60)
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get("http://localhost:3201/health")
                data = resp.json()

            qdrant_ok = data.get("qdrant") == "connected"
            disk_ok = not data.get("disk", {}).get("critical", False)

            if qdrant_ok and disk_ok:
                consecutive_healthy += 1
                if consecutive_healthy >= HEALTH_THRESHOLD:
                    # System is healthy — try to reset the memory client to pick up Qdrant
                    # This recovers from the "frozen" state where get_memory()
                    # never retries after a transient Qdrant outage
                    try:
                        await client.post("http://localhost:3201/memory/reset")
                        logger.info("Auto-reset memory client after Qdrant recovery")
                    except Exception:
                        pass
                    consecutive_healthy = 0  # reset counter after recovery action
            else:
                consecutive_healthy = 0
        except Exception:
            consecutive_healthy = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _health_check_task
    _health_check_task = asyncio.create_task(_qdrant_health_checker())
    logger.info("Mem0 server started — Qdrant health checker running in background")
    yield
    if _health_check_task:
        _health_check_task.cancel()
        try:
            await _health_check_task
        except asyncio.CancelledError:
            pass
    logger.info("Mem0 server shutting down")


# Patch app to use lifespan
app.router.lifespan_context = lifespan
