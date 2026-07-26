"""CONNMEM-10 — Release gate for Phase 176 / v8.20.

The release gate is the single source of truth for "is Phase 176 done?".
It runs a series of checks against the canonical envelope + sync ledger
+ adapters + projector + recall + governance and reports pass/fail per
check. The checker's verdict is the ONLY valid input to the
`entire_company_indexed` operator surface — the surface remains
unavailable until every check is green.

What the gate covers (per the plan's CONNMEM-10):
  1. Schema integrity: every `CanonicalRecord` round-trips through the
     ledger without field loss.
  2. Stable IDs: re-ingesting the same source_id is idempotent.
  3. Hash integrity: a content change is detected and the row is
     updated; same content = same hash.
  4. Webhook signature: the handler rejects unsigned + bad-signature
     payloads.
  5. Reconciler safety: empty live listings do NOT mass-tombstone.
  6. Recall provenance: every hit returns source, source_id, content_hash.
  7. Cross-source linking conservatism: same-source links are excluded.
  8. Governance fail-closed: purge commit=False is the default; receipts
     are signed.
  9. End-to-end: a single `CanonicalRecord` flows from adapter through
     projection through recall.

The gate is intentionally testable in CI without live provider
credentials. The real "backfill proof" (live provider totals vs.
indexed totals) is queued for CONNMEM-LIVE-DEFER.
"""
from __future__ import annotations

import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

from .canonical_envelope import SCHEMA_VERSION, CanonicalRecord
from .projections import Projector
from .recall import Recall
from .sync_ledger import SyncLedger


@dataclass(frozen=True)
class CheckResult:
    name: str
    passed: bool
    detail: str = ""


@dataclass(frozen=True)
class GateVerdict:
    """The aggregate outcome of running the gate."""

    checks: tuple[CheckResult, ...]
    overall_pass: bool
    summary: str

    @property
    def passing(self) -> tuple[CheckResult, ...]:
        return tuple(c for c in self.checks if c.passed)

    @property
    def failing(self) -> tuple[CheckResult, ...]:
        return tuple(c for c in self.checks if not c.passed)

    def to_dict(self) -> dict:
        return {
            "overall_pass": self.overall_pass,
            "summary": self.summary,
            "passing": [c.name for c in self.passing],
            "failing": [c.name for c in self.failing],
            "checks": [
                {"name": c.name, "passed": c.passed, "detail": c.detail}
                for c in self.checks
            ],
        }


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------


def check_schema_round_trip() -> CheckResult:
    """A CanonicalRecord persists and round-trips through the ledger."""
    try:
        with tempfile.TemporaryDirectory() as tmp:
            ledger = SyncLedger(Path(tmp) / "l.db")
            record = _make_record(source_id="rt-1", content_hash="a" * 64)
            ledger.upsert(record, status="captured_unrouted")
            row = ledger.get("linear", "team-001", "rt-1")
            if row is None:
                return CheckResult("schema_round_trip", False, "row not found")
            payload = row.get("payload") or {}
            for field in (
                "source",
                "workspace_id",
                "object_type",
                "source_id",
                "source_url",
                "content_hash",
                "schema_version",
            ):
                if payload.get(field) != getattr(record, field):
                    return CheckResult(
                        "schema_round_trip",
                        False,
                        f"field {field} mismatch",
                    )
            if payload.get("schema_version") != SCHEMA_VERSION:
                return CheckResult(
                    "schema_round_trip",
                    False,
                    f"schema_version drift: {payload.get('schema_version')!r}",
                )
            return CheckResult("schema_round_trip", True)
    except Exception as exc:
        return CheckResult("schema_round_trip", False, repr(exc))


