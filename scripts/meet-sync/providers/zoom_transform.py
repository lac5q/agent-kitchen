#!/usr/bin/env python3
"""Transform Zoom recording VTT transcripts into dated Markdown for MemRoOS.

Idempotent by Zoom meeting uuid / id. Frontmatter includes calendar_title,
share_url, meeting_id, source.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import idempotent_filename, safe_id, yaml_frontmatter  # noqa: E402

VTT_CUE_RE = re.compile(
    r"(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3}).*?\n(.*?)(?=\n\n|\Z)",
    re.DOTALL,
)
VTT_SPEAKER_RE = re.compile(r"<v\s+([^>]+)>(.*?)</v>", re.DOTALL)
VTT_BARE_SPEAKER_RE = re.compile(r"<v\s+([^>]+)>\s*$", re.DOTALL)


def parse_vtt(vtt_text: str) -> str:
    lines: list[str] = []
    last_speaker: str | None = None
    for match in VTT_CUE_RE.finditer(vtt_text):
        text = match.group(3).strip()
        if not text:
            continue
        speaker_match = VTT_SPEAKER_RE.search(text)
        if speaker_match:
            speaker = speaker_match.group(1).strip()
            content = speaker_match.group(2).strip()
        else:
            bare_match = VTT_BARE_SPEAKER_RE.search(text)
            if bare_match:
                speaker = bare_match.group(1).strip()
                content = ""
            else:
                speaker = last_speaker or "Speaker"
                content = text
        if not content and speaker == last_speaker:
            continue
        if speaker != last_speaker:
            if lines:
                lines.append("")
            lines.append(f"**{speaker}:** {content}")
            last_speaker = speaker
        else:
            lines.append(content)
    return "\n".join(lines).strip()


def meeting_to_markdown(meeting: dict) -> tuple[str, str]:
    topic = meeting.get("topic") or meeting.get("title") or "untitled"
    start_raw = meeting.get("start_time") or meeting.get("created_at") or ""
    try:
        dt = datetime.fromisoformat(start_raw.replace("Z", "+00:00"))
        date_prefix = dt.strftime("%Y-%m-%d")
    except (ValueError, AttributeError):
        date_prefix = "unknown-date"

    duration_min = meeting.get("duration", 0)
    host_email = meeting.get("host_email") or ""
    stable = meeting.get("uuid") or meeting.get("id") or meeting.get("meeting_id") or ""
    meeting_id = safe_id(stable)
    share_url = meeting.get("share_url") or meeting.get("recording_play_passcode") or ""
    if not share_url and isinstance(meeting.get("recording_files"), list):
        for rf in meeting["recording_files"]:
            if isinstance(rf, dict) and rf.get("play_url"):
                share_url = rf["play_url"]
                break

    attendees: set[str] = set()
    for raf in meeting.get("participant_audio_files") or []:
        if isinstance(raf, dict):
            for key in ("file_name", "participant_name", "email"):
                val = raf.get(key)
                if val:
                    attendees.add(str(val))

    vtt_text = meeting.get("_vtt_text") or ""
    filename = idempotent_filename(date_prefix, meeting_id, topic)
    fm = yaml_frontmatter(
        source="zoom",
        meeting_id=meeting_id,
        calendar_title=topic,
        share_url=str(share_url or ""),
        title=topic,
        date=date_prefix,
    )

    lines = [
        fm.rstrip(),
        f"# {topic}",
        "",
        f"**Date:** {date_prefix}",
        f"**Duration:** {duration_min} minutes",
        "**Source:** Zoom",
        f"**Meeting ID:** {meeting_id}",
    ]
    if host_email:
        lines.append(f"**Host:** {host_email}")
    if share_url:
        lines.append(f"**Recording:** {share_url}")
    if attendees:
        lines += ["", "**Participants:** " + ", ".join(sorted(attendees))]
    if vtt_text:
        transcript = parse_vtt(vtt_text)
        if transcript:
            lines += ["", "## Transcript", "", transcript]

    return filename, "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        print(f"Manifest not found: {manifest_path}", file=sys.stderr)
        sys.exit(1)

    data = json.loads(manifest_path.read_text())
    meetings = data if isinstance(data, list) else data.get("meetings", [])

    written = 0
    updated = 0
    skipped = 0
    for meeting in meetings:
        if not meeting.get("_vtt_text"):
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
        f"Zoom transform: wrote {written}, updated {updated}, skipped {skipped} (no transcript)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
