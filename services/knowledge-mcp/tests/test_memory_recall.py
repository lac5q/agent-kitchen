"""Tests for unified memory_recall federation (no live qmd required)."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest

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
        # Isolate from the real connector lane: without this the test
        # passes locally (no DB reachable) and fails on a host where one is.
        connector_search_fn=lambda **_: [],
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
        # Isolate from the real connector lane: without this the test
        # passes locally (no DB reachable) and fails on a host where one is.
        connector_search_fn=lambda **_: [],
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
        # Isolate from the real connector lane: without this the test
        # passes locally (no DB reachable) and fails on a host where one is.
        connector_search_fn=lambda **_: [],
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
        # Isolate from the real connector lane: without this the test
        # passes locally (no DB reachable) and fails on a host where one is.
        connector_search_fn=lambda **_: [],
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
        # Isolate from the real connector lane: without this the test
        # passes locally (no DB reachable) and fails on a host where one is.
        connector_search_fn=lambda **_: [],
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
        # Isolate from the real connector lane: without this the test
        # passes locally (no DB reachable) and fails on a host where one is.
        connector_search_fn=lambda **_: [],
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
        # Isolate from the real connector lane: without this the test
        # passes locally (no DB reachable) and fails on a host where one is.
        connector_search_fn=lambda **_: [],
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


# ---------------------------------------------------------------------------
# CORDANT-HERMES-RECALL-01: connector lane (Linear/Circleback/Notion/GDrive)
#
# Regression: 401+ connector rows were indexed into `messages_fts` (correct
# labels: policy='indexable', visibility='internal') but `recall()` had no
# lane that queried `conversations.db` at all — indexed, unreachable. These
# tests assert actual end-to-end retrievability, not just that a lane key
# exists in the response.
# ---------------------------------------------------------------------------


def _build_conversations_db(path: Path) -> None:
    """Minimal `messages` + `messages_fts` schema mirroring db-schema.ts,
    including the eligibility-gated FTS trigger, so the real
    `sqlite_connector_search` SQL runs against production-shaped data."""
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE messages (
          id          INTEGER PRIMARY KEY,
          session_id  TEXT NOT NULL,
          project     TEXT NOT NULL,
          agent_id    TEXT NOT NULL,
          role        TEXT NOT NULL,
          content     TEXT NOT NULL,
          timestamp   TEXT NOT NULL,
          request_id  TEXT,
          visibility  TEXT NOT NULL DEFAULT 'private',
          policy      TEXT NOT NULL DEFAULT 'sealed',
          space_id    TEXT,
          UNIQUE(session_id, request_id)
        );
        CREATE TABLE space_members (
          space_id    TEXT NOT NULL,
          member_id   TEXT NOT NULL,
          member_type TEXT NOT NULL DEFAULT 'human',
          role        TEXT NOT NULL DEFAULT 'member',
          PRIMARY KEY (space_id, member_id)
        );
        CREATE VIRTUAL TABLE messages_fts USING fts5(
          content, project UNINDEXED, timestamp UNINDEXED, agent_id UNINDEXED,
          content=messages, content_rowid=id, tokenize='unicode61'
        );
        CREATE TRIGGER messages_ai AFTER INSERT ON messages
          WHEN new.policy = 'indexable' AND new.visibility IN ('internal','public_safe','public_approved')
          BEGIN
            INSERT INTO messages_fts(rowid, content, project, timestamp, agent_id)
            VALUES (new.id, new.content, new.project, new.timestamp, new.agent_id);
          END;
        """
    )
    conn.commit()
    conn.close()


def _insert_message(path: Path, **row) -> None:
    row.setdefault("space_id", None)
    conn = sqlite3.connect(path)
    conn.execute(
        """
        INSERT INTO messages (session_id, project, agent_id, role, content,
                               timestamp, request_id, visibility, policy, space_id)
        VALUES (:session_id, :project, :agent_id, :role, :content,
                :timestamp, :request_id, :visibility, :policy, :space_id)
        """,
        row,
    )
    conn.commit()
    conn.close()


