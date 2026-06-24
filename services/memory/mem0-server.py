"""
Mem0 FastAPI server — agent memory backed by Qdrant vector store.
Run with: uvicorn mem0-server:app --host ${MEMROOS_BIND_HOST:-127.0.0.1} --port 3201
    (set MEMROOS_BIND_HOST=0.0.0.0 only for multi-host deployments with a firewall in place)
"""

import os
import sys
import yaml
import json
import logging
import traceback
import shutil
import sqlite3
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Optional
from pathlib import Path
from urllib.parse import urljoin

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from provenance import normalize_metadata
from pii_guard import protect_memory_payload
try:
    from qdrant_client import QdrantClient

    QDRANT_AVAILABLE = QdrantClient is not None
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
QUEUE_DB_PATH = LOG_DIR / "queue.db"
RETRYABLE_MEMORY_ERROR_MARKERS = (
    "RESOURCE_EXHAUSTED",
    "SERVICE_DISABLED",
    "PERMISSION_DENIED",
    "quota",
    "rate limit",
    "temporarily unavailable",
    "timeout",
    "timed out",
    "connection",
    "overloaded",
)

def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def resolve_env_config(config: dict) -> dict:
    """Replace config keys ending in `_env` with values from that environment variable."""
    resolved = dict(config)
    for key, env_name in list(config.items()):
        if not key.endswith("_env"):
            continue
        value_key = key[:-4]
        resolved.pop(key, None)
        env_value = os.environ.get(str(env_name), "")
        if env_value:
            resolved[value_key] = env_value
    return resolved


def build_mem0_config(cfg: dict) -> dict:
    """Convert YAML config to the dict format mem0 Memory() expects."""
    mem0_cfg: dict = {}

    vc = cfg.get("vector_store", {})
    if vc:
        vc_config = resolve_env_config(vc.get("config", {}))
        mem0_cfg["vector_store"] = {
            "provider": vc["provider"],
            "config": vc_config,
        }

    llm = cfg.get("llm", {})
    if llm:
        llm_config = resolve_env_config(llm.get("config", {}))
        mem0_cfg["llm"] = {"provider": llm["provider"], "config": llm_config}

    embedder = cfg.get("embedder", {})
    if embedder:
        emb_config = resolve_env_config(embedder.get("config", {}))
        mem0_cfg["embedder"] = {
            "provider": embedder["provider"],
            "config": emb_config,
        }

    for key in ("custom_fact_extraction_prompt", "custom_update_memory_prompt"):
        if cfg.get(key):
            mem0_cfg[key] = cfg[key]

    return mem0_cfg


# Lazily initialised — with Qdrant resilience
_memory = None
_init_error = None
_last_init_attempt = 0
_INIT_COOLDOWN = 15  # seconds before retrying init after failure

# Cached Qdrant probe: don't run a live search on every API request.
# When Qdrant is down, an uncached probe causes a reset→Ollama-pull loop
# that burns 500%+ CPU indefinitely. Check at most once per interval.
_qdrant_probe_ok: Optional[bool] = None
_qdrant_probe_last: float = 0
_QDRANT_PROBE_INTERVAL = 60  # seconds between live probes


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

    # Verify Qdrant reachability, but only once per _QDRANT_PROBE_INTERVAL seconds.
    # Without this cache, every API request triggers a live search probe; when
    # Qdrant is unreachable (SSL timeout) the reset→Ollama-pull loop burns 500%+
    # CPU indefinitely. Demo mode uses embedded Chroma — skip probe there too.
    global _qdrant_probe_ok, _qdrant_probe_last
    cfg = load_config()
    vector_provider = cfg.get("vector_store", {}).get("provider", "unknown")
    if vector_provider == "qdrant":
        now = time.time()
        if (now - _qdrant_probe_last) >= _QDRANT_PROBE_INTERVAL:
            _qdrant_probe_last = now
            try:
                _memory.search("__health_check__", user_id="__internal__", limit=1)
                if not _qdrant_probe_ok:
                    logger.info("Qdrant reachable again (probe passed)")
                _qdrant_probe_ok = True
            except Exception as qe:
                logger.warning(f"Qdrant unreachable, attempting reset: {qe}")
                _qdrant_probe_ok = False
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
        elif not _qdrant_probe_ok:
            # Last known probe failed — fail fast without touching Ollama
            raise RuntimeError("Qdrant unreachable (cached from last probe); retry in progress")

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


def _is_retryable_memory_error(exc: Exception) -> bool:
    """Detect provider and transient backend failures that should not drop a save."""
    text = f"{type(exc).__name__}: {exc}".lower()
    return any(marker.lower() in text for marker in RETRYABLE_MEMORY_ERROR_MARKERS)