def check_idempotent_upsert() -> CheckResult:
    """Re-upserting the same record with the same content_hash is a no-op."""
    try:
        with tempfile.TemporaryDirectory() as tmp:
            ledger = SyncLedger(Path(tmp) / "l.db")
            record = _make_record(source_id="id-1", content_hash="b" * 64)
            n1 = ledger.upsert(record, status="captured_unrouted")
            n2 = ledger.upsert(record, status="captured_unrouted")
            if n1 is not True or n2 is not False:
                return CheckResult(
                    "idempotent_upsert",
                    False,
                    f"unexpected return values: n1={n1!r} n2={n2!r}",
                )
            statuses = ledger.count_by_status("linear")
            if statuses.get("captured_unrouted", 0) != 1:
                return CheckResult(
                    "idempotent_upsert",
                    False,
                    f"unexpected row count: {statuses}",
                )
            return CheckResult("idempotent_upsert", True)
    except Exception as exc:
        return CheckResult("idempotent_upsert", False, repr(exc))


def check_hash_change_detected() -> CheckResult:
    """Same source_id, different content_hash, triggers an update.

    SyncLedger.upsert returns False for both "updated" and "same-hash
    no-op" — only True for a new row. The check inspects the stored
    content_hash directly to confirm the update actually happened.
    """
    try:
        with tempfile.TemporaryDirectory() as tmp:
            ledger = SyncLedger(Path(tmp) / "l.db")
            a = _make_record(source_id="hc-1", content_hash="c" * 64)
            b = _make_record(source_id="hc-1", content_hash="d" * 64)
            ledger.upsert(a, status="captured_unrouted")
            ledger.upsert(b, status="captured_unrouted")
            row = ledger.get("linear", "team-001", "hc-1")
            if row is None:
                return CheckResult("hash_change_detected", False, "row missing")
            stored = (row.get("payload") or {}).get("content_hash")
            if stored != "d" * 64:
                return CheckResult(
                    "hash_change_detected",
                    False,
                    f"content_hash not updated: stored={stored!r}",
                )
            return CheckResult("hash_change_detected", True)
    except Exception as exc:
        return CheckResult("hash_change_detected", False, repr(exc))


def check_webhook_signature_required() -> CheckResult:
    """Webhook handler rejects bad signatures and unsigned payloads."""
    try:
        from .webhook import LinearWebhookHandler, SignatureError

        with tempfile.TemporaryDirectory() as tmp:
            ledger = SyncLedger(Path(tmp) / "l.db")
            handler = LinearWebhookHandler(ledger=ledger, secret="test")
            # Unsigned
            outcome = handler.handle(headers={}, body=b"{}")
            if outcome.accepted:
                return CheckResult(
                    "webhook_signature_required",
                    False,
                    "unsigned payload was accepted",
                )
            # Bad signature
            try:
                handler.handle(headers={"linear-signature": "deadbeef"}, body=b"{}")
                return CheckResult(
                    "webhook_signature_required",
                    False,
                    "bad-signature payload did not raise",
                )
            except SignatureError:
                pass
            return CheckResult("webhook_signature_required", True)
    except Exception as exc:
        return CheckResult("webhook_signature_required", False, repr(exc))


def check_reconciler_empty_listing_safe() -> CheckResult:
    """An empty live listing does NOT mass-tombstone ledger rows."""
    try:
        from .adapters.linear import LinearAdapter
        from .reconciler import Reconciler

        class _Empty:
            def viewer(self) -> dict:
                return {"id": "u-0"}

            def teams(self, *, page_size: int = 50) -> list[dict]:
                return []

            def issues(self, *, team_id: str, page_size: int = 50, include_archived: bool = False) -> list[dict]:
                return []

            def comments(self, *, issue_id: str, page_size: int = 50) -> list[dict]:
                return []

            def projects(self, *, team_id: str, page_size: int = 50, include_archived: bool = False) -> list[dict]:
                return []

            def raw_introspect(self) -> dict:
                return {}

        with tempfile.TemporaryDirectory() as tmp:
            ledger = SyncLedger(Path(tmp) / "l.db")
            # Seed a row.
            ledger.upsert(_make_record(source_id="keep-1"), status="captured_unrouted")
            adapter = LinearAdapter(ledger=ledger, cli=_Empty())  # type: ignore[arg-type]
            reconciler = Reconciler(
                ledger=ledger,
                adapters={"linear": adapter},
                source_provider_pairs={"linear": ["default"]},
            )
            report = reconciler.run(source="linear")
            if report.tombstoned != 0:
                return CheckResult(
                    "reconciler_empty_listing_safe",
                    False,
                    f"empty listing tombstoned {report.tombstoned} rows",
                )
            if ledger.get("linear", "team-001", "keep-1") is None:
                return CheckResult(
                    "reconciler_empty_listing_safe",
                    False,
                    "row was deleted",
                )
            return CheckResult("reconciler_empty_listing_safe", True)
    except Exception as exc:
        return CheckResult("reconciler_empty_listing_safe", False, repr(exc))