def _add_space_member(path: Path, space_id: str, member_id: str) -> None:
    conn = sqlite3.connect(path)
    conn.execute(
        "INSERT OR REPLACE INTO space_members (space_id, member_id) VALUES (?, ?)",
        (space_id, member_id),
    )
    conn.commit()
    conn.close()


def test_connector_lane_returns_known_linear_issue_end_to_end(tmp_path: Path):
    """A real Linear issue synced into `messages` must come back from
    `recall()` via the actual SQL lane — not a mocked connector_search_fn."""
    db_path = tmp_path / "conversations.db"
    _build_conversations_db(db_path)
    _insert_message(
        db_path,
        session_id="linear:23f85f83-2633-4c35-aa60-128871f502dd",
        project="memroos",
        agent_id="connector-sync",
        role="connector",
        content="COR-101 Draft Alacriti FI CAB segment concepts",
        timestamp="2026-07-20T00:00:00Z",
        request_id="COR-101",
        visibility="internal",
        policy="indexable",
    )
    # A row that must NOT surface: sealed/private, same as ordinary chat.
    _insert_message(
        db_path,
        session_id="linear:23f85f83-2633-4c35-aa60-128871f502dd",
        project="memroos",
        agent_id="connector-sync",
        role="connector",
        content="COR-999 Alacriti internal secret notes",
        timestamp="2026-07-20T00:00:00Z",
        request_id="COR-999",
        visibility="private",
        policy="sealed",
    )

    payload = mr.recall(
        "Alacriti",
        limit=10,
        collections=[],
        knowledge_search_fn=lambda **_: [],
        memory_search_fn=lambda **_: {"status": "ok", "results": []},
        connector_search_fn=lambda **kw: mr.sqlite_connector_search(
            kw["query"], limit=kw.get("limit", 10), db_path=db_path
        ),
    )
    assert payload["status"] == "ok"
    titles = [r.get("title") for r in payload["results"]]
    assert any("COR-101" in (t or "") for t in titles)
    assert not any("COR-999" in (t or "") for t in titles)
    assert lane_counts(payload)["connector"] == 1


def lane_counts(payload: dict) -> dict:
    counts: dict = {}
    for r in payload["results"]:
        counts[r["lane"]] = counts.get(r["lane"], 0) + 1
    return counts


def test_connector_lane_collapses_duplicate_circleback_sync_connections(tmp_path: Path):
    """Two Circleback sync connections indexing the same meeting under two
    different session_ids must collapse to ONE hit — the provider-native
    request_id is identical across both, and that is the dedup key."""
    db_path = tmp_path / "conversations.db"
    _build_conversations_db(db_path)
    for session_id in (
        "circleback:3aba3a81-49bd-4b2c-970e-258c9069fa52",
        "circleback:89f3fbd3-89e7-4433-a70e-d08d1fa3e2f7",
    ):
        _insert_message(
            db_path,
            session_id=session_id,
            project="memroos",
            agent_id="connector-sync",
            role="connector",
            content="Eric <> Luis\n\nGTM operating system discussion",
            timestamp="2026-07-15T00:00:00Z",
            request_id="3RzgElh63z0RLHXbeoEzP",
            visibility="internal",
            policy="indexable",
        )

    payload = mr.recall(
        "GTM operating system",
        limit=10,
        collections=[],
        knowledge_search_fn=lambda **_: [],
        memory_search_fn=lambda **_: {"status": "ok", "results": []},
        connector_search_fn=lambda **kw: mr.sqlite_connector_search(
            kw["query"], limit=kw.get("limit", 10), db_path=db_path
        ),
    )
    assert lane_counts(payload)["connector"] == 1


