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
from datetime import datetime
from contextlib import contextmanager
from pathlib import Path

DB_PATH = str(Path(__file__).resolve().parent / "logs" / "queue.db")
MEM0_URL = "http://localhost:3201"
REPLAY_INTERVAL = 10  # seconds
MAX_RETRIES = 3


class Mem0Queue:
    """Queue wrapper for mem0 memory operations."""

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_db()
        self._replay_thread = None
        self._stop_replay = False
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
                response = httpx.post(url, json=payload, timeout=30)
            elif req['method'] == 'GET':
                response = httpx.get(url, params=payload, timeout=30)
            else:
                return False

            if response.status_code == 200:
                self._log_replay(req['id'], 'success')
                print(f"[Queue] Replayed request {req['id']}: {req['endpoint']}")
                return True
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
        Try to send request, queue if server is down.
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

            if response.status_code == 200:
                return True

        except (httpx.ConnectError, httpx.TimeoutException) as e:
            # Server is down, queue the request
            self._add_to_queue(endpoint, method, payload)
            print(f"[Queue] Server down, queued request to {endpoint}")
            return True

        return False

    def _add_to_queue(self, endpoint: str, method: str, payload: dict):
        """Add request to queue."""
        with self._get_connection() as conn:
            conn.execute(
                """INSERT INTO queued_requests (endpoint, method, payload)
                   VALUES (?, ?, ?)""",
                (endpoint, method, json.dumps(payload))
            )
            conn.commit()

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


# Global queue instance
queue = Mem0Queue()


def queue_memory_save(text: str, agent_id: str = "shared") -> dict:
    """Queue a memory save request."""
    success = queue.queue_request(
        "/memory/add",
        "POST",
        {"text": text, "agent_id": agent_id}
    )
    return {"status": "queued" if not success else "saved", "queued": not success}


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
    except:
        pass
    return {"error": "Server unavailable", "results": []}


def queue_get_status() -> dict:
    """Get queue status."""
    return queue.get_queue_status()


def queue_clear() -> dict:
    """Clear the queue."""
    return queue.clear_queue()


# For testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == "status":
            print(json.dumps(queue.get_queue_status(), indent=2))
        elif cmd == "clear":
            print(json.dumps(queue.clear_queue(), indent=2))
        elif cmd == "test":
            # Test queuing
            print("Testing queue...")
            queue.queue_request("/memory/add", "POST", {"text": "test", "agent_id": "test"})
            print(json.dumps(queue.get_queue_status(), indent=2))
    else:
        print("Usage: python mem0-queue.py [status|clear|test]")
