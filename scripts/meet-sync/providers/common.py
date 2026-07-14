"""Shared helpers for MemRoOS meet-sync provider transforms.

Idempotent filenames use stable provider IDs (recording_id / meeting_id / uuid).
Re-ingest overwrites the same path — never creates `-2` slug collision copies.
"""
from __future__ import annotations

import re
from typing import Any


def slugify(text: str, max_len: int = 60) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return text[:max_len] or "untitled"


def safe_id(value: Any, fallback: str = "unknown") -> str:
    """Sanitize a provider id for use in a filename."""
    raw = str(value or "").strip()
    if not raw:
        return fallback
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", raw).strip("-._")
    return (cleaned[:80] or fallback)


def idempotent_filename(date_prefix: str, stable_id: str, title: str | None = None) -> str:
    """Build `{date}-{id}.md`. Title is optional for readability only when id is weak."""
    sid = safe_id(stable_id)
    if sid in {"unknown", "untitled"} and title:
        return f"{date_prefix}-{slugify(title)}.md"
    return f"{date_prefix}-{sid}.md"


def yaml_escape(value: str) -> str:
    text = (value or "").replace("\\", "\\\\").replace('"', '\\"')
    if any(ch in text for ch in (":", "#", "\n", "{", "}", "[", "]", ",")) or text != text.strip():
        return f'"{text}"'
    return text or '""'


def default_security_fields(
    *,
    owner_user_id: str = "",
    owner_email: str = "",
    visibility: str = "private",
    domain: str = "",
    sensitivity: str = "",
    policy: str = "sealed",
    confidential_label: str = "",
    pii_protected: bool | None = None,
) -> dict[str, Any]:
    """Standard owner/sensitivity fields for meeting (and email) markdown."""
    fields: dict[str, Any] = {
        "visibility": visibility or "private",
        "policy": policy or "sealed",
    }
    if owner_user_id:
        fields["owner_user_id"] = owner_user_id
    if owner_email:
        fields["owner_email"] = owner_email
    if domain:
        fields["domain"] = domain
    if sensitivity:
        fields["sensitivity"] = sensitivity
    if confidential_label:
        fields["confidential_label"] = confidential_label
    if pii_protected is not None:
        fields["pii_protected"] = "true" if pii_protected else "false"
    return fields


def yaml_frontmatter(
    *,
    source: str,
    meeting_id: str,
    calendar_title: str = "",
    share_url: str = "",
    title: str = "",
    date: str = "",
    owner_user_id: str = "",
    owner_email: str = "",
    visibility: str = "private",
    domain: str = "",
    sensitivity: str = "",
    policy: str = "sealed",
    confidential_label: str = "",
    pii_protected: bool | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    """Render YAML frontmatter block for meeting markdown.

    Security defaults: visibility=private, policy=sealed. Owner/sensitivity
    fields are optional until classification or provider labels populate them.
    """
    lines = ["---"]
    if title:
        lines.append(f"title: {yaml_escape(title)}")
    if date:
        lines.append(f"date: {yaml_escape(date)}")
    lines.append(f"source: {yaml_escape(source)}")
    lines.append(f"meeting_id: {yaml_escape(meeting_id)}")
    lines.append(f"calendar_title: {yaml_escape(calendar_title or title)}")
    if share_url:
        lines.append(f"share_url: {yaml_escape(share_url)}")

    security = default_security_fields(
        owner_user_id=owner_user_id,
        owner_email=owner_email,
        visibility=visibility,
        domain=domain,
        sensitivity=sensitivity,
        policy=policy,
        confidential_label=confidential_label,
        pii_protected=pii_protected,
    )
    merged: dict[str, Any] = {**security, **(extra or {})}
    for key, val in merged.items():
        if val is None or val == "":
            continue
        lines.append(f"{key}: {yaml_escape(str(val))}")
    lines.append("---")
    lines.append("")
    return "\n".join(lines)
