#!/usr/bin/env python3
"""Transform Fathom meetings JSON to dated Markdown for MemRoOS QMD ingestion.

Idempotent by recording_id / id. Frontmatter includes calendar_title, share_url,
meeting_id, source. Secrets never appear in this file — API keys stay in env.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

# Allow `python3 fathom_transform.py` from any cwd
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import idempotent_filename, safe_id, yaml_frontmatter  # noqa: E402


def format_transcript(transcript: list) -> str:
    if not transcript:
        return ""
    lines: list[str] = []
    last_speaker: str | None = None
    for entry in transcript:
        speaker_obj = entry.get("speaker") or {}
        speaker = speaker_obj.get("name") or speaker_obj.get("email") or "Speaker"
        text = (entry.get("text") or "").strip()
        if not text:
            continue
        if speaker != last_speaker:
            if lines:
                lines.append("")
            lines.append(f"**{speaker}:** {text}")
            last_speaker = speaker
        else:
            lines.append(text)
    return "\n".join(lines).strip()


def calendar_title_for(meeting: dict) -> str:
    """Prefer calendar/event title over generic API titles like 'Impromptu…'."""
    for key in (
        "calendar_title",
        "calendar_event_title",
        "meeting_title",
        "scheduled_meeting_title",
        "title",
    ):
        val = meeting.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return "untitled"


def meeting_to_markdown(meeting: dict) -> tuple[str, str]:
    title = calendar_title_for(meeting)
    api_title = (meeting.get("title") or "").strip()
    recording_id = (
        meeting.get("recording_id")
        or meeting.get("recordingId")
        or meeting.get("id")
        or ""
    )
    meeting_id = safe_id(recording_id)

    start_raw = (
        meeting.get("recording_start_time")
        or meeting.get("scheduled_start_time")
        or meeting.get("actual_start_time")
        or meeting.get("created_at")
        or ""
    )
    try:
        dt = datetime.fromisoformat(start_raw.replace("Z", "+00:00"))
        date_prefix = dt.strftime("%Y-%m-%d")
    except (ValueError, AttributeError):
        date_prefix = "unknown-date"

    duration_min = 0
    start_for_dur = meeting.get("recording_start_time") or meeting.get("actual_start_time")
    end_for_dur = meeting.get("recording_end_time") or meeting.get("actual_end_time")
    if start_for_dur and end_for_dur:
        try:
            start = datetime.fromisoformat(start_for_dur.replace("Z", "+00:00"))
            end = datetime.fromisoformat(end_for_dur.replace("Z", "+00:00"))
            duration_min = max(0, int((end - start).total_seconds() / 60))
        except (ValueError, AttributeError):
            pass

    attendees = sorted(
        {
            (inv.get("name") or inv.get("email"))
            for inv in (meeting.get("calendar_invitees") or [])
            if inv.get("name") or inv.get("email")
        }
    )

    summary = meeting.get("summary") or meeting.get("default_summary") or ""
    if isinstance(summary, dict):
        summary = summary.get("markdown_formatted") or summary.get("template_name") or ""
    action_items = meeting.get("action_items") or []
    transcript = format_transcript(meeting.get("transcript") or [])
    share_url = meeting.get("share_url") or meeting.get("url") or ""

    filename = idempotent_filename(date_prefix, meeting_id, title)
    fm = yaml_frontmatter(
        source="fathom",
        meeting_id=meeting_id,
        calendar_title=title,
        share_url=share_url,
        title=title,
        date=date_prefix,
        extra={"api_title": api_title} if api_title and api_title != title else None,
    )

    lines = [
        fm.rstrip(),
        f"# {title}",
        "",
        f"**Date:** {date_prefix}",
        "**Source:** Fathom",
        f"**Meeting ID:** {meeting_id}",
    ]
    if duration_min:
        lines.append(f"**Duration:** {duration_min} minutes")
    if share_url:
        lines.append(f"**Recording:** {share_url}")
    if attendees:
        lines += ["", "**Participants:** " + ", ".join(attendees)]
    if summary:
        lines += ["", "## Summary", "", str(summary)]
    if action_items:
        lines += ["", "## Action Items", ""]
        for item in action_items:
            text = item if isinstance(item, str) else (item.get("text") or str(item))
            lines.append(f"- {text}")
    if transcript:
        lines += ["", "## Transcript", "", transcript]

    return filename, "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--input", required=True, help="Path to Fathom JSON file")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Input not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    data = json.loads(input_path.read_text())
    meetings = data if isinstance(data, list) else data.get("items") or []

    written = 0
    skipped = 0
    updated = 0
    for meeting in meetings:
        if not meeting.get("transcript"):
            skipped += 1
            continue
        filename, content = meeting_to_markdown(meeting)
        path = output_dir / filename
        existed = path.exists()
        path.write_text(content, encoding="utf-8")
        if existed:
            updated += 1
        else:
            written += 1

    print(
        f"Fathom transform: wrote {written}, updated {updated}, skipped {skipped} (no transcript)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
