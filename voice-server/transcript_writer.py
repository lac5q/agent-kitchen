"""
voice-server/transcript_writer.py

SQLite transcript persistence helper for the voice server.
Writes voice session utterances to the shared messages table in
data/conversations.db, using agent_id='voice' and project='agent-kitchen'.

Per VOICE-04 and Pitfall 6 in 22-RESEARCH.md:
- Opens a new connection on every write (no persistent connection across processes)
- Sets PRAGMA journal_mode=WAL and PRAGMA busy_timeout=5000 on every connection
- Uses INSERT OR IGNORE to handle any duplicate request_id edge case
- The messages_ai FTS5 trigger auto-indexes each insert for /api/recall
"""
import sqlite3
import uuid
from datetime import datetime, timezone


class TranscriptWriter:
    """Writes voice transcript rows to the shared SQLite messages table."""

    def __init__(self, db_path: str, session_id: str) -> None:
        self.db_path = db_path
        self.session_id = session_id

    def write(self, role: str, content: str) -> None:
        """
        Insert one transcript row.

        Args:
            role:    "user" or "assistant"
            content: the spoken text
        """
        with sqlite3.connect(self.db_path, timeout=5.0) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=5000")
            conn.execute(
                """INSERT OR IGNORE INTO messages
                   (session_id, project, agent_id, role, content, timestamp, request_id)
                   VALUES (?, 'agent-kitchen', 'voice', ?, ?, ?, ?)""",
                (
                    self.session_id,
                    role,
                    content,
                    datetime.now(timezone.utc).isoformat(),
                    str(uuid.uuid4()),
                ),
            )
