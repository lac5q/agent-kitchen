#!/usr/bin/env python3
"""Circleback meeting ingest for MemRoOS — public template.

Uses Circleback CLI:
  meetings search --from YYYY-MM-DD --page N --json
  meetings read <ids...> --json
  transcripts read <ids...> --json

Idempotent by meeting id. Secrets: Circleback CLI auth (never commit tokens).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import idempotent_filename, safe_id, yaml_frontmatter  # noqa: E402


def run_json(args: list[str]):
    proc = subprocess.run(
        ["circleback", *args, "--json"],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"circleback {' '.join(args)} failed: {proc.stderr.strip()[:400]}")
    raw = proc.stdout.strip()
    if not raw:
        return []
    return json.loads(raw)


def format_transcript(entries: list) -> str:
    if not entries:
        return ""
    lines: list[str] = []
    last_speaker: str | None = None
    for entry in entries:
        if isinstance(entry, str):
            lines.append(entry)
            continue
        speaker = (
            (entry.get("speaker") or {}).get("name")
            if isinstance(entry.get("speaker"), dict)
            else entry.get("speaker")
        ) or entry.get("name") or "Speaker"
        text = (entry.get("text") or entry.get("content") or "").strip()
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


def meeting_to_markdown(mid: str, detail: dict, transcript_entries: list) -> tuple[str, str]:
    title = detail.get("name") or detail.get("title") or "untitled"
    created = detail.get("createdAt") or detail.get("created_at") or detail.get("date") or ""
    try:
        dt = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
        date_prefix = dt.strftime("%Y-%m-%d")
    except Exception:
        date_prefix = "unknown-date"

    attendees = []
    for a in detail.get("attendees") or []:
        if isinstance(a, dict):
            attendees.append(a.get("name") or a.get("email") or str(a))
        else:
            attendees.append(str(a))

    notes = detail.get("notes") or detail.get("summary") or ""
    action_items = detail.get("actionItems") or detail.get("action_items") or []
    transcript = format_transcript(transcript_entries or [])
    duration = detail.get("duration")
    url = detail.get("url") or detail.get("recordingUrl") or detail.get("share_url") or ""
    meeting_id = safe_id(mid)

    filename = idempotent_filename(date_prefix, meeting_id, title)
    fm = yaml_frontmatter(
        source="circleback",
        meeting_id=meeting_id,
        calendar_title=title,
        share_url=url,
        title=title,
        date=date_prefix,
    )

    lines = [
        fm.rstrip(),
        f"# {title}",
        "",
        f"**Date:** {date_prefix}",
        "**Source:** Circleback",
        f"**Meeting ID:** {meeting_id}",
    ]
    if duration:
        lines.append(
            f"**Duration:** {duration} minutes"
            if isinstance(duration, (int, float))
            else f"**Duration:** {duration}"
        )
    if url:
        lines.append(f"**Recording:** {url}")
    if attendees:
        lines += ["", "**Participants:** " + ", ".join(attendees)]
    if notes:
        lines += ["", "## Notes", "", notes]
    if action_items:
        lines += ["", "## Action Items", ""]
        for item in action_items:
            text = item if isinstance(item, str) else (item.get("text") or item.get("title") or str(item))
            lines.append(f"- {text}")
    if transcript:
        lines += ["", "## Transcript", "", transcript]

    return filename, "\n".join(lines) + "\n"


def collect_meetings(from_date: str) -> list[dict]:
    meetings: list[dict] = []
    page = 1
    while True:
        data = run_json(["meetings", "search", "--from", from_date, "--page", str(page)])
        if isinstance(data, dict):
            batch = data.get("meetings") or data.get("data") or data.get("items") or []
        else:
            batch = data or []
        if not batch:
            break
        meetings.extend(batch)
        print(f"[circleback] search page {page}: {len(batch)}", file=sys.stderr)
        if len(batch) < 20:
            break
        page += 1
    return meetings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--from-date", default="")
    args = parser.parse_args()

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    from_date = args.from_date or __import__("os").environ.get("FROM_DATE") or "2024-01-01"

    meetings = collect_meetings(from_date)
    # Dedupe by id
    by_id: dict[str, dict] = {}
    for m in meetings:
        mid = str(m.get("id") or m.get("meetingId") or "")
        if mid:
            by_id[mid] = m
    print(f"[circleback] unique meetings: {len(by_id)}", file=sys.stderr)

    ids = list(by_id.keys())
    details: dict[str, dict] = {}
    transcripts: dict[str, list] = {}
    for i in range(0, len(ids), 25):
        batch = ids[i : i + 25]
        detail_list = run_json(["meetings", "read", *batch])
        if isinstance(detail_list, dict):
            detail_list = detail_list.get("meetings") or detail_list.get("data") or []
        for d in detail_list or []:
            did = str(d.get("id") or "")
            if did:
                details[did] = d
        print(f"[circleback] read details batch={len(batch)}", file=sys.stderr)

        tx_list = run_json(["transcripts", "read", *batch])
        if isinstance(tx_list, dict):
            tx_list = tx_list.get("transcripts") or tx_list.get("data") or []
        for tx in tx_list or []:
            tid = str(tx.get("meetingId") or tx.get("meeting_id") or tx.get("id") or "")
            entries = tx.get("entries") or tx.get("transcript") or tx.get("segments") or []
            if tid:
                transcripts[tid] = entries if isinstance(entries, list) else []
        print(
            f"[circleback] read transcripts batch={len(batch)} got={len(tx_list or [])}",
            file=sys.stderr,
        )

    written = 0
    updated = 0
    for mid, m in by_id.items():
        detail = details.get(mid, m)
        filename, content = meeting_to_markdown(mid, detail, transcripts.get(mid) or [])
        path = out / filename
        existed = path.exists()
        path.write_text(content, encoding="utf-8")
        if existed:
            updated += 1
        else:
            written += 1
        print(f"[circleback] wrote {path.name}", file=sys.stderr)

    print(
        f"Circleback ingest: wrote {written}, updated {updated} → {out}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
