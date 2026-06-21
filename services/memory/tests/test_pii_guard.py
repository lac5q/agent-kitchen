import hashlib

import pii_guard


def test_protect_memory_payload_uses_presidio_anonymizer(monkeypatch):
    def fake_presidio(text: str) -> pii_guard.PiiResult:
        assert text == "Luis met Ada Lovelace"
        return pii_guard.PiiResult(
            text="Luis met <PERSON>",
            provider=pii_guard.PRESIDIO_PROVIDER,
            entity_types=["PERSON"],
            finding_count=1,
        )

    monkeypatch.setenv("MEMROOS_PII_MODE", "presidio")
    monkeypatch.setattr(pii_guard, "_presidio_anonymize", fake_presidio)

    payload = pii_guard.protect_memory_payload({"text": "Luis met Ada Lovelace", "metadata": {"source": "test"}})

    assert payload["text"] == "Luis met <PERSON>"
    assert payload["metadata"]["source"] == "test"
    assert payload["metadata"]["pii"] == {
        "protected": True,
        "provider": "microsoft-presidio",
        "entity_types": ["PERSON"],
        "finding_count": 1,
        "original_sha256": hashlib.sha256("Luis met Ada Lovelace".encode("utf-8")).hexdigest(),
        "redaction": "replace",
    }


def test_presidio_failure_falls_back_to_local_redaction(monkeypatch):
    def failing_presidio(text: str) -> pii_guard.PiiResult:
        raise ImportError("presidio unavailable")

    monkeypatch.setenv("MEMROOS_PII_MODE", "presidio")
    monkeypatch.setattr(pii_guard, "_presidio_anonymize", failing_presidio)

    payload = pii_guard.protect_memory_payload({"text": "Email ada@example.com and SSN 123-45-6789", "metadata": {}})

    assert payload["text"] == "Email [REDACTED:EMAIL_ADDRESS] and SSN [REDACTED:SSN_US]"
    assert payload["metadata"]["pii"]["provider"] == "fallback-local"
    assert payload["metadata"]["pii"]["entity_types"] == ["EMAIL_ADDRESS", "SSN_US"]
    assert payload["metadata"]["pii"]["fallback_reason"] == "ImportError"
    assert "ada@example.com" not in str(payload["metadata"])
    assert "123-45-6789" not in str(payload["metadata"])


def test_local_mode_never_calls_presidio(monkeypatch):
    def unexpected_presidio(text: str) -> pii_guard.PiiResult:
        raise AssertionError("presidio should not be called")

    monkeypatch.setenv("MEMROOS_PII_MODE", "local")
    monkeypatch.setattr(pii_guard, "_presidio_anonymize", unexpected_presidio)

    payload = pii_guard.protect_memory_payload({"text": "Card 4111-1111-1111-1111", "metadata": {"source": "unit"}})

    assert payload["text"] == "Card [REDACTED:CREDIT_CARD]"
    assert payload["metadata"]["pii"]["provider"] == "fallback-local"


def test_off_mode_leaves_payload_unchanged(monkeypatch):
    monkeypatch.setenv("MEMROOS_PII_MODE", "off")
    payload = {"text": "Email ada@example.com", "metadata": {"source": "test"}}

    assert pii_guard.protect_memory_payload(payload) is payload
