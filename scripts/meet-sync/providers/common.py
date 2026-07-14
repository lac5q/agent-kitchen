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


def yaml_frontmatter(
    *,
    source: str,
    meeting_id: str,
    calendar_title: str = "",
    share_url: str = "",
    title: str = "",
    date: str = "",
    extra: dict[str, Any] | None = None,
) -> str:
    """Render YAML frontmatter block for meeting markdown."""
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
    if extra:
        for key, val in extra.items():
            if val is None or val == "":
                continue
            lines.append(f"{key}: {yaml_escape(str(val))}")
    lines.append("---")
    lines.append("")
    return "\n".join(lines)
