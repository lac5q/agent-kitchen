"""Tests for unified memory_recall federation (no live qmd required)."""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from knowledge_system import memory_recall as mr


def test_load_enabled_meeting_collections_from_config(tmp_path: Path):
    cfg = {
        "sources": [
            {
                "id": "circleback",
                "enabled": True,
                "qmdCollections": ["meet-recordings-circleback"],
            },
            {
                "id": "fathom",
                "enabled": False,
                "qmdCollections": ["meet-recordings-epilogue"],
            },
            {
                "id": "zoom",
                "enabled": True,
                "qmdCollections": ["meet-recordings-zoom"],
            },
        ]
    }
    path = tmp_path / "meeting-sources.json"
    path.write_text(json.dumps(cfg))
    cols = mr.load_enabled_meeting_collections([path])
    assert cols == ["meet-recordings-circleback", "meet-recordings-zoom"]


def test_recall_federates_qmd_without_agent_passing_collection():
    """Agent calls recall(query) only — collections resolved internally (no -c)."""

    def fake_run(args, **kwargs):
        # args: [qmd, search, query, -c, collection, -n, N, --json]
        collection = args[args.index("-c") + 1] if "-c" in args else ""
        query = args[2]
        hits = []
        if collection == "meet-recordings-circleback" and "Monaco" in query:
            hits = [
                {
                    "file": "2026-07-09-monaco-cordant-follow-up.md",
                    "title": "Monaco Cordant Follow-up",
                    "snippet": "Monaco Cordant follow-up via Circleback",
                    "score": 12.0,
                }
            ]
        if collection == "meet-recordings-epilogue" and "Impromptu" in query:
            hits = [
                {
                    "file": "2026-07-10-rec-impromptu.md",
                    "title": "Impromptu Google Meet Meeting",
                    "snippet": "Fathom Impromptu recording",
                    "score": 9.0,
                }
            ]
        return SimpleNamespace(
            returncode=0,
            stdout=json.dumps(hits),
            stderr="",
        )

    payload = mr.recall(
        "Monaco Cordant",
        limit=10,
        collections=["meet-recordings-circleback", "meet-recordings-epilogue"],
        knowledge_search_fn=lambda **_: [],
        memory_search_fn=lambda **_: {"status": "ok", "results": []},
        qmd_runner=fake_run,
    )
    assert payload["status"] == "ok"
    assert payload["count"] >= 1
    assert any("Monaco" in (r.get("title") or "") for r in payload["results"])
    assert "meet-recordings-circleback" in payload["collections_searched"]
    # No agent-supplied -c: collection is in result metadata only
    assert all(r.get("lane") == "qmd" for r in payload["results"] if "Monaco" in (r.get("title") or ""))


def test_recall_fathom_impromptu_without_dash_c():
    def fake_run(args, **kwargs):
        collection = args[args.index("-c") + 1]
        hits = []
        if collection == "meet-recordings-epilogue":
            hits = [
                {
                    "file": "2026-07-10-rec-xyz.md",
                    "title": "Impromptu Google Meet Meeting",
                    "snippet": "calendar_title Impromptu",
                    "score": 8.0,
                }
            ]
        return SimpleNamespace(returncode=0, stdout=json.dumps(hits), stderr="")

    payload = mr.recall(
        "Impromptu",
        limit=5,
        collections=["meet-recordings-epilogue"],
        knowledge_search_fn=lambda **_: [],
        memory_search_fn=lambda **_: {"status": "ok", "results": []},
        qmd_runner=fake_run,
    )
    assert any("Impromptu" in (r.get("title") or "") for r in payload["results"])
