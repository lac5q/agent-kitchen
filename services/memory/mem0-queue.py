#!/usr/bin/env python3
"""
Mem0 Queue Wrapper - Adds request queuing when server is down.
Buffers failed requests to SQLite and replays them when server recovers.
"""

import sqlite3
import json
import threading
import time
import httpx
from contextlib import contextmanager
from pathlib import Path

DB_PATH = str(Path(__file__).resolve().parent / "logs" / "queue.db")
MEM0_URL = "http://localhost:3201"
REPLAY_INTERVAL = 10  # seconds
REPLAY_TIMEOUT_SECONDS = 180
MAX_RETRIES = 3
RETRYABLE_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}
RETRYABLE_ERROR_MARKERS = (
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


def _canonical_payload(payload: dict) -> str:
    """Serialize payloads consistently so queued requests can be deduped."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def is_retryable_response(response: httpx.Response) -> bool:
    """Return True when a backend failure should preserve the request for replay."""
    if response.status_code in RETRYABLE_STATUS_CODES:
        return True

    if response.status_code not in {400, 401, 403}:
        return False

    body = response.text.lower()
    return any(marker.lower() in body for marker in RETRYABLE_ERROR_MARKERS)


class Mem0Queue:
    """Queue wrapper for mem0 memory operations."""

    def __init__(self, db_path: str = DB_PATH, start_replay: bool = True):
        self.db_path = db_path
        self._init_db()
        self._replay_thread = None
        self._stop_replay = False
        if start_replay:
            self._start_replay_thread()

    def _init_db(self):
        """Initialize SQLite database."""
        import os
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

        with self._get_connection() as conn:
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
            conn.execute("""
                CREATE TABLE IF NOT EXISTS replay_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id INTEGER,
                    status TEXT,
                    replayed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    error TEXT
                )
            """)
            conn.commit()

    @contextmanager
    def _get_connection(self):
        """Get database connection."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def _start_replay_thread(self):
        """Start background thread to replay queued requests."""
        self._replay_thread = threading.Thread(target=self._replay_loop, daemon=True)
        self._replay_thread.start()

    def _replay_loop(self):
        """Continuously try to replay queued requests."""
        while not self._stop_replay:
            try:
                self._replay_queued()
            except Exception as e:
                print(f"[Queue] Replay error: {e}")
            time.sleep(REPLAY_INTERVAL)

    def _replay_queued(self):
        """Replay all queued requests."""
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM queued_requests ORDER BY created_at LIMIT 100"
            )
            requests = cursor.fetchall()

        for req in requests:
            success = self._replay_request(req)
            if success:
                self._remove_from_queue(req['id'])

    def _replay_request(self, req) -> bool:
        """Replay a single queued request."""
        try:
            url = f"{MEM0_URL}{req['endpoint']}"
            payload = json.loads(req['payload'])

            if req['method'] == 'POST':
                response = httpx.post(
                    url,
                    json=payload,
                    timeout=REPLAY_TIMEOUT_SECONDS,
                    headers={"X-Mem0-Queue-Replay": "1"},
                )
            elif req['method'] == 'GET':
                response = httpx.get(url, params=payload, timeout=REPLAY_TIMEOUT_SECONDS)
            else:
                return False

            if 200 <= response.status_code < 300:
                try:
                    data = response.json()
                except ValueError:
                    data = {}
                if data.get("status") == "queued":
                    self._log_replay(req['id'], 'retryable', "Backend accepted into queue again")
                    return False
                self._log_replay(req['id'], 'success')
                print(f"[Queue] Replayed request {req['id']}: {req['endpoint']}")
                return True
            elif is_retryable_response(response):
                self._log_replay(req['id'], 'retryable', f"Status {response.status_code}")
                return False
            else:
                self._log_replay(req['id'], 'failed', f"Status {response.status_code}")
                return False

        except Exception as e:
            self._log_replay(req['id'], 'error', str(e))
            return False

    def _remove_from_queue(self, request_id: int):
        """Remove a request from the queue."""
        with self._get_connection() as conn:
            conn.execute("DELETE FROM queued_requests WHERE id = ?", (request_id,))
            conn.commit()

    def _log_replay(self, request_id: int, status: str, error: str = ""):
        """Log replay attempt."""
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO replay_log (request_id, status, error) VALUES (?, ?, ?)",
                (request_id, status, error)
            )
            conn.commit()

    def queue_request(self, endpoint: str, method: str, payload: dict) -> bool:
        """
        Try to send request, queue if the backend is temporarily unavailable.
        Returns True if sent successfully (or queued), False on error.
        """
        # Try to send directly first
        try:
            url = f"{MEM0_URL}{endpoint}"
            if method == 'POST':
                response = httpx.post(url, json=payload, timeout=30)
            elif method == 'GET':
                response = httpx.get(url, params=payload, timeout=30)
            else:
                return False

            if 200 <= response.status_code < 300:
                return True
            if is_retryable_response(response):
                self._add_to_queue(endpoint, method, payload)
                print(f"[Queue] Retryable backend failure {response.status_code}, queued request to {endpoint}")
                return True

        except (httpx.ConnectError, httpx.TimeoutException):
            # Server is down, queue the request
            self._add_to_queue(endpoint, method, payload)
            print(f"[Queue] Server down, queued request to {endpoint}")
            return True

        return False

    def _add_to_queue(self, endpoint: str, method: str, payload: dict) -> bool:
        """Add request to queue, deduping identical pending payloads."""
        payload_json = _canonical_payload(payload)
        with self._get_connection() as conn:
            existing = conn.execute(
                """SELECT id FROM queued_requests
                   WHERE endpoint = ? AND method = ? AND payload = ?
                   LIMIT 1""",
                (endpoint, method, payload_json)
            ).fetchone()
            if existing:
                return False
            conn.execute(
                """INSERT INTO queued_requests (endpoint, method, payload)
                   VALUES (?, ?, ?)""",
                (endpoint, method, payload_json)
            )
            conn.commit()
        return True

    def get_queue_status(self) -> dict:
        """Get current queue status."""
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT COUNT(*) as count, MIN(created_at) as oldest FROM queued_requests"
            )
            row = cursor.fetchone()

            cursor = conn.execute(
                """SELECT status, COUNT(*) as count
                   FROM replay_log
                   WHERE replayed_at > datetime('now', '-1 hour')
                   GROUP BY status"""
            )
            recent = {r['status']: r['count'] for r in cursor.fetchall()}

        return {
            "queued": row['count'] or 0,
            "oldest": row['oldest'],
            "recent_replays": recent
        }

    def clear_queue(self):
        """Clear all queued requests."""
        with self._get_connection() as conn:
            conn.execute("DELETE FROM queued_requests")
            conn.commit()
        return {"status": "cleared"}

    def stop(self):
        """Stop the replay thread."""
        self._stop_replay = True


