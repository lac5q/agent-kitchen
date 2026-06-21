"""Local PII guard for memory storage ingress.

Presidio is the official detector/anonymizer when available. A deterministic
local scanner stays in place as a no-cloud fallback so memory writes never
depend on a paid service or fail open when optional NLP packages are missing.
"""

from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any


PRESIDIO_PROVIDER = "microsoft-presidio"
LOCAL_PROVIDER = "fallback-local"


@dataclass(frozen=True)
class PiiResult:
    text: str
    provider: str
    entity_types: list[str]
    finding_count: int
    fallback_reason: str | None = None


@dataclass(frozen=True)
class LocalFinding:
    entity_type: str
    start: int
    end: int


LOCAL_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("EMAIL_ADDRESS", re.compile(r"[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")),
    ("SSN_US", re.compile(r"\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b")),
    (
        "CREDIT_CARD",
        re.compile(r"\b(?:4[0-9]{3}|5[1-5][0-9]{2}|3[47][0-9]{2}|6(?:011|5[0-9]{2}))[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b"),
    ),
    ("PHONE_NUMBER_US", re.compile(r"\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")),
    ("MEDICAL_RECORD", re.compile(r"\b(?:mrn|medical record|patient id)[:#\s-]*[A-Z0-9-]{4,}\b", re.IGNORECASE)),
)


def _mode() -> str:
    return os.environ.get("MEMROOS_PII_MODE", "presidio").strip().lower()


def _max_chars() -> int:
    raw = os.environ.get("MEMROOS_PII_MAX_CHARS", "8000")
    try:
        parsed = int(raw)
    except ValueError:
        return 8000
    return parsed if parsed > 0 else 8000


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def _overlaps(finding: LocalFinding, existing: list[LocalFinding]) -> bool:
    return any(finding.start < item.end and finding.end > item.start for item in existing)


def _local_anonymize(text: str, fallback_reason: str | None = None) -> PiiResult:
    findings: list[LocalFinding] = []
    for entity_type, pattern in LOCAL_PATTERNS:
        for match in pattern.finditer(text):
            finding = LocalFinding(entity_type=entity_type, start=match.start(), end=match.end())
            if not _overlaps(finding, findings):
                findings.append(finding)

    if not findings:
        return PiiResult(text=text, provider=LOCAL_PROVIDER, entity_types=[], finding_count=0, fallback_reason=fallback_reason)

    redacted = text
    for finding in sorted(findings, key=lambda item: item.start, reverse=True):
        redacted = f"{redacted[:finding.start]}[REDACTED:{finding.entity_type}]{redacted[finding.end:]}"

    return PiiResult(
        text=redacted,
        provider=LOCAL_PROVIDER,
        entity_types=_unique([finding.entity_type for finding in findings]),
        finding_count=len(findings),
        fallback_reason=fallback_reason,
    )


@lru_cache(maxsize=1)
def _presidio_engines() -> tuple[Any, Any]:
    from presidio_analyzer import AnalyzerEngine
    from presidio_anonymizer import AnonymizerEngine

    return AnalyzerEngine(), AnonymizerEngine()


def _presidio_anonymize(text: str) -> PiiResult:
    analyzer, anonymizer = _presidio_engines()
    language = os.environ.get("MEMROOS_PII_LANGUAGE", "en")
    analyzer_results = analyzer.analyze(text=text, language=language)
    if not analyzer_results:
        return PiiResult(text=text, provider=PRESIDIO_PROVIDER, entity_types=[], finding_count=0)

    anonymized = anonymizer.anonymize(text=text, analyzer_results=analyzer_results)
    entity_types = _unique([result.entity_type for result in analyzer_results])
    return PiiResult(text=anonymized.text, provider=PRESIDIO_PROVIDER, entity_types=entity_types, finding_count=len(analyzer_results))


def anonymize_text(text: str) -> PiiResult:
    mode = _mode()
    if mode == "off":
        return PiiResult(text=text, provider="off", entity_types=[], finding_count=0)
    if mode == "local":
        return _local_anonymize(text)
    if len(text) > _max_chars():
        return _local_anonymize(text, fallback_reason="max_chars")

    try:
        return _presidio_anonymize(text)
    except Exception as exc:
        return _local_anonymize(text, fallback_reason=type(exc).__name__)


def protect_memory_payload(payload: dict[str, Any]) -> dict[str, Any]:
    text = payload.get("text")
    if not isinstance(text, str) or not text:
        return payload

    result = anonymize_text(text)
    if result.finding_count == 0:
        return payload

    protected = dict(payload)
    protected["text"] = result.text
    metadata = dict(protected.get("metadata") or {})
    pii_receipt: dict[str, Any] = {
        "protected": True,
        "provider": result.provider,
        "entity_types": result.entity_types,
        "finding_count": result.finding_count,
        "original_sha256": _sha256(text),
        "redaction": "replace",
    }
    if result.fallback_reason:
        pii_receipt["fallback_reason"] = result.fallback_reason
    metadata["pii"] = pii_receipt
    protected["metadata"] = metadata
    return protected
