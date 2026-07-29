"""Unified meeting/memory recall — federate QMD meeting collections + knowledge + mem0 + connectors.

Agents call `memory_recall(query)` without knowing Circleback vs Fathom vs Zoom
collection names. Storage stays federated at query time (private data/context
never merges into git).

Connector lane (CORDANT-HERMES-RECALL-01): `messages` rows with `role='connector'`
(Linear, Circleback, Notion, Google Drive, ...) land in `conversations.db` and
are indexed into `messages_fts` by the same trigger that indexes chat messages
(WHEN policy='indexable' AND visibility IN ('internal','public_safe',
'public_approved')). Prior to this lane, those 401+ indexed connector records
were unreachable through `recall()` — indexed but never searched. See
`services/connmem/recall.py` for a *separate*, currently-unwired attempt at
this that searches a projected QMD file tree; that tree does not exist on
disk anywhere this has been verified, so it is not used here.
"""
from __future__ import annotations

import json
import os
import sqlite3
import subprocess
from pathlib import Path
from typing import Any, Callable, Optional

from .source_status import (
    PIPELINE_ORDER,
    SourceStatus,
    coerce_status,
)

# Known meeting QMD collections when meeting-sources.json is absent.
DEFAULT_MEETING_COLLECTIONS = [
    "meet-recordings",
    "spark-recordings",
    "meet-recordings-circleback",
    "meet-recordings-epilogue",
    "meet-recordings-personal",
    "meet-recordings-zoom",
    "meet-recordings-fathom",
]


def meeting_sources_config_paths() -> list[Path]:
    paths: list[Path] = []
    env = os.environ.get("MEMROOS_MEETING_SOURCES_CONFIG", "").strip()
    if env:
        paths.append(Path(env))
    paths.append(Path.home() / ".memroos" / "meeting-sources.json")
    repo = os.environ.get("MEMROOS_ROOT", "").strip()
    if repo:
        paths.append(Path(repo) / "scripts" / "meet-sync" / "meeting-sources.example.json")
    return paths


def load_enabled_meeting_collections(
    config_paths: Optional[list[Path]] = None,
) -> list[str]:
    """Return unique QMD collection names from enabled meeting sources."""
    for path in config_paths or meeting_sources_config_paths():
        if not path.is_file():
            continue
        try:
            cfg = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        names: list[str] = []
        for source in cfg.get("sources") or []:
            if not source.get("enabled", False):
                continue
            for col in source.get("qmdCollections") or []:
                if isinstance(col, str) and col.strip() and col not in names:
                    names.append(col.strip())
        if names:
            return names
    return list(DEFAULT_MEETING_COLLECTIONS)


def _qmd_bin() -> str:
    return os.environ.get("QMD_BIN", "qmd")


def _qmd_env() -> dict[str, str]:
    env = dict(os.environ)
    env.setdefault("QMD_FORCE_CPU", "1")
    return env


def qmd_search_collection(
    query: str,
    collection: str,
    limit: int = 5,
    *,
    runner: Optional[Callable[..., subprocess.CompletedProcess]] = None,
) -> list[dict[str, Any]]:
    """Run `qmd search QUERY -c COLLECTION -n N --json` and normalize hits."""
    run = runner or subprocess.run
    args = [_qmd_bin(), "search", query, "-c", collection, "-n", str(limit), "--json"]
    try:
        completed = run(
            args,
            check=False,
            capture_output=True,
            env=_qmd_env(),
            text=True,
            timeout=45,
        )
    except FileNotFoundError:
        return []
    except subprocess.TimeoutExpired:
        return []
    if completed.returncode != 0:
        return []
    raw = (completed.stdout or "").strip()
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    items: list[Any]
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = data.get("results") or data.get("hits") or data.get("documents") or []
        if not items and data.get("file"):
            items = [data]
    else:
        items = []

    hits: list[dict[str, Any]] = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            hits.append(
                {
                    "lane": "qmd",
                    "collection": collection,
                    "title": f"{collection} hit",
                    "content": str(item),
                    "score": None,
                    "path": None,
                    "id": f"qmd:{collection}:{idx}",
                }
            )
            continue
        path = item.get("file") or item.get("path") or item.get("id")
        title = item.get("title") or item.get("name") or (Path(str(path)).stem if path else collection)
        content = (
            item.get("snippet")
            or item.get("excerpt")
            or item.get("text")
            or item.get("content")
            or item.get("body")
            or ""
        )
        if not content and path:
            content = str(path)
        score = item.get("score") or item.get("rank") or item.get("bm25")
        hits.append(
            {
                "lane": "qmd",
                "collection": collection,
                "title": str(title),
                "content": str(content)[:4000],
                "score": float(score) if isinstance(score, (int, float)) else None,
                "path": str(path) if path else None,
                "id": f"qmd:{collection}:{path or idx}",
                "metadata": item,
            }
        )
    return hits