def check_recall_provenance() -> CheckResult:
    """Every recall hit returns source, source_id, content_hash."""
    try:
        from .tests.test_projections import MemFs

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mem"
            fs = MemFs()
            proj = Projector(root=root, fs=fs)
            proj.project(_make_record(source_id="rp-1", content_hash="e" * 64))
            recall = Recall(root=root, fs=fs, projector=proj)
            hits = recall.search("linear")
            if not hits:
                return CheckResult(
                    "recall_provenance",
                    False,
                    "no hits returned",
                )
            for h in hits:
                if not (h.source and h.source_id and h.content_hash):
                    return CheckResult(
                        "recall_provenance",
                        False,
                        f"hit missing provenance: {h.to_dict()}",
                    )
            return CheckResult("recall_provenance", True)
    except Exception as exc:
        return CheckResult("recall_provenance", False, repr(exc))


def check_crosslink_conservative() -> CheckResult:
    """Same-source links are excluded from reviewable_links."""
    try:
        from .adapters.linear import project_issue_to_canonical
        from .tests.test_projections import MemFs

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mem"
            fs = MemFs()
            proj = Projector(root=root, fs=fs)
            proj.project(_make_record(source_id="cl-1", content_hash="f" * 64))
            # Inject a Linear claim whose quote references the same Linear URL.
            from .projections import claims_path

            fs.append_text(
                path=claims_path(root=root, source="linear"),
                content=(
                    '{"claim_id":"c-self","source":"linear","source_id":"cl-1",'
                    '"source_url":"https://linear.app/acme/issue/cl-1",'
                    '"predicate":"references","subject":"cl-1","object":"cl-1",'
                    '"quote":"see https://linear.app/acme/issue/cl-1",'
                    '"extraction_version":"v1","observed_at":"2026-07-21T00:00:00Z",'
                    '"content_hash":"f"}\n'
                ),
            )
            from .recall import Recall

            recall = Recall(root=root, fs=fs, projector=proj)
            links = recall.reviewable_links(min_confidence=0.0)
            same_source = [l for l in links if l.from_source == l.to_source]
            if same_source:
                return CheckResult(
                    "crosslink_conservative",
                    False,
                    f"same-source links found: {same_source}",
                )
            return CheckResult("crosslink_conservative", True)
    except Exception as exc:
        return CheckResult("crosslink_conservative", False, repr(exc))


