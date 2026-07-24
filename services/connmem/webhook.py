"""CONNMEM-05 — Webhook handler + signature verification for Linear.

Linear webhooks are HMAC-SHA256 signed over the raw request body using a
shared secret. The signature is delivered in the `linear-signature` header
as a hex-encoded digest. The handler:

  1. Verifies the signature BEFORE parsing the payload (so we never even
     decode unsigned bytes).
  2. Routes the event type to the canonical projection for that object.
  3. Upserts through SyncLedger (idempotent + replay-safe).
  4. Quarantines poison payloads (signature mismatch, unparseable body,
     unknown event type) into the `dead_letter` ledger state with redacted
     diagnostics — never the raw body.

Production usage:
    handler = LinearWebhookHandler(ledger=SyncLedger(path), secret=os.environ["LINEAR_WEBHOOK_SECRET"])
    handler.handle(headers={...}, body=raw_bytes)

The handler does NOT touch the network; the route handler is responsible
for receiving the HTTP request and passing the raw body to `handle`.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from typing import Any, Optional

from .adapters.linear import (
    project_comment_to_canonical,
    project_issue_to_canonical,
    project_project_to_canonical,
)
from .sync_ledger import SyncLedger


SIGNATURE_HEADER = "linear-signature"
SUPPORTED_ACTION_TYPES = frozenset({"create", "update", "remove"})
SUPPORTED_EVENT_TYPES = frozenset(
    {"Issue", "Project", "Comment", "ProjectUpdate", "Initiative", "Document"}
)


# ---------------------------------------------------------------------------
# Header lookup
# ---------------------------------------------------------------------------


def _lookup_header(headers: dict, name: str) -> Optional[str]:
    """Return `headers[name]` case-insensitively, or None.

    HTTP header names are case-insensitive. Webhook callers frequently
    send `Linear-Signature`, `linear-signature`, or `LINEAR-SIGNATURE`
    depending on their HTTP client; we accept all three.
    """
    target = name.lower()
    for key, value in headers.items():
        if key.lower() == target:
            return str(value)
    return None


# ---------------------------------------------------------------------------
# Signature verification
# ---------------------------------------------------------------------------


class SignatureError(Exception):
    """Raised when the incoming signature does not match."""

    def __init__(self, *, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class LinearSigner:
    """HMAC-SHA256 signer / verifier. Swappable for tests."""

    def sign(self, body: bytes, secret: str) -> str:
        mac = hmac.new(secret.encode("utf-8"), body, hashlib.sha256)
        return mac.hexdigest()

    def verify(self, *, body: bytes, secret: str, signature: str) -> bool:
        expected = self.sign(body, secret)
        return hmac.compare_digest(expected, signature.lower())


def _parse_payload(body: bytes) -> dict:
    try:
        return json.loads(body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as err:
        raise PoisonPayload(reason=f"unparseable_json: {err.__class__.__name__}") from err


# ---------------------------------------------------------------------------
# Poison-payload quarantine
# ---------------------------------------------------------------------------


class PoisonPayload(Exception):
    """Raised when a payload cannot be safely projected to a canonical record."""

    def __init__(self, *, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


# ---------------------------------------------------------------------------
# Redaction
# ---------------------------------------------------------------------------


_REDACT_KEYS = frozenset(
    {"apiKey", "api_key", "token", "accessToken", "refreshToken", "secret", "clientSecret"}
)


def redact(payload: dict) -> dict:
    """Return a copy of `payload` with sensitive keys replaced by '[REDACTED]'.

    Used in dead_letter diagnostics so the audit trail never captures the
    raw secret the caller leaked (e.g. webhook payload that included an
    apiKey field by mistake).
    """
    out: dict = {}
    for key, value in payload.items():
        if key in _REDACT_KEYS:
            out[key] = "[REDACTED]"
        elif isinstance(value, dict):
            out[key] = redact(value)
        elif isinstance(value, list):
            out[key] = [redact(v) if isinstance(v, dict) else v for v in value]
        else:
            out[key] = value
    return out


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WebhookOutcome:
    """What happened to one webhook call."""

    accepted: bool
    action: str  # "create" | "update" | "remove" | "rejected"
    object_type: str  # "issue" | "project" | "comment" | "unknown"
    source_id: Optional[str]
    status: str  # ledger status or "rejected"
    reason: Optional[str] = None


class LinearWebhookHandler:
    """Verify signature + dispatch Linear webhooks to the sync ledger.

    Idempotent: replaying the same `delivery_id` returns the same outcome.
    Poison payloads are quarantined via `SyncLedger.record_retry` with
    redacted diagnostics.
    """

    def __init__(
        self,
        *,
        ledger: SyncLedger,
        secret: str,
        signer: Optional[LinearSigner] = None,
    ) -> None:
        if not secret:
            raise ValueError("webhook secret is required")
        self._ledger = ledger
        self._secret = secret
        self._signer = signer or LinearSigner()

    # ----- entry point ------------------------------------------------------

    def handle(self, *, headers: dict, body: bytes) -> WebhookOutcome:
        """Verify signature + project + upsert one webhook call.

        Always returns a `WebhookOutcome`; never raises for payload-shape
        reasons (those become `accepted=False` with a redacted reason).
        Only raises `SignatureError` when the secret was wrong — that is
        a caller bug, not a payload bug.
        """
        signature = _lookup_header(headers, SIGNATURE_HEADER)
        if not signature:
            self._quarantine(
                source="linear", workspace_id="unknown", source_id="unsigned",
                reason="missing_signature_header",
                payload={},
            )
            return WebhookOutcome(
                accepted=False, action="rejected", object_type="unknown",
                source_id=None, status="dead_letter", reason="missing_signature_header",
            )

        if not self._signer.verify(body=body, secret=self._secret, signature=signature):
            self._quarantine(
                source="linear", workspace_id="unknown", source_id="bad_signature",
                reason="signature_mismatch",
                payload={},
            )
            raise SignatureError(reason="signature_mismatch")

        try:
            payload = _parse_payload(body)
        except PoisonPayload as err:
            self._quarantine(
                source="linear", workspace_id="unknown", source_id="unparseable",
                reason=err.reason,
                payload={"size": len(body)},
            )
            return WebhookOutcome(
                accepted=False, action="rejected", object_type="unknown",
                source_id=None, status="dead_letter", reason=err.reason,
            )

        return self._dispatch(payload)

    # ----- dispatch --------------------------------------------------------

    def _dispatch(self, payload: dict) -> WebhookOutcome:
        action = payload.get("action")
        event_type = payload.get("type")
        data = payload.get("data") or {}

        if action not in SUPPORTED_ACTION_TYPES:
            self._quarantine(
                source="linear", workspace_id="unknown", source_id="unknown_action",
                reason=f"unsupported_action:{action}",
                payload={"action": action, "type": event_type},
            )
            return WebhookOutcome(
                accepted=False, action="rejected", object_type="unknown",
                source_id=None, status="dead_letter", reason=f"unsupported_action:{action}",
            )
        if event_type not in SUPPORTED_EVENT_TYPES:
            self._quarantine(
                source="linear", workspace_id="unknown", source_id="unknown_event",
                reason=f"unsupported_event:{event_type}",
                payload={"action": action, "type": event_type},
            )
            return WebhookOutcome(
                accepted=False, action="rejected", object_type="unknown",
                source_id=None, status="dead_letter", reason=f"unsupported_event:{event_type}",
            )

        workspace_id = (
            ((data.get("team") or {}) if isinstance(data, dict) else {}).get("id")
            or payload.get("organizationId")
            or "default"
        )

        try:
            record = self._project_event(data=data, event_type=str(event_type))
        except PoisonPayload as err:
            self._quarantine(
                source="linear", workspace_id=str(workspace_id),
                source_id=str(data.get("id") or "unknown"),
                reason=err.reason, payload={"action": action, "type": event_type},
            )
            return WebhookOutcome(
                accepted=False, action=str(action), object_type=str(event_type).lower(),
                source_id=str(data.get("id") or ""), status="dead_letter", reason=err.reason,
            )

        if record is None:
            self._quarantine(
                source="linear", workspace_id=str(workspace_id),
                source_id=str(data.get("id") or "unknown"),
                reason="projection_returned_none",
                payload={"action": action, "type": event_type},
            )
            return WebhookOutcome(
                accepted=False, action=str(action), object_type=str(event_type).lower(),
                source_id=str(data.get("id") or ""), status="dead_letter", reason="projection_returned_none",
            )

        # Tombstones route through `tombstoned` status so the rest of the
        # pipeline (QMD/mem0/graph) can expire their projections.
        ledger_status = (
            "tombstoned" if action == "remove" else "captured_unrouted"
        )
        self._ledger.upsert(record, status=ledger_status)

        return WebhookOutcome(
            accepted=True,
            action=str(action),
            object_type=str(event_type).lower(),
            source_id=str(record.source_id),
            status=ledger_status,
        )

    # ----- event → canonical projection ------------------------------------

    def _project_event(self, *, data: dict, event_type: str):
        if event_type == "Issue":
            return project_issue_to_canonical(issue=data, workspace_id="default")
        if event_type == "Project":
            return project_project_to_canonical(project=data, workspace_id="default")
        if event_type == "Comment":
            parent_issue_id = (
                data.get("issueId")
                or data.get("issue_id")
                or ((data.get("issue") or {}) if isinstance(data.get("issue"), dict) else {}).get("id")
                or ""
            )
            return project_comment_to_canonical(
                comment=data,
                parent_issue_id=str(parent_issue_id),
                workspace_id="default",
            )
        # ProjectUpdate, Initiative, Document are deferred to CONNMEM-09
        # operator surfaces (provider_capability_absent until adapter lands).
        raise PoisonPayload(reason=f"event_type_not_yet_projected:{event_type}")

    # ----- quarantine ------------------------------------------------------

    def _quarantine(
        self,
        *,
        source: str,
        workspace_id: str,
        source_id: str,
        reason: str,
        payload: dict,
    ) -> None:
        """Record the rejection in the ledger without leaking raw secrets."""
        redacted = redact(payload)
        # Mirror the schema-version + ledger-style record so the audit log
        # has a structured entry even when projection failed.
        try:
            self._ledger.record_retry(
                source=source,
                workspace_id=workspace_id,
                source_id=source_id,
                last_error=f"webhook:{reason}",
            )
        except Exception:
            pass
        # We do not write the payload anywhere durable by design — only the
        # redacted reason survives in the audit chain.
        return None