def conversations_db_path() -> Optional[Path]:
    """Resolve `conversations.db` the same way the app does (SQLITE_DB_PATH)."""
    env = os.environ.get("MEMROOS_CONVERSATIONS_DB") or os.environ.get("SQLITE_DB_PATH")
    if env:
        p = Path(env)
        return p if p.is_file() else None
    repo = os.environ.get("MEMROOS_ROOT", "").strip()
    if repo:
        p = Path(repo) / "data" / "conversations.db"
        if p.is_file():
            return p
    return None


def _format_connector_rows(
    rows: list[tuple],
) -> list[dict[str, Any]]:
    """Shared row -> hit formatting for both the direct-sqlite and HTTP-fallback
    paths, so source/title/dedup-id derivation lives in exactly one place."""
    hits: list[dict[str, Any]] = []
    for row_id, session_id, request_id, content, timestamp, rank in rows:
        source = str(session_id or "").split(":", 1)[0] or "connector"
        body = str(content or "")
        title = body.splitlines()[0].strip() if body.strip() else source
        hits.append(
            {
                "lane": "connector",
                "collection": source,
                "title": title[:200] or source,
                "content": body[:4000],
                "score": -float(rank) if rank is not None else None,
                "path": None,
                # request_id is the provider-native id (e.g. a Circleback
                # meeting id or a Linear issue key) and is stable across
                # duplicate sync connections for the same underlying
                # record — this is the dedup key, not the row id.
                "id": f"connector:{source}:{request_id or row_id}",
                "metadata": {
                    "source": source,
                    "session_id": session_id,
                    "request_id": request_id,
                    "timestamp": timestamp,
                },
            }
        )
    return hits


class ConnectorLaneError(RuntimeError):
    """Raised when the connector lane could not execute at all — as opposed
    to executing and finding zero matches. Callers MUST NOT report the lane
    as `ok: True` when this is raised: a lane that swallows a real failure
    into an empty result is exactly the "indexed but never searched" shape
    of the original defect this lane exists to fix, just moved one layer
    down. `recall()` catches this (and any other exception) and records
    `lanes["connector"] = {"ok": False, "error": ...}`."""


def _connector_app_base_url() -> str:
    return (
        os.environ.get("MEMROOS_APP_URL", "").strip()
        or os.environ.get("MEMROOS_BASE_URL", "").strip()
        or f"http://127.0.0.1:{os.environ.get('MEMROOS_PORT', '3000').strip()}"
    )


def http_connector_search(
    query: str,
    *,
    limit: int = 10,
    base_url: Optional[str] = None,
    timeout: float = 5.0,
) -> list[dict[str, Any]]:
    """Fallback lane for hosts where conversations.db is only reachable
    inside a Docker-managed volume (e.g. cordant-hermes-01: the host-side
    MCP process runs as an unprivileged user that cannot traverse
    /var/lib/docker). Calls the app's GET /api/internal/connector-search,
    which authorizes loopback callers with no credential required (see that
    route's docstring) — this process and the app share the same host.

    Uses stdlib `urllib` rather than `httpx` so this fallback keeps working
    even if a dependency refresh is needed on the host — the MCP entrypoint
    (scripts/memroos-mcp.sh) does not run `pip install` on a plain
    `git pull`, only when its own httpx/fastmcp import check fails.

    Raises ConnectorLaneError on any failure (unreachable, non-200,
    malformed JSON) — never silently degrades to an empty list here; the
    caller decides what "lane unavailable" should look like.
    """
    import urllib.error
    import urllib.parse
    import urllib.request

    url_base = (base_url or _connector_app_base_url()).rstrip("/")
    qs = urllib.parse.urlencode({"q": query, "limit": max(1, int(limit))})
    url = f"{url_base}/api/internal/connector-search?{qs}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:  # noqa: S310 — loopback only
            status = getattr(resp, "status", 200)
            raw = resp.read().decode("utf-8")
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        raise ConnectorLaneError(f"connector HTTP fallback unreachable at {url_base}: {exc}") from exc
    if status != 200:
        raise ConnectorLaneError(f"connector HTTP fallback returned HTTP {status}")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ConnectorLaneError(f"connector HTTP fallback returned invalid JSON: {exc}") from exc
    if not isinstance(payload, dict) or payload.get("status") != "ok":
        raise ConnectorLaneError(f"connector HTTP fallback returned a non-ok payload: {payload!r}")
    rows = [
        (
            r.get("id"),
            r.get("session_id"),
            r.get("request_id"),
            r.get("content"),
            r.get("timestamp"),
            r.get("rank"),
        )
        for r in (payload.get("results") or [])
        if isinstance(r, dict)
    ]
    return _format_connector_rows(rows)