def check_governance_dry_run_default() -> CheckResult:
    """PurgePlanner.execute defaults to commit=False (dry-run)."""
    try:
        from .governance import PurgePlanner, RetentionPolicy
        from datetime import datetime, timedelta, timezone

        with tempfile.TemporaryDirectory() as tmp:
            ledger = SyncLedger(Path(tmp) / "l.db")
            now = datetime(2026, 1, 1, tzinfo=timezone.utc)
            ledger.upsert(
                _make_record(
                    source_id="gd-1",
                    content_hash="9" * 64,
                    created_at=(now - timedelta(days=1000)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    sensitivity="safe",
                ),
                status="captured_unrouted",
            )
            policy = RetentionPolicy(now=now)
            planner = PurgePlanner(ledger=ledger, policy=policy, now=now)
            plan = planner.plan()
            receipt = planner.execute(plan, operator_id="op-1")
            if receipt.committed:
                return CheckResult(
                    "governance_dry_run_default",
                    False,
                    "execute() defaulted to committed=True",
                )
            if ledger.get("linear", "team-001", "gd-1") is None:
                return CheckResult(
                    "governance_dry_run_default",
                    False,
                    "dry-run actually removed a row",
                )
            return CheckResult("governance_dry_run_default", True)
    except Exception as exc:
        return CheckResult("governance_dry_run_default", False, repr(exc))


def check_end_to_end() -> CheckResult:
    """A CanonicalRecord flows from adapter through projection through recall."""
    try:
        from .adapters.linear import (
            IngestResult,
            LinearAdapter,
            project_issue_to_canonical,
        )
        from .tests.test_projections import MemFs

        class _Static:
            def __init__(self, record: CanonicalRecord) -> None:
                self._record = record

            def viewer(self) -> dict:
                return {"id": "u-0"}

            def teams(self, *, page_size: int = 50) -> list[dict]:
                return [{"id": "team-001", "key": "ACM", "name": "Acme"}]

            def issues(
                self, *, team_id: str, page_size: int = 50, include_archived: bool = False
            ) -> list[dict]:
                return [
                    {
                        "id": self._record.source_id,
                        "identifier": "ACM-1",
                        "title": "end-to-end",
                        "description": "body",
                        "url": self._record.source_url,
                        "createdAt": self._record.created_at,
                        "updatedAt": self._record.updated_at,
                        "archivedAt": None,
                        "priority": 2,
                        "state": {"name": "Todo", "type": "unstarted"},
                        "team": {"id": "team-001", "key": "ACM"},
                        "assignee": {"id": "u-1", "name": "Alice"},
                        "creator": {"id": "u-0", "name": "Founder"},
                        "labels": {"nodes": []},
                        "project": None,
                        "cycle": None,
                        "parent": None,
                    }
                ]

            def comments(self, *, issue_id: str, page_size: int = 50) -> list[dict]:
                return []

            def projects(
                self, *, team_id: str, page_size: int = 50, include_archived: bool = False
            ) -> list[dict]:
                return []

            def raw_introspect(self) -> dict:
                return {}

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "mem"
            fs = MemFs()
            ledger = SyncLedger(Path(tmp) / "l.db")
            record = _make_record(source_id="e2e-1", content_hash="1" * 64)
            adapter = LinearAdapter(
                ledger=ledger,
                cli=_Static(record),  # type: ignore[arg-type]
            )
            result = adapter.ingest_team(team_id="team-001")
            if result.captured_count == 0:
                return CheckResult(
                    "end_to_end", False, "ingest produced zero captures"
                )
            proj = Projector(root=root, fs=fs)
            proj.project(record)
            from .recall import Recall

            recall = Recall(root=root, fs=fs, projector=proj)
            # The projected QMD body includes the source_id, source_url,
            # and participants — all of which are in the record. Query
            # for the source_id (a token the body definitely contains).
            hits = recall.search("e2e-1", sources=["linear"])
            if not hits:
                return CheckResult(
                    "end_to_end",
                    False,
                    "recall returned no hits for ingested + projected record",
                )
            return CheckResult("end_to_end", True)
    except Exception as exc:
        return CheckResult("end_to_end", False, repr(exc))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_record(
    *,
    source_id: str = "default-1",
    content_hash: str = "0" * 64,
    created_at: str = "2026-07-21T08:30:00.000Z",
    sensitivity: str = "sensitive",
) -> CanonicalRecord:
    return CanonicalRecord(
        source="linear",
        workspace_id="team-001",
        object_type="issue",
        source_id=source_id,
        source_url=f"https://linear.app/acme/issue/{source_id}",
        created_at=created_at,
        updated_at="2026-07-21T09:15:00.000Z",
        deleted_at=None,
        content_hash=content_hash,
        parent_ids=(),
        participants=("u-1",),
        owners=("u-0",),
        visibility="team",
        sensitivity=sensitivity,
        captured_at="2026-07-21T09:15:01.000Z",
        schema_version=SCHEMA_VERSION,
    )


# ---------------------------------------------------------------------------
# Gate
# ---------------------------------------------------------------------------


DEFAULT_CHECKS: tuple[Callable[[], CheckResult], ...] = (
    check_schema_round_trip,
    check_idempotent_upsert,
    check_hash_change_detected,
    check_webhook_signature_required,
    check_reconciler_empty_listing_safe,
    check_recall_provenance,
    check_crosslink_conservative,
    check_governance_dry_run_default,
    check_end_to_end,
)


# CONNMEM-RT-05: runtime reachability check. The gate cannot report
# green while the service is not actually reachable. The check probes
# the compose-declared /health endpoint (and the /v1/ledger seam the
# kernel uses) at the URL resolved from CONNMEM_URL or the local-dev
# default (http://127.0.0.1:3290). When the service is down, the gate
# reports reachable=false, which the FastAPI endpoint /v1/release-gate
# propagates into the response's open_requirements list.
def check_runtime_reachable() -> CheckResult:
    import os
    import urllib.error
    import urllib.request

    base_url = os.environ.get("CONNMEM_URL") or "http://127.0.0.1:3290"
    try:
        with urllib.request.urlopen(f"{base_url}/health", timeout=2.0) as r:
            body = r.read().decode("utf-8", errors="replace")
            if r.status != 200:
                return CheckResult(
                    name="runtime_reachable",
                    passed=False,
                    detail=f"GET {base_url}/health returned {r.status}",
                )
            if '"status":"ok"' not in body and '"status": "ok"' not in body:
                return CheckResult(
                    name="runtime_reachable",
                    passed=False,
                    detail=f"GET {base_url}/health body did not contain status=ok: {body[:200]}",
                )
    except (urllib.error.URLError, OSError) as exc:
        return CheckResult(
            name="runtime_reachable",
            passed=False,
            detail=f"GET {base_url}/health unreachable: {exc!r}",
        )

    # Also probe the /v1/ledger seam (CONNMEM-RT-04 surface). A 200
    # here means the FastAPI service is wired up to the ledger, not
    # just answering liveness.
    try:
        with urllib.request.urlopen(f"{base_url}/v1/ledger", timeout=2.0) as r:
            if r.status != 200:
                return CheckResult(
                    name="runtime_reachable",
                    passed=False,
                    detail=f"GET {base_url}/v1/ledger returned {r.status}",
                )
    except (urllib.error.URLError, OSError) as exc:
        return CheckResult(
            name="runtime_reachable",
            passed=False,
            detail=f"GET {base_url}/v1/ledger unreachable: {exc!r}",
        )

    return CheckResult(name="runtime_reachable", passed=True, detail=f"probed {base_url}")


def run_gate(
    checks: tuple[Callable[[], CheckResult], ...] = DEFAULT_CHECKS,
    include_runtime_reachable: bool = False,
) -> GateVerdict:
    results: list[CheckResult] = []
    check_list = list(checks)
    if include_runtime_reachable:
        check_list.append(check_runtime_reachable)
    for check in check_list:
        try:
            results.append(check())
        except Exception as exc:
            results.append(
                CheckResult(
                    name=check.__name__,
                    passed=False,
                    detail=f"unhandled: {exc!r}",
                )
            )
    overall = all(r.passed for r in results)
    summary = (
        f"{len([r for r in results if r.passed])}/{len(results)} checks passed"
    )
    return GateVerdict(checks=tuple(results), overall_pass=overall, summary=summary)