def test_connector_lane_does_not_affect_aggregate_status():
    """A query with zero connector hits must not drag `aggregateStatus` down.
    Connector match/no-match is a normal retrieval outcome, not a pipeline
    stage — folding it into compute_aggregate_status would produce constant
    false alerts on every query with no connector hit (see Phase 186's
    warning about un-tuned health checks training operators to ignore them)."""

    def fake_qmd_run(args, **kwargs):
        collection = args[args.index("-c") + 1] if "-c" in args else ""
        hits = []
        if collection == "spark-recordings":
            hits = [{"file": "x.md", "title": "x", "snippet": "matched", "score": 1.0}]
        return SimpleNamespace(returncode=0, stdout=json.dumps(hits), stderr="")

    payload = mr.recall(
        "x",
        limit=5,
        collections=["spark-recordings"],
        knowledge_search_fn=lambda **_: [],
        memory_search_fn=lambda **_: {"status": "ok", "results": []},
        qmd_runner=fake_qmd_run,
        connector_search_fn=lambda **_: [],  # zero connector hits
        # Supplied so this test isolates the aggregate-status question rather
        # than also picking up the unresolved-identity warning.
        actor_id="cordant-hermes-01:claude",
    )
    assert payload["collections"]["spark-recordings"]["status"] == "recalled"
    assert payload["aggregateStatus"] == "recalled"
    assert "connector" not in payload["collections"]
    assert payload["lanes"]["connector"]["count"] == 0
    assert payload["lanes"]["connector"]["ok"] is True


def test_connector_lane_falls_through_to_http_when_no_db_resolvable(monkeypatch):
    """No conversations.db resolvable at all (the cordant-hermes-01 shape:
    the file is Docker-volume-only) -> falls through to the HTTP fallback,
    which raises ConnectorLaneError when nothing is listening. `recall()`
    must catch that and report `ok: False`, not silently `ok: True`/empty —
    that silent-healthy shape is exactly the original defect."""
    monkeypatch.delenv("MEMROOS_CONVERSATIONS_DB", raising=False)
    monkeypatch.delenv("SQLITE_DB_PATH", raising=False)
    monkeypatch.delenv("MEMROOS_ROOT", raising=False)
    monkeypatch.delenv("MEMROOS_APP_URL", raising=False)
    monkeypatch.delenv("MEMROOS_BASE_URL", raising=False)
    # Port 1 is a reserved, always-unused TCP port -> guaranteed connection refusal.
    monkeypatch.setenv("MEMROOS_APP_URL", "http://127.0.0.1:1")

    payload = mr.recall(
        "anything",
        limit=10,
        collections=[],
        knowledge_search_fn=lambda **_: [],
        memory_search_fn=lambda **_: {"status": "ok", "results": []},
    )
    assert payload["lanes"]["connector"]["ok"] is False
    assert "connector" not in payload["collections"]


def test_sqlite_connector_search_raises_when_explicit_path_unusable(tmp_path: Path):
    """An explicitly resolved path (not 'nothing configured') that fails to
    open is a real error — schema drift or corruption — and must raise
    rather than silently degrade to an empty result."""
    missing = tmp_path / "does-not-exist.db"
    with pytest.raises(mr.ConnectorLaneError):
        mr.sqlite_connector_search("anything", limit=10, db_path=missing)


# ---------------------------------------------------------------------------
# HTTP fallback lane (cordant-hermes-01: conversations.db lives inside a
# Docker-managed volume the host-side MCP process cannot traverse into).
# Auth is loopback-based (GET /api/internal/connector-search) — no
# credential is passed from this side, matching that route's auth model.
# ---------------------------------------------------------------------------


def test_http_connector_search_raises_on_non_200(monkeypatch):
    class FakeResponse:
        status = 401
        def read(self):
            return b"{}"
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False

    monkeypatch.setattr("urllib.request.urlopen", lambda *a, **kw: FakeResponse())
    with pytest.raises(mr.ConnectorLaneError):
        mr.http_connector_search("q", limit=5, base_url="http://x")


def test_http_connector_search_raises_on_connection_error(monkeypatch):
    def boom(*a, **kw):
        raise OSError("connection refused")

    monkeypatch.setattr("urllib.request.urlopen", boom)
    with pytest.raises(mr.ConnectorLaneError):
        mr.http_connector_search("q", limit=5, base_url="http://x")


def test_http_connector_search_raises_on_non_ok_payload(monkeypatch):
    class FakeResponse:
        status = 200
        def read(self):
            return json.dumps({"status": "error", "error": "boom"}).encode()
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False

    monkeypatch.setattr("urllib.request.urlopen", lambda *a, **kw: FakeResponse())
    with pytest.raises(mr.ConnectorLaneError):
        mr.http_connector_search("q", limit=5, base_url="http://x")