def _connector_fts_query(conn: sqlite3.Connection, query: str, limit: int) -> list[tuple]:
    """Phrase-first, plain-fallback MATCH — mirrors `recallByKeyword`'s
    pattern (apps/memroos/src/lib/db-ingest.ts) so an FTS5 metacharacter in
    the query text (unbalanced quote, bare hyphen, colon, ...) degrades to a
    plain-token match instead of erroring the whole connector lane."""
    sql = """
        SELECT m.id, m.session_id, m.request_id, m.content, m.timestamp,
               bm25(messages_fts) AS rank
        FROM messages_fts
        JOIN messages m ON m.id = messages_fts.rowid
        WHERE messages_fts MATCH ?
          AND m.role = 'connector'
          AND m.policy = 'indexable'
          AND m.visibility IN ('internal', 'public_safe', 'public_approved')
        ORDER BY rank
        LIMIT ?
    """
    safe_limit = max(1, int(limit))
    try:
        rows = conn.execute(sql, (f'"{query}"', safe_limit)).fetchall()
        if rows:
            return rows
    except sqlite3.OperationalError:
        pass
    try:
        return conn.execute(sql, (query, safe_limit)).fetchall()
    except sqlite3.OperationalError:
        # A malformed query string (e.g. an unescaped quote) is a client-input
        # shape, not a lane-health failure — degrade to no matches rather
        # than raising, matching recallByKeyword's own catch-and-return-[].
        return []


def sqlite_connector_search(
    query: str,
    *,
    limit: int = 10,
    db_path: Optional[Path] = None,
) -> list[dict[str, Any]]:
    """Search connector-sourced `messages` rows via the existing `messages_fts` index.

    Mirrors the FTS trigger's eligibility predicate exactly
    (`policy='indexable' AND visibility IN (...)`) — this is defense-in-depth
    against drift, since any row that made it into `messages_fts` already
    satisfies it. Scoped to `role='connector'` so chat messages (already
    covered by other lanes/products) are not duplicated here.

    Resolution order:
    - No `conversations.db` resolvable at all (the normal case on hosts
      where it lives inside a Docker-managed volume, e.g. cordant-hermes-01)
      -> fall through to `http_connector_search`.
    - A path IS resolved (explicit `db_path`, or `conversations_db_path()`
      found a file) but fails to open or query -> raise `ConnectorLaneError`.
      This is deliberately NOT a silent fallback to `[]`: a resolved path
      that fails to query is schema drift or corruption, a real bug, not
      "try the other lane" — silently swallowing it is exactly how the
      original defect (indexed, never searched) went unnoticed.
    """
    path = db_path or conversations_db_path()
    if path is None:
        return http_connector_search(query, limit=limit)
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except sqlite3.OperationalError as exc:
        raise ConnectorLaneError(f"could not open conversations.db at {path}: {exc}") from exc
    try:
        rows = _connector_fts_query(conn, query, limit)
    except sqlite3.OperationalError as exc:
        raise ConnectorLaneError(f"connector query failed against {path}: {exc}") from exc
    finally:
        conn.close()

    return _format_connector_rows(rows)


