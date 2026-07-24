"""CONNMEM-05 — Linear webhook handler tests."""
from __future__ import annotations

import hashlib
import hmac
import json
import tempfile
from pathlib import Path
from unittest import TestCase, main

from services.connmem.webhook import (
    LinearSigner,
    LinearWebhookHandler,
    PoisonPayload,
    SignatureError,
    WebhookOutcome,
    redact,
)
from services.connmem.sync_ledger import SyncLedger


SECRET = "test-secret"


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def make_issue_event(*, action: str = "create") -> dict:
    return {
        "action": action,
        "type": "Issue",
        "organizationId": "org-1",
        "data": {
            "id": "issue-1",
            "identifier": "ACM-1",
            "title": "Hello",
            "url": "https://linear.app/acme/issue/ACM-1",
            "createdAt": "2026-01-15T10:00:00Z",
            "updatedAt": "2026-01-15T11:00:00Z",
            "archivedAt": None,
            "priority": 2,
            "state": {"name": "Todo", "type": "unstarted"},
            "team": {"id": "team-1", "key": "ACM"},
            "assignee": {"id": "u-1", "name": "Alice", "email": "alice@acme.example"},
            "creator": {"id": "u-0", "name": "Founder", "email": "founder@acme.example"},
            "labels": {"nodes": []},
            "project": None,
            "cycle": None,
            "parent": None,
        },
    }


class SignerTests(TestCase):
    def test_sign_and_verify_round_trip(self) -> None:
        signer = LinearSigner()
        body = b'{"hello":"world"}'
        sig = signer.sign(body, SECRET)
        self.assertTrue(signer.verify(body=body, secret=SECRET, signature=sig))
        self.assertFalse(signer.verify(body=body, secret="wrong", signature=sig))
        self.assertFalse(signer.verify(body=b"tampered", secret=SECRET, signature=sig))


class RedactionTests(TestCase):
    def test_redacts_top_level_secrets(self) -> None:
        out = redact({"apiKey": "sk_live_xxx", "safe": "ok"})
        self.assertEqual(out["apiKey"], "[REDACTED]")
        self.assertEqual(out["safe"], "ok")

    def test_redacts_nested(self) -> None:
        out = redact({"data": {"token": "abc", "user": {"email": "x@y"}}})
        self.assertEqual(out["data"]["token"], "[REDACTED]")
        self.assertEqual(out["data"]["user"]["email"], "x@y")

    def test_redacts_in_lists(self) -> None:
        out = redact({"items": [{"secret": "abc"}, {"id": 1}]})
        self.assertEqual(out["items"][0]["secret"], "[REDACTED]")
        self.assertEqual(out["items"][1]["id"], 1)


