"""Bounded SourceStatus enum for meeting source-to-index evidence chain.

Shared vocabulary between the Python knowledge-mcp server and the TypeScript
operator console. Each literal here is the canonical string; do NOT re-spell
these tokens elsewhere — both languages import these values.

The six cases form an ordered pipeline so an operator can stop at the first
failure instead of guessing which stage the evidence chain broke at:

  provider_absent      -> no provider is configured for this meeting source
  provider_auth_blocked-> provider exists but OAuth / scopes are insufficient
  captured_unrouted    -> raw capture exists in vault but no routing decision
  routed_unindexed     -> routed to a target collection but no QMD index yet
  indexed_unrecalled   -> QMD indexed content but memory_recall returns nothing
  recalled             -> happy path: recall returns the indexed content
"""
from __future__ import annotations

from enum import Enum


class SourceStatus(str, Enum):
    """Bounded status enum shared with the TS operator console."""

    PROVIDER_ABSENT = "provider_absent"
    PROVIDER_AUTH_BLOCKED = "provider_auth_blocked"
    CAPTURED_UNROUTED = "captured_unrouted"
    ROUTED_UNINDEXED = "routed_unindexed"
    INDEXED_UNRECALLED = "indexed_unrecalled"
    RECALLED = "recalled"

    @classmethod
    def values(cls) -> tuple[str, ...]:
        """Return the literal string values for serialization/cross-language checks."""
        return tuple(member.value for member in cls)

    @classmethod
    def is_terminal(cls, status: str) -> bool:
        """Only `recalled` is terminal — anything else is a stop-the-line signal."""
        return str(status) == cls.RECALLED.value


# Canonical ordering — used to roll up "what was the deepest stage that succeeded?"
# If a meeting status traverses the chain, the latest non-`recalled` value tells
# the operator which pre-flight, capture, route, index, or recall step failed.
PIPELINE_ORDER: tuple[str, ...] = (
    SourceStatus.PROVIDER_ABSENT.value,
    SourceStatus.PROVIDER_AUTH_BLOCKED.value,
    SourceStatus.CAPTURED_UNROUTED.value,
    SourceStatus.ROUTED_UNINDEXED.value,
    SourceStatus.INDEXED_UNRECALLED.value,
    SourceStatus.RECALLED.value,
)


def coerce_status(value: str | None) -> str:
    """Map arbitrary input to a known SourceStatus value, defaulting to provider_absent."""
    if value is None:
        return SourceStatus.PROVIDER_ABSENT.value
    needle = str(value).strip().lower()
    for member in SourceStatus:
        if member.value == needle:
            return member.value
    return SourceStatus.PROVIDER_ABSENT.value


def downgrade_to_blocked(value: str | None) -> str:
    """Helper for pre-flight scope checks — any non-`recalled` value becomes provider_auth_blocked."""
    needle = str(value or "").strip().lower()
    if needle == SourceStatus.RECALLED.value:
        return SourceStatus.RECALLED.value
    return SourceStatus.PROVIDER_AUTH_BLOCKED.value


__all__ = [
    "SourceStatus",
    "PIPELINE_ORDER",
    "coerce_status",
    "downgrade_to_blocked",
]