def recall(
    query: str,
    *,
    limit: int = 10,
    collections: Optional[list[str]] = None,
    knowledge_search_fn: Optional[Callable[..., list]] = None,
    memory_search_fn: Optional[Callable[..., dict]] = None,
    qmd_runner: Optional[Callable[..., subprocess.CompletedProcess]] = None,
    connector_search_fn: Optional[Callable[..., list]] = None,
) -> dict[str, Any]:
    """Federate meeting QMD + knowledge literal + mem0 into one result set."""
    q = (query or "").strip()
    if not q:
        return {"status": "error", "error": "query is required", "results": [], "lanes": {}}

    per_collection = max(2, min(limit, 8))
    cols = collections if collections is not None else load_enabled_meeting_collections()
    lanes: dict[str, Any] = {"qmd": {"collections": cols, "count": 0, "ok": True}}
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    # MEETREL-FOLLOWUP-05: track per-collection recall status so a meeting lookup
    # returns a bounded status per source. Operators can now distinguish
    # `recalled` (>=1 hit) from `indexed_unrecalled` (qmd ran but returned 0).
    collections_status: dict[str, dict[str, Any]] = {}
    for col in cols:
        try:
            hits = qmd_search_collection(q, col, limit=per_collection, runner=qmd_runner)
        except Exception as exc:  # noqa: BLE001
            collections_status[col] = {
                "status": SourceStatus.INDEXED_UNRECALLED.value,
                "count": 0,
                "lastIndexAt": None,
                "error": str(exc),
            }
            continue
        retained = 0
        last_indexed_hint: str | None = None
        for hit in hits:
            key = hit.get("id") or f"{col}:{hit.get('path')}:{hit.get('content', '')[:80]}"
            if key in seen:
                continue
            seen.add(str(key))
            results.append(hit)
            retained += 1
            meta = hit.get("metadata") or {}
            indexed_at = meta.get("indexed_at") or meta.get("indexedAt") or meta.get("updated_at")
            if isinstance(indexed_at, str) and not last_indexed_hint:
                last_indexed_hint = indexed_at
        lanes["qmd"]["count"] = lanes["qmd"].get("count", 0) + len(hits)
        # `recalled` only when at least one *retained* hit made it past dedup.
        # raw `len(hits)` can mask the parity defect when qmd returns dup ids.
        collection_status_value = (
            SourceStatus.RECALLED.value if retained > 0 else SourceStatus.INDEXED_UNRECALLED.value
        )
        collections_status[col] = {
            "status": collection_status_value,
            "count": retained,
            "lastIndexAt": last_indexed_hint,
        }

    # Knowledge literal (KNOWLEDGE_ROOT) — secondary lane
    knowledge_hits: list[dict[str, Any]] = []
    if knowledge_search_fn is not None:
        try:
            raw = knowledge_search_fn(query=q, limit=min(limit, 10))
            for idx, item in enumerate(raw or []):
                if not isinstance(item, dict):
                    continue
                path = item.get("path") or item.get("file") or item.get("id")
                content = item.get("snippet") or item.get("content") or item.get("text") or ""
                key = f"knowledge:{path or idx}"
                if key in seen:
                    continue
                seen.add(key)
                hit = {
                    "lane": "knowledge",
                    "collection": None,
                    "title": item.get("title") or (Path(str(path)).name if path else "knowledge"),
                    "content": str(content)[:4000],
                    "score": item.get("score"),
                    "path": str(path) if path else None,
                    "id": key,
                    "metadata": item,
                }
                knowledge_hits.append(hit)
                results.append(hit)
            lanes["knowledge"] = {"count": len(knowledge_hits), "ok": True}
        except Exception as exc:  # noqa: BLE001
            lanes["knowledge"] = {"count": 0, "ok": False, "error": str(exc)}
    else:
        lanes["knowledge"] = {"count": 0, "ok": False, "error": "knowledge_search not wired"}

    # mem0 / durable memory — tertiary lane
    memory_hits: list[dict[str, Any]] = []
    if memory_search_fn is not None:
        try:
            payload = memory_search_fn(query=q, limit=min(limit, 5))
            raw_results = []
            if isinstance(payload, dict):
                raw_results = payload.get("results") or []
                mem_ok = payload.get("status") == "ok"
            else:
                raw_results = payload or []
                mem_ok = True
            for idx, item in enumerate(raw_results):
                if not isinstance(item, dict):
                    text = str(item)
                    key = f"mem0:{idx}:{text[:40]}"
                    if key in seen:
                        continue
                    seen.add(key)
                    hit = {
                        "lane": "mem0",
                        "title": "memory",
                        "content": text[:4000],
                        "id": key,
                        "score": None,
                        "path": None,
                        "collection": None,
                    }
                    memory_hits.append(hit)
                    results.append(hit)
                    continue
                text = item.get("memory") or item.get("content") or item.get("text") or ""
                key = f"mem0:{item.get('id') or idx}"
                if key in seen:
                    continue
                seen.add(key)
                hit = {
                    "lane": "mem0",
                    "title": "memory",
                    "content": str(text)[:4000],
                    "id": key,
                    "score": item.get("score"),
                    "path": None,
                    "collection": None,
                    "metadata": item,
                }
                memory_hits.append(hit)
                results.append(hit)
            lanes["mem0"] = {"count": len(memory_hits), "ok": mem_ok}
        except Exception as exc:  # noqa: BLE001
            lanes["mem0"] = {"count": 0, "ok": False, "error": str(exc)}
    else:
        lanes["mem0"] = {"count": 0, "ok": False, "error": "memory_search not wired"}

    # Connector lane (Linear, Circleback, Notion, Google Drive, ...) — quaternary.
    # Deliberately NOT folded into `collections_status` / `compute_aggregate_status`:
    # that rollup reports the weakest *pipeline* stage (provider_absent ->
    # indexed_unrecalled -> recalled) for the QMD meeting collections it was
    # designed for. "This query matched no connector record" is a normal
    # retrieval outcome, not a degraded pipeline stage — folding it in would
    # drag aggregateStatus down on every query with no connector hit and train
    # operators to ignore it (the exact alert-fatigue failure Phase 186 warns
    # about for host-aware health checks). Connector lane health is reported
    # separately in `lanes["connector"]`.
    connector_hits: list[dict[str, Any]] = []
    search_connectors = connector_search_fn or sqlite_connector_search
    try:
        raw_hits = search_connectors(query=q, limit=min(limit, 20)) or []
        seen_connector_keys: set[str] = set()
        for hit in raw_hits:
            if not isinstance(hit, dict):
                continue
            key = str(hit.get("id") or "")
            # Dedup on the connector-native id (request_id), not row id/path —
            # duplicate sync connections (e.g. two Circleback connections
            # indexing the same meeting under different session_ids) share the
            # same request_id and must collapse to one hit.
            if key in seen or key in seen_connector_keys:
                continue
            seen.add(key)
            seen_connector_keys.add(key)
            connector_hits.append(hit)
            results.append(hit)
        lanes["connector"] = {"count": len(connector_hits), "ok": True}
    except Exception as exc:  # noqa: BLE001
        lanes["connector"] = {"count": 0, "ok": False, "error": str(exc)}

    # Prefer QMD meeting hits first, then knowledge, then connector, then mem0.
    lane_rank = {"qmd": 0, "knowledge": 1, "connector": 2, "mem0": 3}

    def sort_key(item: dict[str, Any]):
        score = item.get("score")
        score_val = -float(score) if isinstance(score, (int, float)) else 0.0
        return (lane_rank.get(str(item.get("lane")), 9), score_val)

    results.sort(key=sort_key)
    trimmed = results[: max(1, min(int(limit), 25))]

    # Aggregate per-collection evidence bundle for operators. The dominant
    # status is the deepest-stage value reached across any collection, so a
    # single mixed-state recall (e.g. spark recalled, circleback absent) still
    # returns the most-failed stage the operator must act on first.
    aggregate = compute_aggregate_status(collections_status)
    return {
        "status": "ok",
        "query": q,
        "results": trimmed,
        "lanes": lanes,
        "collections_searched": cols,
        "collections": collections_status,
        "aggregateStatus": aggregate,
        "count": len(trimmed),
    }


def compute_aggregate_status(
    collections_status: dict[str, dict[str, Any]],
) -> str:
    """Roll up per-collection statuses into the weakest-pipeline-stage seen.

    Pipeline order is defined in source_status.PIPELINE_ORDER. `recalled`
    is the only terminal status; mixed runs return the EARLIEST (shallowest)
    stage that needs operator attention. This matches operator expectation:
    if even one collection is `provider_absent` while another is `recalled`,
    the operator must first re-authorize the absent provider — `recalled`
    cannot mask a stopped pre-flight.
    """
    if not collections_status:
        return SourceStatus.PROVIDER_ABSENT.value
    weakest_idx = len(PIPELINE_ORDER)
    for payload in collections_status.values():
        status = coerce_status((payload or {}).get("status"))
        try:
            weakest_idx = min(weakest_idx, PIPELINE_ORDER.index(status))
        except ValueError:
            continue
    if weakest_idx >= len(PIPELINE_ORDER):
        return SourceStatus.PROVIDER_ABSENT.value
    return PIPELINE_ORDER[weakest_idx]