def _queue_failed_memory_add(req: "AddMemoryRequest") -> bool:
    """Persist a failed memory add into the replay queue without starting a worker."""
    metadata = normalize_metadata(
        req.metadata,
        agent_id=req.agent_id,
        default_source="mem0-server",
    )
    payload = protect_memory_payload(
        {
            "text": req.text,
            "agent_id": req.agent_id,
            "metadata": metadata,
        }
    )
    payload_json = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
    )
    with sqlite3.connect(QUEUE_DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS queued_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint TEXT NOT NULL,
                method TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                retry_count INTEGER DEFAULT 0
            )
        """)
        existing = conn.execute(
            """SELECT id FROM queued_requests
               WHERE endpoint = ? AND method = ? AND payload = ?
               LIMIT 1""",
            ("/memory/add", "POST", payload_json),
        ).fetchone()
        if existing:
            return False
        conn.execute(
            """INSERT INTO queued_requests (endpoint, method, payload)
               VALUES (?, ?, ?)""",
            ("/memory/add", "POST", payload_json),
        )
        conn.commit()
    return True


def vector_store_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    """Coerce metadata into the scalar-only shape accepted by vector stores."""
    flattened: dict[str, Any] = {}
    for key, value in (metadata or {}).items():
        if isinstance(value, (str, int, float, bool)) or value is None:
            flattened[key] = value
        else:
            flattened[key] = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return flattened


def check_disk_space(path: str = "~") -> dict:
    """Check disk space and return status.

    Defaults are sized for local Docker Desktop volumes. The old absolute
    thresholds (critical <10GB, warning <20GB) made a 23.5GB Docker disk look
    unhealthy even when it was less than half full.
    """
    try:
        usage = shutil.disk_usage(os.path.expanduser(path))
        percent_used = (usage.used / usage.total) * 100
        gb_free = usage.free / (1024**3)
        critical_free_gb = float(os.environ.get("MEM0_DISK_CRITICAL_FREE_GB", "2"))
        warning_free_gb = float(os.environ.get("MEM0_DISK_WARNING_FREE_GB", "8"))
        critical_percent = float(os.environ.get("MEM0_DISK_CRITICAL_PERCENT", "95"))
        warning_percent = float(os.environ.get("MEM0_DISK_WARNING_PERCENT", "85"))
        return {
            "total_gb": round(usage.total / (1024**3), 1),
            "used_gb": round(usage.used / (1024**3), 1),
            "free_gb": round(gb_free, 1),
            "percent_used": round(percent_used, 1),
            "critical": percent_used > critical_percent or gb_free < critical_free_gb,
            "warning": percent_used > warning_percent or gb_free < warning_free_gb,
        }
    except Exception as e:
        return {"error": str(e), "critical": True}


def check_sqlite_db(db_path: str | None = None) -> dict:
    """Check SQLite database health."""
    import sqlite3
    db_path = str(db_path or QUEUE_DB_PATH)
    result = {"path": db_path, "status": "unknown"}

    try:
        full_path = os.path.expanduser(db_path)
        if not os.path.exists(full_path):
            return {**result, "status": "not_found", "error": "Database file does not exist"}

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
    memory_runtime: Optional[dict] = None
    disk: Optional[dict] = None
    sqlite: Optional[dict] = None
    queue: Optional[dict] = None


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


def check_mem0_runtime() -> dict:
    """Verify the mem0 package import path before declaring the service healthy."""
    try:
        from mem0 import Memory  # noqa: F401
        return {"status": "available"}
    except Exception as exc:
        return {"status": "unavailable", "error": str(exc)}


def check_qdrant_vector_store(vector_cfg: dict[str, Any]) -> str:
    """Check Qdrant over HTTP without relying on qdrant-client package metadata."""
    api_key_env = vector_cfg.get("api_key_env")
    api_key = vector_cfg.get("api_key") or (os.environ.get(api_key_env) if api_key_env else None)
    headers = {"api-key": api_key} if api_key else {}
    url = vector_cfg.get("url")
    if url:
        endpoint = urljoin(str(url).rstrip("/") + "/", "collections")
    else:
        host = vector_cfg.get("host", "localhost")
        port = vector_cfg.get("port", 6333)
        endpoint = f"http://{host}:{port}/collections"

    response = httpx.get(endpoint, headers=headers, timeout=5)
    response.raise_for_status()
    return "connected"


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
def add_memory(req: AddMemoryRequest, request: Request):
    """Store a new memory for an agent."""
    try:
        mem = get_memory()
        metadata = normalize_metadata(
            req.metadata,
            agent_id=req.agent_id,
            default_source="mem0-server",
        )
        protected_payload = protect_memory_payload({
            "text": req.text,
            "agent_id": req.agent_id,
            "metadata": metadata,
        })
        result = mem.add(
            protected_payload["text"],
            user_id=req.agent_id,
            metadata=vector_store_metadata(protected_payload.get("metadata", {})),
        )
        logger.info(f"Memory added for agent {req.agent_id}: {protected_payload['text'][:50]}...")
        return AddMemoryResponse(status="ok", result=result)
    except Exception as exc:
        log_failure(
            "memory_add_failed",
            {"agent_id": req.agent_id, "text_preview": req.text[:100]},
            exc
        )
        is_replay = request.headers.get("x-mem0-queue-replay") == "1"
        if _is_retryable_memory_error(exc) and not is_replay:
            queued = _queue_failed_memory_add(req)
            return AddMemoryResponse(
                status="queued",
                result={
                    "message": "Memory backend temporarily failed; save preserved for replay.",
                    "queued": queued,
                    "reason": str(exc),
                },
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
    """Health check — verifies mem0 runtime, vector store, disk, SQLite, and queued writes."""
    cfg = load_config()
    vector_provider = cfg.get("vector_store", {}).get("provider", "unknown")
    vector_cfg = cfg.get("vector_store", {}).get("config", {})

    runtime_status = check_mem0_runtime()
    vector_status = "unknown"
    if vector_provider == "qdrant":
        if not QDRANT_AVAILABLE:
            vector_status = "disconnected"
        else:
            try:
                vector_status = check_qdrant_vector_store(vector_cfg)
            except Exception as e:
                logger.warning(f"Qdrant health check failed: {e}")
                vector_status = "disconnected"
    elif vector_provider == "chroma":
        # Chroma is embedded — if the server is running at all, it's healthy
        try:
            vector_status = "connected"
        except Exception as e:
            logger.warning(f"Chroma health check failed: {e}")
            vector_status = "disconnected"
    else:
        # Unknown provider — assume healthy if no exception thrown during init
        vector_status = "unknown"

    disk_status = check_disk_space()
    sqlite_status = check_sqlite_db()
    try:
        from mem0_queue import Mem0Queue

        queue_status = Mem0Queue(db_path=str(QUEUE_DB_PATH), start_replay=False).get_queue_status()
    except Exception as exc:
        queue_status = {"status": "error", "error": str(exc), "queued": None}

    # Log warnings for concerning states
    if disk_status.get("critical"):
        log_failure("disk_critical", disk_status)
    elif disk_status.get("warning"):
        logger.warning(f"Disk space warning: {disk_status}")

    if sqlite_status.get("status") != "healthy":
        log_failure("sqlite_unhealthy", sqlite_status)

    if runtime_status.get("status") != "available":
        log_failure("mem0_runtime_unavailable", runtime_status)

    queued_count = queue_status.get("queued")
    queue_ok = queued_count in (0, None) and queue_status.get("status") != "error"
    is_ok = (
        runtime_status.get("status") == "available"
        and vector_status == "connected"
        and not disk_status.get("critical")
        and queue_ok
    )
    return HealthResponse(
        status="ok" if is_ok else "degraded",
        vector_store=vector_status,
        memory_runtime=runtime_status,
        disk=disk_status,
        sqlite=sqlite_status,
        queue=queue_status,
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

_health_check_task = None
_queue_replay_task = None
_failure_file = LOG_DIR / "failures.log"


async def _qdrant_health_checker():
    """
    Background task that:
    - Detects when Qdrant has recovered from an outage
    - Auto-resets the memory client so requests succeed again
    - Silences old failure alerts once the system is healthy for a while
    """
    consecutive_healthy = 0
    HEALTH_THRESHOLD = 3  # must be healthy N consecutive checks before clearing

    while True:
        await asyncio.sleep(60)
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get("http://localhost:3201/health")
                data = resp.json()

            qdrant_ok = data.get("vector_store") == "connected"
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


async def _queue_replay_worker():
    """Replay failed memory saves once the backend has recovered."""
    from mem0_queue import Mem0Queue

    queue = Mem0Queue(db_path=str(QUEUE_DB_PATH), start_replay=False)
    while True:
        await asyncio.sleep(10)
        try:
            status = queue.get_queue_status()
            if status.get("queued", 0):
                logger.info("Replaying up to 100 queued mem0 requests")
                await asyncio.to_thread(queue._replay_queued)
        except Exception as exc:
            logger.warning(f"Mem0 queue replay failed: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _health_check_task, _queue_replay_task
    _health_check_task = asyncio.create_task(_qdrant_health_checker())
    _queue_replay_task = asyncio.create_task(_queue_replay_worker())
    logger.info("Mem0 server started — Qdrant health checker and queue replay running in background")
    yield
    for task in (_health_check_task, _queue_replay_task):
        if not task:
            continue
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    logger.info("Mem0 server shutting down")


# Patch app to use lifespan
app.router.lifespan_context = lifespan