def test_http_connector_search_parses_successful_response(monkeypatch):
    class FakeResponse:
        status = 200
        def read(self):
            return json.dumps(
                {
                    "status": "ok",
                    "results": [
                        {
                            "id": 1,
                            "session_id": "linear:conn-1",
                            "request_id": "COR-101",
                            "content": "COR-101 Draft Alacriti FI CAB segment concepts",
                            "timestamp": "2026-07-20T00:00:00Z",
                            "rank": -2.5,
                        }
                    ],
                }
            ).encode()
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False

    captured = {}

    def fake_urlopen(url, timeout=None):
        captured["url"] = url
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    hits = mr.http_connector_search("Alacriti", limit=5, base_url="http://127.0.0.1:3000")

    assert captured["url"].startswith("http://127.0.0.1:3000/api/internal/connector-search?")
    assert "q=Alacriti" in captured["url"]
    assert len(hits) == 1
    assert hits[0]["metadata"]["request_id"] == "COR-101"
    assert hits[0]["collection"] == "linear"


def _seed_space_scoped_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "conversations.db"
    _build_conversations_db(db_path)
    _insert_message(
        db_path,
        session_id="notion:conn-1",
        project="memroos",
        agent_id="connector-sync",
        role="connector",
        content="Alacriti private notion page body",
        timestamp="2026-07-29T00:00:00Z",
        request_id="notion-page-1",
        visibility="internal",
        policy="indexable",
        space_id="spc_notion",
    )
    _insert_message(
        db_path,
        session_id="linear:conn-1",
        project="memroos",
        agent_id="connector-sync",
        role="connector",
        content="Alacriti unscoped linear issue",
        timestamp="2026-07-29T00:01:00Z",
        request_id="COR-101",
        visibility="internal",
        policy="indexable",
    )
    return db_path


def test_space_scoped_connector_row_hidden_from_non_member(tmp_path: Path):
    """The whole point of space scoping: a Notion page in a per-connection
    space must not come back for someone outside that space, even though its
    labels (internal/indexable) would otherwise allow any actor."""
    db_path = _seed_space_scoped_db(tmp_path)
    hits = mr.sqlite_connector_search(
        "Alacriti", limit=10, db_path=db_path, actor_id="user:stranger"
    )
    ids = [h["id"] for h in hits]
    assert ids == ["connector:linear:COR-101"]


def test_space_scoped_connector_row_visible_to_member(tmp_path: Path):
    db_path = _seed_space_scoped_db(tmp_path)
    _add_space_member(db_path, "spc_notion", "user:member")
    hits = mr.sqlite_connector_search(
        "Alacriti", limit=10, db_path=db_path, actor_id="user:member"
    )
    ids = sorted(h["id"] for h in hits)
    assert ids == ["connector:linear:COR-101", "connector:notion:notion-page-1"]


def test_space_scoped_row_hidden_when_actor_identity_is_unresolved(tmp_path: Path):
    """No resolvable identity must not mean 'see everything'."""
    db_path = _seed_space_scoped_db(tmp_path)
    _add_space_member(db_path, "spc_notion", "user:member")
    hits = mr.sqlite_connector_search("Alacriti", limit=10, db_path=db_path, actor_id="")
    ids = [h["id"] for h in hits]
    assert ids == ["connector:linear:COR-101"]


