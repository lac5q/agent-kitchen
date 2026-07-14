"""Unified meeting/memory recall — federate QMD meeting collections + knowledge + mem0.

Agents call `memory_recall(query)` without knowing Circleback vs Fathom vs Zoom
collection names. Storage stays federated at query time (private data/context
never merges into git).
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any, Callable, Optional

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


def recall(
    query: str,
    *,
    limit: int = 10,
    collections: Optional[list[str]] = None,
    knowledge_search_fn: Optional[Callable[..., list]] = None,
    memory_search_fn: Optional[Callable[..., dict]] = None,
    qmd_runner: Optional[Callable[..., subprocess.CompletedProcess]] = None,
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

    for col in cols:
        hits = qmd_search_collection(q, col, limit=per_collection, runner=qmd_runner)
        for hit in hits:
            key = hit.get("id") or f"{col}:{hit.get('path')}:{hit.get('content', '')[:80]}"
            if key in seen:
                continue
            seen.add(str(key))
            results.append(hit)
        lanes["qmd"]["count"] = lanes["qmd"].get("count", 0) + len(hits)

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

    # Prefer QMD meeting hits first, then knowledge, then mem0; soft score sort within lane
    lane_rank = {"qmd": 0, "knowledge": 1, "mem0": 2}

    def sort_key(item: dict[str, Any]):
        score = item.get("score")
        score_val = -float(score) if isinstance(score, (int, float)) else 0.0
        return (lane_rank.get(str(item.get("lane")), 9), score_val)

    results.sort(key=sort_key)
    trimmed = results[: max(1, min(int(limit), 25))]

    return {
        "status": "ok",
        "query": q,
        "results": trimmed,
        "lanes": lanes,
        "collections_searched": cols,
        "count": len(trimmed),
    }
