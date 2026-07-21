"""Sync ledger for CONNMEM ingestion (Phase 176).

Per-provider ledger of every canonical record Memroos has observed,
plus the per-record source-to-index state. Records are key-stable across
re-ingestion so the ledger doubles as a dedupe map (Circleback's existing
`meet-recordings-circleback` QMD collection deduplicates against this).

State per ledger row:
    provider, workspace_id, source_id, content_hash, last_seen_at,
    tombstone, dead_letter, status

Status values mirror the existing memory_recall six-state enum; the
ledger is the **persistable** version of that state. memory_recall
consumes the ledger's per-collection status; the ingest path updates
the ledger after every projection succeeds.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .canonical_envelope import CANONICAL_FIELDS, CanonicalRecord


LEDGER_SCHEMA_VERSION = "connmem/sync-ledger/v1"

# Per-record statuses — same shape as the memory_recall six-state enum so
# the unified recall can join the two without translation.
LEDGER_STATUSES = (
    "captured_unrouted",     # envelope OK; not yet projected to QMD/mem0/graph
    "routed_unindexed",      # projected but the index reported zero docs
    "indexed_unrecalled",    # indexed but query returned zero for this object
    "recalled",              # recall path can return this row today
    "tombstoned",            # provider says deleted; projections should expire
    "dead_letter",           # ingest failed permanently; needs human review
)


class SyncLedger:
    """SQLite-backed per-provider ledger.

    The ledger is the durable record of every canonical row Memroos has
    observed. It is intentionally NOT a generic queue: it knows about
    CanonicalRecord shape and the six-state enum. Other components read
    from a public reader interface but only this module writes.

    Open question to be resolved in L5 (live backfill): how to expose the
    same per-row state to the operator UI. For now, status is JSON in the
    same SQLite row alongside the canonical fields.
    """

    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS ledger (
                    ledger_schema TEXT NOT NULL,
                    source TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    object_type TEXT NOT NULL,
                    content_hash TEXT NOT NULL,
                    captured_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT,
                    status TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    -- per-provider sync cursor (e.g., Linear updatedAt, Circleback page cursor)
                    cursor_checkpoint TEXT,
                    -- retry accounting for the ingest path
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    last_error TEXT,
                    tombstone INTEGER NOT NULL DEFAULT 0,
                    dead_letter INTEGER NOT NULL DEFAULT 0,
                    payload_json TEXT NOT NULL,
                    PRIMARY KEY (source, workspace_id, source_id)
                );
                CREATE INDEX IF NOT EXISTS ledger_status_idx ON ledger(status);
                CREATE INDEX IF NOT EXISTS ledger_provider_idx ON ledger(source);
                CREATE INDEX IF NOT EXISTS ledger_hash_idx ON ledger(content_hash);
                CREATE INDEX IF NOT EXISTS ledger_cursor_idx ON ledger(source, cursor_checkpoint);
                CREATE INDEX IF NOT EXISTS ledger_dead_letter_idx ON ledger(dead_letter);
            """)

    def upsert(self, record: CanonicalRecord, *, status: str = "captured_unrouted") -> bool:
        """Insert if new, update content_hash/last_seen_at if changed.

        Returns:
            True if a NEW row was inserted
            False if the row existed and was updated (idempotent re-ingest)

        Per the connection-ledger contract: status='tombstoned' sets the
        tombstone flag to 1; status='dead_letter' sets the dead_letter
        flag to 1. Other statuses clear those flags on update. This keeps
        the six-state enum and the boolean columns consistent.
        """
        if status not in LEDGER_STATUSES:
            raise ValueError(f"invalid status {status!r}; allowed: {LEDGER_STATUSES}")
        ts = self._utc_now()
        tombstone_flag = 1 if status == "tombstoned" else 0
        dead_letter_flag = 1 if status == "dead_letter" else 0
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                "SELECT content_hash FROM ledger WHERE (source, workspace_id, source_id) = (?, ?, ?)",
                (record.source, record.workspace_id, record.source_id),
            )
            row = cur.fetchone()
            if row is None:
                conn.execute(
                    """
                    INSERT INTO ledger (
                        ledger_schema, source, workspace_id, source_id, object_type,
                        content_hash, captured_at, updated_at, deleted_at,
                        status, last_seen_at,
                        tombstone, dead_letter, payload_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        LEDGER_SCHEMA_VERSION,
                        record.source, record.workspace_id, record.source_id,
                        record.object_type, record.content_hash,
                        record.captured_at, record.updated_at, record.deleted_at,
                        status, ts,
                        tombstone_flag, dead_letter_flag, json.dumps(record.to_dict()),
                    ),
                )
                conn.commit()
                return True
            existing_hash = row[0]
            if existing_hash != record.content_hash:
                conn.execute(
                    """
                    UPDATE ledger
                       SET content_hash = ?, updated_at = ?, deleted_at = ?,
                           status = ?, last_seen_at = ?,
                           tombstone = ?, dead_letter = ?, payload_json = ?
                     WHERE (source, workspace_id, source_id) = (?, ?, ?)
                    """,
                    (
                        record.content_hash, record.updated_at, record.deleted_at,
                        status, ts,
                        tombstone_flag, dead_letter_flag, json.dumps(record.to_dict()),
                        record.source, record.workspace_id, record.source_id,
                    ),
                )
            else:
                # Same-hash re-ingestion can still represent a state
                # transition: a row previously 'captured_unrouted' may be
                # 'tombstoned' on the next sync because the provider
                # issued a deletion, even though body content didn't
                # change. The boolean flags MUST update; otherwise
                # deletion propagation silently fails. Caller passes
                # status=... on every call, not only on new bodies.
                conn.execute(
                    """
                    UPDATE ledger
                       SET status = ?, last_seen_at = ?,
                           tombstone = ?, dead_letter = ?
                     WHERE (source, workspace_id, source_id) = (?, ?, ?)
                    """,
                    (
                        status, ts,
                        tombstone_flag, dead_letter_flag,
                        record.source, record.workspace_id, record.source_id,
                    ),
                )
            conn.commit()
            return False

    def set_cursor(self, source: str, cursor_checkpoint: str) -> int:
        """Stamp the per-provider sync cursor.

        Cursor semantics are provider-defined (Linear: updatedAt ISO 8601;
        Circleback: opaque paginated cursor string). The ledger does not
        interpret; it just persists. Returns the number of rows updated
        (typically 1 after the first ingest, 0 before).
        """
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                "UPDATE ledger SET cursor_checkpoint = ? WHERE source = ?",
                (cursor_checkpoint, source),
            )
            conn.commit()
            return cur.rowcount

    def read_cursor(self, source: str) -> Optional[str]:
        """Return the last cursor for a provider, or None if never set."""
        with self._connect() as conn:
            cur = conn.execute(
                "SELECT cursor_checkpoint FROM ledger WHERE source = ? "
                "AND cursor_checkpoint IS NOT NULL ORDER BY last_seen_at DESC LIMIT 1",
                (source,),
            )
            row = cur.fetchone()
            return row[0] if row is not None else None

    def record_retry(self, source: str, workspace_id: str, source_id: str, last_error: str) -> int:
        """Increment retry_count and record last_error. Returns the new retry_count."""
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                """
                UPDATE ledger
                   SET retry_count = retry_count + 1,
                       last_error = ?
                 WHERE (source, workspace_id, source_id) = (?, ?, ?)
                RETURNING retry_count
                """,
                (last_error, source, workspace_id, source_id),
            )
            row = cur.fetchone()
            conn.commit()
            return row[0] if row is not None else 0

    def get(self, source: str, workspace_id: str, source_id: str) -> Optional[dict]:
        with self._connect() as conn:
            cur = conn.execute(
                "SELECT payload_json, status, last_seen_at, tombstone, dead_letter "
                "FROM ledger WHERE (source, workspace_id, source_id) = (?, ?, ?)",
                (source, workspace_id, source_id),
            )
            row = cur.fetchone()
            if row is None:
                return None
            payload, status, last_seen_at, tombstone, dead_letter = row
            return {
                "payload": json.loads(payload),
                "status": status,
                "last_seen_at": last_seen_at,
                "tombstone": bool(tombstone),
                "dead_letter": bool(dead_letter),
            }

    def count_by_status(self, source: Optional[str] = None) -> dict[str, int]:
        with self._connect() as conn:
            if source is None:
                cur = conn.execute(
                    "SELECT status, COUNT(*) FROM ledger GROUP BY status"
                )
            else:
                cur = conn.execute(
                    "SELECT status, COUNT(*) FROM ledger WHERE source = ? GROUP BY status",
                    (source,),
                )
            return {row[0]: row[1] for row in cur.fetchall()}

    def _utc_now(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


__all__ = [
    "LEDGER_SCHEMA_VERSION",
    "LEDGER_STATUSES",
    "SyncLedger",
]