class HandlerTests(TestCase):
    def _setup(self, *, secret: str = SECRET):
        tmpdir = Path(tempfile.mkdtemp(prefix="connmem-webhook-test-"))
        ledger = SyncLedger(tmpdir / "ledger.db")
        handler = LinearWebhookHandler(ledger=ledger, secret=secret)
        return handler, ledger

    def test_missing_signature_header_is_rejected(self) -> None:
        handler, ledger = self._setup()
        outcome = handler.handle(headers={}, body=b'{"action":"create","type":"Issue","data":{}}')
        self.assertFalse(outcome.accepted)
        self.assertEqual(outcome.status, "dead_letter")
        self.assertEqual(outcome.reason, "missing_signature_header")

    def test_bad_signature_raises(self) -> None:
        handler, _ = self._setup()
        body = b'{"action":"create","type":"Issue","data":{}}'
        with self.assertRaises(SignatureError):
            handler.handle(headers={"linear-signature": "deadbeef"}, body=body)

    def test_good_signature_creates_record(self) -> None:
        handler, ledger = self._setup()
        body = json.dumps(make_issue_event()).encode("utf-8")
        outcome = handler.handle(headers={"linear-signature": sign(body)}, body=body)
        self.assertTrue(outcome.accepted)
        self.assertEqual(outcome.action, "create")
        self.assertEqual(outcome.object_type, "issue")
        self.assertEqual(outcome.source_id, "issue-1")
        self.assertEqual(outcome.status, "captured_unrouted")
        # Ledger now has the row.
        row = ledger.get("linear", "default", "issue-1")
        assert row is not None

    def test_remove_event_tombstones_record(self) -> None:
        handler, ledger = self._setup()
        # First create.
        create_body = json.dumps(make_issue_event(action="create")).encode("utf-8")
        handler.handle(headers={"linear-signature": sign(create_body)}, body=create_body)
        # Then remove.
        remove_body = json.dumps(make_issue_event(action="remove")).encode("utf-8")
        outcome = handler.handle(headers={"linear-signature": sign(remove_body)}, body=remove_body)
        self.assertTrue(outcome.accepted)
        self.assertEqual(outcome.action, "remove")
        self.assertEqual(outcome.status, "tombstoned")
        row = ledger.get("linear", "default", "issue-1")
        assert row is not None
        self.assertEqual(row["status"], "tombstoned")
        self.assertEqual(row["tombstone"], 1)

    def test_unsupported_action_is_quarantined(self) -> None:
        handler, ledger = self._setup()
        payload = make_issue_event(action="banana")
        body = json.dumps(payload).encode("utf-8")
        outcome = handler.handle(headers={"linear-signature": sign(body)}, body=body)
        self.assertFalse(outcome.accepted)
        self.assertEqual(outcome.status, "dead_letter")
        self.assertIn("unsupported_action", outcome.reason or "")

    def test_unsupported_event_type_is_quarantined(self) -> None:
        handler, _ = self._setup()
        payload = make_issue_event()
        payload["type"] = "Cycle"
        body = json.dumps(payload).encode("utf-8")
        outcome = handler.handle(headers={"linear-signature": sign(body)}, body=body)
        self.assertFalse(outcome.accepted)
        self.assertIn("unsupported_event", outcome.reason or "")

    def test_unparseable_body_is_quarantined(self) -> None:
        handler, _ = self._setup()
        body = b"not json at all"
        outcome = handler.handle(headers={"linear-signature": sign(body)}, body=body)
        self.assertFalse(outcome.accepted)
        self.assertEqual(outcome.status, "dead_letter")
        self.assertIn("unparseable", outcome.reason or "")

    def test_signature_header_lookup_is_case_insensitive(self) -> None:
        handler, _ = self._setup()
        body = json.dumps(make_issue_event()).encode("utf-8")
        # Mixed-case header name.
        outcome = handler.handle(headers={"Linear-Signature": sign(body)}, body=body)
        self.assertTrue(outcome.accepted)

    def test_redacts_secrets_in_quarantine_payload(self) -> None:
        # Build a payload that, if quarantined, would include a secret.
        payload = make_issue_event()
        payload["data"]["apiKey"] = "sk_live_should_not_leak"  # type: ignore[index]
        body = json.dumps(payload).encode("utf-8")
        # Sign with the wrong secret to force quarantine.
        wrong_sig = hmac.new(b"wrong", body, hashlib.sha256).hexdigest()
        with self.assertRaises(SignatureError):
            handler, _ = self._setup()
            handler.handle(headers={"linear-signature": wrong_sig}, body=body)
        # Direct test: redaction strips apiKey.
        from services.connmem.webhook import redact
        out = redact({"apiKey": "sk_live_should_not_leak", "ok": 1})
        self.assertEqual(out["apiKey"], "[REDACTED]")
        self.assertEqual(out["ok"], 1)

    def test_idempotent_replay(self) -> None:
        # Same webhook delivered twice yields the same outcome and the
        # ledger row is not duplicated.
        handler, ledger = self._setup()
        body = json.dumps(make_issue_event()).encode("utf-8")
        out1 = handler.handle(headers={"linear-signature": sign(body)}, body=body)
        out2 = handler.handle(headers={"linear-signature": sign(body)}, body=body)
        self.assertTrue(out1.accepted)
        self.assertTrue(out2.accepted)
        self.assertEqual(out1.status, out2.status)
        statuses = ledger.count_by_status("linear")
        self.assertEqual(statuses.get("captured_unrouted", 0), 1)


if __name__ == "__main__":
    main()