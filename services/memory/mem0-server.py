"""
Mem0 FastAPI server — agent memory backed by Qdrant vector store.
Run with: uvicorn mem0-server:app --host ${MEMROOS_BIND_HOST:-127.0.0.1} --port 3201
    (set MEMROOS_BIND_HOST=0.0.0.0 only for multi-host deployments with a firewall in place)
"""

import os
import sys
import yaml
import json
import time
import logging
import logging.handlers
import traceback
import shutil
import sqlite3
import asyncio
import threading
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
import notify as notifier
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

# Main server log — rotating: 50MB × 5 backups = ~250MB max, never floods disk.
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.handlers.RotatingFileHandler(
            LOG_DIR / "mem0-server.log",
            maxBytes=50 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        ),
    ]
)
logger = logging.getLogger("mem0-server")

# Failure log - separate file for errors that need investigation. Also rotates.
failure_logger = logging.getLogger("mem0-failures")
failure_logger.setLevel(logging.ERROR)
failure_handler = logging.handlers.RotatingFileHandler(
    LOG_DIR / "failures.log",
    maxBytes=50 * 1024 * 1024,
    backupCount=5,
    encoding="utf-8",
)
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


class CircuitBreaker:
    """
    In-process circuit breaker. Three states:
      - CLOSED:  normal operation, requests pass through.
      - OPEN:    too many failures — fast-fail all requests for a cooldown.
      - HALF_OPEN: cooldown elapsed — let one request through as a probe.

    On OPEN → notify() (single alert, not per-request).
    On HALF_OPEN → CLOSE: notify() once with recovery info.
    Per-request failures during OPEN are silent (no log spam, no notify).
    """

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        window_seconds: float = 120.0,
        cooldown_seconds: float = 600.0,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.window_seconds = window_seconds
        self.cooldown_seconds = cooldown_seconds
        self.state = self.CLOSED
        self.failures: list[float] = []  # timestamps within the window
        self.opened_at: float = 0.0
        self.last_failure_msg: str = ""
        self.total_failures: int = 0  # cumulative since open
        self.queued_during_open: int = 0
        self._lock = threading.Lock()

    def allow_request(self) -> bool:
        """Decide whether to let this request through. Updates state."""
        import time
        with self._lock:
            now = time.time()
            if self.state == self.CLOSED:
                return True
            if self.state == self.OPEN:
                if (now - self.opened_at) >= self.cooldown_seconds:
                    # Cooldown elapsed — move to half-open, allow one probe.
                    self.state = self.HALF_OPEN
                    logger.info(
                        f"[circuit:{self.name}] cooldown elapsed — "
                        f"entering HALF_OPEN, one probe request allowed"
                    )
                    return True
                return False
            # HALF_OPEN: only the first request gets through; others fast-fail
            # until that one resolves. Implemented by setting back to OPEN on
            # first probe entry below.
            return False

    def record_success(self) -> None:
        """Call after a successful request. May transition HALF_OPEN→CLOSED."""
        import time
        with self._lock:
            if self.state == self.HALF_OPEN:
                duration = time.time() - self.opened_at
                logger.info(
                    f"[circuit:{self.name}] probe succeeded — CLOSED "
                    f"(was open for {duration:.0f}s, "
                    f"{self.total_failures} failures, "
                    f"{self.queued_during_open} queued)"
                )
                # Recovery notification — single ping.
                try:
                    notifier.notify(
                        "circuit_recovered",
                        f"{self.name} recovered after {duration:.0f}s",
                        details={
                            "circuit": self.name,
                            "open_seconds": int(duration),
                            "failures_during_outage": self.total_failures,
                            "queued_for_replay": self.queued_during_open,
                        },
                    )
                except Exception:
                    pass
                self.state = self.CLOSED
                self.failures = []
                self.total_failures = 0
                self.queued_during_open = 0
            elif self.state == self.CLOSED:
                # Normal success — clear recent failures from the window.
                self.failures = []

    def record_failure(self, exc: Exception | None = None) -> None:
        """Call after a failed request. May transition CLOSED→OPEN."""
        import time
        msg = str(exc) if exc else "unknown"
        with self._lock:
            now = time.time()
            if self.state == self.HALF_OPEN:
                # Probe failed — back to OPEN, reset cooldown.
                self.state = self.OPEN
                self.opened_at = now
                self.last_failure_msg = msg
                logger.warning(
                    f"[circuit:{self.name}] HALF_OPEN probe failed — "
                    f"back to OPEN for another {self.cooldown_seconds:.0f}s"
                )
                return
            # CLOSED — record and check threshold.
            self.failures = [
                t for t in self.failures if (now - t) <= self.window_seconds
            ]
            self.failures.append(now)
            self.last_failure_msg = msg
            if len(self.failures) >= self.failure_threshold and self.state == self.CLOSED:
                self.state = self.OPEN
                self.opened_at = now
                self.total_failures = len(self.failures)
                logger.error(
                    f"[circuit:{self.name}] threshold reached "
                    f"({len(self.failures)} failures in {self.window_seconds:.0f}s) — "
                    f"OPEN for {self.cooldown_seconds:.0f}s"
                )
                try:
                    notifier.notify(
                        "circuit_opened",
                        f"{self.name} circuit OPEN — fast-failing requests",
                        details={
                            "circuit": self.name,
                            "failures": len(self.failures),
                            "window_seconds": int(self.window_seconds),
                            "cooldown_seconds": int(self.cooldown_seconds),
                            "last_error": msg[:200],
                            "queued_replay": True,
                        },
                    )
                except Exception:
                    pass

    def record_queued(self) -> None:
        """Track that a request was queued for replay while the circuit was open."""
        with self._lock:
            self.queued_during_open += 1


