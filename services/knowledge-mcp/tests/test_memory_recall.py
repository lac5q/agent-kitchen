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


# ---------------------------------------------------------------------------
# MEETREL-FOLLOWUP-05 regression coverage
# ---------------------------------------------------------------------------


def test_recall_surfaces_per_collection_status_for_spark_recordings():
    """PARITY REGRESSION (Phase 172): if `qmd search -c spark-recordings`
    returns a known hit, `memory_recall` MUST surface that hit AND mark the
    collection as `recalled` — never return zero for content qmd finds.

    This was the original Cordant defect (2026-07-15 spark-recordings parity).
    """

    known_token = "Douglas fintech"

    def fake_run(args, **kwargs):
        collection = args[args.index("-c") + 1] if "-c" in args else ""
        hits = []
        if collection == "spark-recordings" and known_token in args[2]:
            hits = [
                {
                    "file": "2026-07-15-325.md",
                    "title": "Eric <> Luis 2026-07-15",
                    "snippet": "Douglas fintech recap from Spark Desktop capture",
                    "score": 96.0,
                    "indexed_at": "2026-07-16T07:12:04Z",
                }
            ]
        return SimpleNamespace(returncode=0, stdout=json.dumps(hits), stderr="")

    payload = mr.recall(
        known_token,
        limit=10,
        collections=["spark-recordings"],
        knowledge_search_fn=lambda **_: [],
        memory_search_fn=lambda **_: {"status": "ok", "results": []},
        qmd_runner=fake_run,
    )
    # Parity requirement: same content qmd finds must come back through recall.
    assert payload["count"] >= 1
    titles = [r.get("title") for r in payload["results"]]
    assert "Eric <> Luis 2026-07-15" in titles
    # Per-collection status block MUST include the spark-recording readback.
    coll = payload.get("collections", {}).get("spark-recordings")
    assert coll is not None
    assert coll["status"] == "recalled"
    assert coll["count"] >= 1
    assert coll["lastIndexAt"] == "2026-07-16T07:12:04Z"
    assert payload["aggregateStatus"] == "recalled"


def test_recall_marks_collection_indexed_unrecalled_when_qmd_finds_zero():
    """If qmd returns [] for a collection, that collection must surface
    as `indexed_unrecalled` — never `recalled` and never silently omitted."""

    def fake_run(args, **kwargs):
        return SimpleNamespace(returncode=0, stdout=json.dumps([]), stderr="")

    payload = mr.recall(
        "anything",
        limit=10,
        collections=["meet-recordings-zoom"],
        knowledge_search_fn=lambda **_: [],
        memory_search_fn=lambda **_: {"status": "ok", "results": []},
        qmd_runner=fake_run,
    )
    coll = payload["collections"]["meet-recordings-zoom"]
    assert coll["status"] == "indexed_unrecalled"
    assert coll["count"] == 0
    # Aggregate rolls up to the deepest non-recalled stage.
    assert payload["aggregateStatus"] == "indexed_unrecalled"
    # No false-positive results returned.
    assert payload["count"] == 0


def test_recall_personal_mirror_returns_known_hit():
    """Same parity fix mirrored for `meet-recordings-personal` so the regression
    is broad rather than narrow."""

    def fake_run(args, **kwargs):
        collection = args[args.index("-c") + 1] if "-c" in args else ""
        hits = []
        if collection == "meet-recordings-personal" and "Lucky" in args[2]:
            hits = [
                {
                    "file": "2026-07-14-lucky-impromptu.md",
                    "title": "Lucky Impromptu",
                    "snippet": "calendar_title Lucky Impromptu",
                    "score": 5.0,
                }
            ]
        return SimpleNamespace(returncode=0, stdout=json.dumps(hits), stderr="")

    payload = mr.recall(
        "Lucky",
        limit=5,
        collections=["meet-recordings-personal"],
        knowledge_search_fn=lambda **_: [],
        memory_search_fn=lambda **_: {"status": "ok", "results": []},
        qmd_runner=fake_run,
    )
    coll = payload["collections"]["meet-recordings-personal"]
    assert coll["status"] == "recalled"
    assert any("Lucky" in (r.get("title") or "") for r in payload["results"])


def test_recall_mixed_state_aggregate_uses_deepest_failed_stage():
    """If one collection recalls and another is empty, aggregate = indexed_unrecalled."""

    def fake_run(args, **kwargs):
        collection = args[args.index("-c") + 1] if "-c" in args else ""
        hits = []
        if collection == "spark-recordings":
            hits = [
                {
                    "file": "x.md",
                    "title": "x",
                    "snippet": "matched",
                    "score": 1.0,
                }
            ]
        return SimpleNamespace(returncode=0, stdout=json.dumps(hits), stderr="")

    payload = mr.recall(
        "x",
        limit=5,
        collections=["spark-recordings", "meet-recordings-circleback"],
        knowledge_search_fn=lambda **_: [],
        memory_search_fn=lambda **_: {"status": "ok", "results": []},
        qmd_runner=fake_run,
    )
    assert payload["collections"]["spark-recordings"]["status"] == "recalled"
    assert payload["collections"]["meet-recordings-circleback"]["status"] == "indexed_unrecalled"
    # Aggregate must surface the deepest non-terminal stage the operator must act on.
    assert payload["aggregateStatus"] == "indexed_unrecalled"


def test_recall_qmd_subprocess_failure_records_error(tmp_path: Path, monkeypatch):
    """When the qmd binary fails (returncode != 0), the collection must still
    surface as `indexed_unrecalled` with the error captured — never silently
    dropped, which is exactly what masked the unified-recall parity defect."""

    def fail_run(args, **kwargs):
        return SimpleNamespace(returncode=2, stdout="", stderr="qmd: missing collection")

    payload = mr.recall(
        "anything",
        limit=10,
        collections=["spark-recordings"],
        knowledge_search_fn=lambda **_: [],
        memory_search_fn=lambda **_: {"status": "ok", "results": []},
        qmd_runner=fail_run,
    )
    coll = payload["collections"]["spark-recordings"]
    assert coll["status"] == "indexed_unrecalled"
    assert coll["count"] == 0
    # No surprise hits surfaced when qmd is broken.
    assert payload["count"] == 0


def test_source_status_enum_values_are_canonical():
    """Both languages must agree on the exact literal strings."""
    from knowledge_system.source_status import SourceStatus, coerce_status

    expected = {
        "provider_absent",
        "provider_auth_blocked",
        "captured_unrouted",
        "routed_unindexed",
        "indexed_unrecalled",
        "recalled",
    }
    assert set(SourceStatus.values()) == expected
    # Coerce falls back to provider_absent on unknown input.
    assert coerce_status("RECALLED") == "recalled"
    assert coerce_status(" totally bogus ") == "provider_absent"
    assert SourceStatus.is_terminal("recalled") is True
    assert SourceStatus.is_terminal("indexed_unrecalled") is False