queue = None


def _get_global_queue() -> Mem0Queue:
    """Lazily create the process-wide queue."""
    global queue
    if queue is None:
        queue = Mem0Queue()
    return queue


def queue_memory_save(text: str, agent_id: str = "shared") -> dict:
    """Queue a memory save request."""
    success = _get_global_queue().queue_request(
        "/memory/add",
        "POST",
        {"text": text, "agent_id": agent_id}
    )
    return {"status": "accepted" if success else "failed", "accepted": success}


def queue_memory_search(query: str, agent_id: str = "", limit: int = 5) -> dict:
    """Queue a memory search request (or execute directly)."""
    # Search is read-only, just fail gracefully if server down
    try:
        params = {"q": query, "limit": limit}
        if agent_id:
            params["agent_id"] = agent_id
        response = httpx.get(f"{MEM0_URL}/memory/search", params=params, timeout=30)
        if response.status_code == 200:
            return response.json()
    except Exception:
        pass
    return {"error": "Server unavailable", "results": []}


def queue_get_status() -> dict:
    """Get queue status."""
    return _get_global_queue().get_queue_status()


def queue_clear() -> dict:
    """Clear the queue."""
    return _get_global_queue().clear_queue()


# For testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == "status":
            print(json.dumps(_get_global_queue().get_queue_status(), indent=2))
        elif cmd == "clear":
            print(json.dumps(_get_global_queue().clear_queue(), indent=2))
        elif cmd == "test":
            # Test queuing
            print("Testing queue...")
            q = _get_global_queue()
            q.queue_request("/memory/add", "POST", {"text": "test", "agent_id": "test"})
            print(json.dumps(q.get_queue_status(), indent=2))
    else:
        print("Usage: python mem0-queue.py [status|clear|test]")