# Breaker for the Ollama/embedder initialization path. When Ollama is down
# (or unreachable on the wrong URL), every memory add fails the same way.
# The breaker prevents 12GB of duplicate traceback logs.
memory_init_breaker = CircuitBreaker(
    name="mem0-ollama",
    failure_threshold=5,
    window_seconds=120.0,
    cooldown_seconds=600.0,
)


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

    # Circuit breaker fast-path: if we've been failing repeatedly, don't try.
    if not memory_init_breaker.allow_request():
        raise RuntimeError(
            f"mem0-ollama circuit OPEN — request fast-failed "
            f"(cooldown {memory_init_breaker.cooldown_seconds:.0f}s, "
            f"last error: {memory_init_breaker.last_failure_msg[:120]})"
        )

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
            memory_init_breaker.record_success()
            logger.info("Mem0 Memory initialized successfully")
        except Exception as e:
            _init_error = e
            _last_init_attempt = now
            memory_init_breaker.record_failure(e)
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
                    memory_init_breaker.record_success()
                    logger.info("Mem0 Memory re-initialized after Qdrant reset")
                except Exception as reinit_err:
                    _init_error = reinit_err
                    _last_init_attempt = time.time()
                    memory_init_breaker.record_failure(reinit_err)
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
    """Check disk space for a single path and return status.

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
            "path": os.path.expanduser(path),
            "total_gb": round(usage.total / (1024**3), 1),
            "used_gb": round(usage.used / (1024**3), 1),
            "free_gb": round(gb_free, 1),
            "percent_used": round(percent_used, 1),
            "critical": percent_used > critical_percent or gb_free < critical_free_gb,
            "warning": percent_used > warning_percent or gb_free < warning_free_gb,
        }
    except Exception as e:
        return {"path": path, "error": str(e), "critical": True}


def mem0_disk_paths() -> list[str]:
    """Paths whose free space actually gates Mem0 durability (not home alone)."""
    paths = [
        str(Path(QUEUE_DB_PATH).expanduser().resolve().parent),
        str(LOG_DIR.resolve()),
    ]
    # Dedupe while preserving order (home may share the same mount — still path-scoped).
    seen: set[str] = set()
    ordered: list[str] = []
    for path in paths:
        if path in seen:
            continue
        seen.add(path)
        ordered.append(path)
    return ordered


def check_mem0_disk_space() -> dict:
    """Aggregate path-scoped disk status for Mem0-relevant paths.

    Home `df%` alone must not be treated as a vector-store failure when Qdrant is
    remote. Critical/warning flags here reflect QUEUE_DB / LOG_DIR mounts only.
    An advisory home sample is included for operators when it differs.
    """
    scoped = [check_disk_space(path) for path in mem0_disk_paths()]
    home = check_disk_space("~")
    critical = any(entry.get("critical") for entry in scoped)
    warning = any(entry.get("warning") for entry in scoped) or bool(home.get("warning"))
    return {
        "critical": critical,
        "warning": warning,
        "paths": scoped,
        "home_advisory": home,
        # Backward-compatible flat fields from the worst scoped path (or first).
        **(next((e for e in scoped if e.get("critical")), scoped[0] if scoped else home)),
    }


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
    # Inventory-facing counts (Qdrant collection points). Optional so older
    # clients keep working; MemRoOS memory-inventory reads these fields.
    memory_count: Optional[int] = None
    points_count: Optional[int] = None
    collection_name: Optional[str] = None


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


def _qdrant_headers(vector_cfg: dict[str, Any]) -> dict[str, str]:
    api_key_env = vector_cfg.get("api_key_env")
    api_key = vector_cfg.get("api_key") or (os.environ.get(api_key_env) if api_key_env else None)
    return {"api-key": api_key} if api_key else {}


def _qdrant_base_url(vector_cfg: dict[str, Any]) -> str:
    url = vector_cfg.get("url")
    if url:
        return str(url).rstrip("/") + "/"
    host = vector_cfg.get("host", "localhost")
    port = vector_cfg.get("port", 6333)
    return f"http://{host}:{port}/"


def check_qdrant_vector_store(vector_cfg: dict[str, Any]) -> str:
    """Check Qdrant over HTTP without relying on qdrant-client package metadata."""
    endpoint = urljoin(_qdrant_base_url(vector_cfg), "collections")
    response = httpx.get(endpoint, headers=_qdrant_headers(vector_cfg), timeout=5)
    response.raise_for_status()
    return "connected"


def qdrant_collection_points_count(vector_cfg: dict[str, Any]) -> tuple[Optional[int], Optional[str]]:
    """Return (points_count, collection_name) for the configured Qdrant collection."""
    collection_name = vector_cfg.get("collection_name")
    if not collection_name:
        return None, None
    endpoint = urljoin(_qdrant_base_url(vector_cfg), f"collections/{collection_name}")
    try:
        response = httpx.get(endpoint, headers=_qdrant_headers(vector_cfg), timeout=5)
        response.raise_for_status()
        payload = response.json()
        result = payload.get("result") if isinstance(payload, dict) else None
        if not isinstance(result, dict):
            result = payload if isinstance(payload, dict) else {}
        points = result.get("points_count")
        if isinstance(points, (int, float)) and points >= 0:
            return int(points), str(collection_name)
        # Some Qdrant versions nest counts under indexed/vectors — still honest null.
        return None, str(collection_name)
    except Exception as exc:
        logger.warning(f"Qdrant points_count probe failed for {collection_name}: {exc}")
        return None, str(collection_name)


def cached_qdrant_vector_status(vector_cfg: dict[str, Any], *, force: bool = False) -> str:
    """Interval-cached Qdrant connectivity for /health (avoids probing on every request)."""
    global _qdrant_probe_ok, _qdrant_probe_last
    import time

    now = time.time()
    if (
        not force
        and _qdrant_probe_ok is not None
        and (now - _qdrant_probe_last) < _QDRANT_PROBE_INTERVAL
    ):
        return "connected" if _qdrant_probe_ok else "disconnected"

    _qdrant_probe_last = now
    try:
        status = check_qdrant_vector_store(vector_cfg)
        _qdrant_probe_ok = status == "connected"
        return status
    except Exception as exc:
        logger.warning(f"Qdrant health check failed: {exc}")
        _qdrant_probe_ok = False
        return "disconnected"


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
            if memory_init_breaker.state == CircuitBreaker.OPEN:
                memory_init_breaker.record_queued()
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


@app.get("/livez")
def livez():
    """Process liveness only — no Qdrant/disk/runtime suite (hang-safe for supervisors)."""
    return {"status": "ok", "service": "mem0-server"}



_DISK_WARN_STATE_FILE = Path("/run/memroos-disk-warn.state")
_DISK_WARN_INTERVAL_S = 6 * 3600  # once per 6 hours

def _should_log_disk_warning(status: dict) -> bool:
    """Throttle disk warnings: emit at most once per _DISK_WARN_INTERVAL_S.

    Disk status is essentially static between cleanup events; logging on every
    /health call spam-fills mem0-server.log and journald. We persist a
    (signature, ts) tuple in /run and only emit when (a) the signature changed
    or (b) the interval elapsed. Returns True iff this call should log.
    """
    import json as _json
    sig = _json.dumps(
        {k: v for k, v in status.items() if k != "home_advisory"},
        sort_keys=True,
    )
    now = time.time()
    try:
        if _DISK_WARN_STATE_FILE.exists():
            state = _json.loads(_DISK_WARN_STATE_FILE.read_text())
        else:
            state = {"sig": None, "ts": 0.0}
    except Exception:
        state = {"sig": None, "ts": 0.0}
    if state.get("sig") == sig and (now - state.get("ts", 0.0)) < _DISK_WARN_INTERVAL_S:
        return False
    try:
        _DISK_WARN_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        _DISK_WARN_STATE_FILE.write_text(_json.dumps({"sig": sig, "ts": now}))
    except OSError:
        pass  # best-effort
    return True


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
            vector_status = cached_qdrant_vector_status(vector_cfg)
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

    disk_status = check_mem0_disk_space()
    sqlite_status = check_sqlite_db()
    try:
        from mem0_queue import Mem0Queue

        queue_status = Mem0Queue(db_path=str(QUEUE_DB_PATH), start_replay=False).get_queue_status()
    except Exception as exc:
        queue_status = {"status": "error", "error": str(exc), "queued": None}

    # Log warnings for concerning states (path-scoped critical only — not home advisory alone).
    # Disk status is essentially static between cleanup events; log at most once per 6h.
    if disk_status.get("critical"):
        log_failure("disk_critical", disk_status)
    elif disk_status.get("warning"):
        if _should_log_disk_warning(disk_status):
            logger.warning(f"Disk space warning: {disk_status}")

    if sqlite_status.get("status") != "healthy":
        log_failure("sqlite_unhealthy", sqlite_status)

    if runtime_status.get("status") != "available":
        log_failure("mem0_runtime_unavailable", runtime_status)

    queued_count = queue_status.get("queued")
    queue_ok = queued_count in (0, None) and queue_status.get("status") != "error"
    # Path-scoped disk critical can degrade overall health, but vector_store stays
    # independent — home advisory alone never flips is_ok via disk_status.critical.
    is_ok = (
        runtime_status.get("status") == "available"
        and vector_status == "connected"
        and not disk_status.get("critical")
        and queue_ok
    )

    memory_count: Optional[int] = None
    collection_name: Optional[str] = None
    if vector_provider == "qdrant" and vector_status == "connected":
        memory_count, collection_name = qdrant_collection_points_count(vector_cfg)

    return HealthResponse(
        status="ok" if is_ok else "degraded",
        vector_store=vector_status,
        memory_runtime=runtime_status,
        disk=disk_status,
        sqlite=sqlite_status,
        queue=queue_status,
        memory_count=memory_count,
        points_count=memory_count,
        collection_name=collection_name,
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

    Phase 155: in-process only — never self-HTTP to the local mem0 /health or /memory/reset
    endpoints (self-HTTP can hang the event loop when /health itself is blocked on Qdrant).
    """
    consecutive_healthy = 0
    HEALTH_THRESHOLD = 3  # must be healthy N consecutive checks before clearing

    while True:
        await asyncio.sleep(60)
        try:
            cfg = await asyncio.to_thread(load_config)
            vector_cfg = cfg.get("vector_store", {}).get("config", {})
            vector_provider = cfg.get("vector_store", {}).get("provider", "unknown")

            if vector_provider == "qdrant":
                vector_status = await asyncio.to_thread(
                    lambda: cached_qdrant_vector_status(vector_cfg, force=True)
                )
                qdrant_ok = vector_status == "connected"
            else:
                qdrant_ok = True

            disk_status = await asyncio.to_thread(check_mem0_disk_space)
            disk_ok = not disk_status.get("critical", False)

            if qdrant_ok and disk_ok:
                consecutive_healthy += 1
                if consecutive_healthy >= HEALTH_THRESHOLD:
                    # Recover frozen Memory client after Qdrant blips — in-process reset.
                    # Only reset when the client is actually in a broken state
                    # (_memory is None or last init errored). Without this guard we
                    # thrash on every healthy tick: reset → next API request lazily
                    # re-inits → health checker sees a healthy client and resets again
                    # after the threshold elapses, logging
                    # "Auto-reset memory client after Qdrant recovery" every ~3 min.
                    if _memory is None or _init_error is not None:
                        try:
                            await asyncio.to_thread(reset_memory)
                            logger.info("Auto-reset memory client after Qdrant recovery (in-process)")
                        except Exception:
                            pass
                    else:
                        logger.debug("Qdrant healthy; skipping redundant reset (memory client already initialized)")
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