def test_space_scoped_rows_withheld_when_space_members_table_absent(tmp_path: Path):
    """A DB predating the spaces machinery cannot express membership, so
    space-scoped rows must be withheld — but unscoped rows must still return
    (a silent empty lane here would be the original defect all over again)."""
    db_path = tmp_path / "conversations.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE messages (
          id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, project TEXT NOT NULL,
          agent_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
          timestamp TEXT NOT NULL, request_id TEXT,
          visibility TEXT NOT NULL DEFAULT 'private',
          policy TEXT NOT NULL DEFAULT 'sealed', space_id TEXT,
          UNIQUE(session_id, request_id)
        );
        CREATE VIRTUAL TABLE messages_fts USING fts5(
          content, project UNINDEXED, timestamp UNINDEXED, agent_id UNINDEXED,
          content=messages, content_rowid=id, tokenize='unicode61'
        );
        CREATE TRIGGER messages_ai AFTER INSERT ON messages
          WHEN new.policy = 'indexable' AND new.visibility IN ('internal','public_safe','public_approved')
          BEGIN
            INSERT INTO messages_fts(rowid, content, project, timestamp, agent_id)
            VALUES (new.id, new.content, new.project, new.timestamp, new.agent_id);
          END;
        """
    )
    conn.commit()
    conn.close()
    _insert_message(
        db_path,
        session_id="notion:conn-1", project="memroos", agent_id="connector-sync",
        role="connector", content="Alacriti scoped", timestamp="2026-07-29T00:00:00Z",
        request_id="n-1", visibility="internal", policy="indexable", space_id="spc_notion",
    )
    _insert_message(
        db_path,
        session_id="linear:conn-1", project="memroos", agent_id="connector-sync",
        role="connector", content="Alacriti unscoped", timestamp="2026-07-29T00:01:00Z",
        request_id="COR-101", visibility="internal", policy="indexable",
    )

    hits = mr.sqlite_connector_search("Alacriti", limit=10, db_path=db_path, actor_id="user:x")
    ids = [h["id"] for h in hits]
    assert ids == ["connector:linear:COR-101"]


def test_recall_flags_unresolved_identity_on_the_connector_lane(monkeypatch):
    """Silently withholding space-scoped rows because identity failed to
    resolve is indistinguishable from 'nothing matched'. The lane must say so."""
    monkeypatch.delenv("MEMROOS_USER_ID", raising=False)
    monkeypatch.delenv("MEMROOS_AGENT_ID", raising=False)

    payload = mr.recall(
        "anything",
        limit=5,
        collections=[],
        knowledge_search_fn=lambda **_: [],
        memory_search_fn=lambda **_: {"status": "ok", "results": []},
        connector_search_fn=lambda **_: [],
    )
    assert payload["lanes"]["connector"]["identityUnresolved"] is True
    assert "withheld" in payload["lanes"]["connector"]["warning"]


def test_recall_does_not_flag_identity_when_resolved():
    payload = mr.recall(
        "anything",
        limit=5,
        collections=[],
        knowledge_search_fn=lambda **_: [],
        memory_search_fn=lambda **_: {"status": "ok", "results": []},
        connector_search_fn=lambda **_: [],
        actor_id="cordant-hermes-01:claude",
    )
    assert "identityUnresolved" not in payload["lanes"]["connector"]


def test_http_connector_search_sends_actor_identity(monkeypatch):
    """The HTTP lane must carry identity too, or the space gate is a bypass
    on exactly the hosts that use it (cordant-hermes-01)."""
    class FakeResponse:
        status = 200
        def read(self):
            return json.dumps({"status": "ok", "results": []}).encode()
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False

    captured = {}

    def fake_urlopen(url, timeout=None):
        captured["url"] = url
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    mr.http_connector_search("q", limit=5, base_url="http://x", actor_id="user:member")
    assert "user_id=user%3Amember" in captured["url"]


def test_connector_fts_query_falls_back_to_plain_match_on_metacharacters(tmp_path: Path):
    """A query containing FTS5 metacharacters (unbalanced quote) must not
    error the whole lane — it degrades to a plain-token match, same as
    recallByKeyword (apps/memroos/src/lib/db-ingest.ts)."""
    db_path = tmp_path / "conversations.db"
    _build_conversations_db(db_path)
    _insert_message(
        db_path,
        session_id="notion:conn-1",
        project="memroos",
        agent_id="connector-sync",
        role="connector",
        content="Q3 roadmap: multi-tenant rollout",
        timestamp="2026-07-20T00:00:00Z",
        request_id="notion-page-1",
        visibility="internal",
        policy="indexable",
    )
    hits = mr.sqlite_connector_search('multi-tenant"unbalanced', limit=5, db_path=db_path)
    # The malformed phrase-quoted form raises internally and is caught;
    # the plain-token fallback still finds nothing for that exact garbled
    # term, but the call itself must not raise.
    assert hits == []
    hits2 = mr.sqlite_connector_search("multi-tenant", limit=5, db_path=db_path)
    assert len(hits2) == 1
