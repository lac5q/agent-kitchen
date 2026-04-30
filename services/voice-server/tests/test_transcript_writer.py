"""
voice-server/tests/test_transcript_writer.py

Tests for TranscriptWriter — SQLite transcript persistence helper.
Covers: write inserts to messages table, WAL mode, unique request_ids.
"""
import sqlite3
import uuid

import pytest

from transcript_writer import TranscriptWriter


def test_write_inserts_row(in_memory_db):
    """TranscriptWriter.write() inserts a row into the messages table."""
    session_id = str(uuid.uuid4())
    writer = TranscriptWriter(db_path=in_memory_db, session_id=session_id)
    writer.write(role="user", content="Hello, kitchen!")

    conn = sqlite3.connect(in_memory_db)
    rows = conn.execute("SELECT * FROM messages").fetchall()
    conn.close()

    assert len(rows) == 1


def test_write_sets_correct_fields(in_memory_db):
    """Inserted row has the correct agent_id, project, role, and content."""
    session_id = str(uuid.uuid4())
    writer = TranscriptWriter(db_path=in_memory_db, session_id=session_id)
    writer.write(role="assistant", content="How can I help?")

    conn = sqlite3.connect(in_memory_db)
    row = conn.execute(
        "SELECT session_id, project, agent_id, role, content FROM messages"
    ).fetchone()
    conn.close()

    assert row[0] == session_id
    assert row[1] == "agent-kitchen"
    assert row[2] == "voice"
    assert row[3] == "assistant"
    assert row[4] == "How can I help?"


def test_write_sets_wal_mode(in_memory_db):
    """TranscriptWriter sets journal_mode=WAL on every connection."""
    session_id = str(uuid.uuid4())
    writer = TranscriptWriter(db_path=in_memory_db, session_id=session_id)
    writer.write(role="user", content="WAL test")

    # After write, inspect journal mode (WAL persists on the file)
    conn = sqlite3.connect(in_memory_db)
    mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
    conn.close()

    assert mode == "wal"


def test_write_generates_unique_request_ids(in_memory_db):
    """Each write generates a distinct request_id (uuid4)."""
    session_id = str(uuid.uuid4())
    writer = TranscriptWriter(db_path=in_memory_db, session_id=session_id)
    writer.write(role="user", content="first message")
    writer.write(role="assistant", content="second message")

    conn = sqlite3.connect(in_memory_db)
    request_ids = [r[0] for r in conn.execute("SELECT request_id FROM messages").fetchall()]
    conn.close()

    assert len(request_ids) == 2
    assert request_ids[0] != request_ids[1]
    # Each should be a valid UUID
    for rid in request_ids:
        uuid.UUID(rid)  # raises if not valid


def test_write_sets_timestamp(in_memory_db):
    """Each row has a non-empty ISO-format timestamp."""
    session_id = str(uuid.uuid4())
    writer = TranscriptWriter(db_path=in_memory_db, session_id=session_id)
    writer.write(role="user", content="timestamp test")

    conn = sqlite3.connect(in_memory_db)
    ts = conn.execute("SELECT timestamp FROM messages").fetchone()[0]
    conn.close()

    assert ts is not None
    assert "T" in ts  # ISO 8601 format contains 'T'


def test_write_multiple_sessions_isolated(in_memory_db):
    """Rows from different session_ids are stored independently."""
    session_a = str(uuid.uuid4())
    session_b = str(uuid.uuid4())
    writer_a = TranscriptWriter(db_path=in_memory_db, session_id=session_a)
    writer_b = TranscriptWriter(db_path=in_memory_db, session_id=session_b)

    writer_a.write(role="user", content="session A message")
    writer_b.write(role="user", content="session B message")

    conn = sqlite3.connect(in_memory_db)
    rows_a = conn.execute(
        "SELECT content FROM messages WHERE session_id = ?", (session_a,)
    ).fetchall()
    rows_b = conn.execute(
        "SELECT content FROM messages WHERE session_id = ?", (session_b,)
    ).fetchall()
    conn.close()

    assert len(rows_a) == 1
    assert rows_a[0][0] == "session A message"
    assert len(rows_b) == 1
    assert rows_b[0][0] == "session B message"
