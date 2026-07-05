#!/usr/bin/env python3
"""
Research-Without-Persist Detector
==================================

Cron job that scans recent Hermes/OpenClaw session transcripts for
agent-produced research/analysis content that was NOT persisted to
MemroOS. Posts findings to #memroos so we can self-heal before it
becomes a pattern.

Detection heuristic (per session):
- Look for messages with research signals: tables, comparisons, RCA docs,
  competitive analysis, market positioning, benchmark results
- Look for MemroOS knowledge_write calls in the same session
- If research detected AND no knowledge_write call → flag as "missed persist"

Reads from:
  ~/.hermes/sessions/<session-id>/transcript.jsonl
  ~/.shared-agent-memory/discord_memory/  (for cross-agent signals)

Outputs to:
  ~/.hermes/cron/output/research-without-persist-YYYY-MM-DD.md
  Posts alert to Discord #memroos

Schedule: daily 09:00 PT via Hermes cron
"""

import os
import re
import sys
import json
import glob
from pathlib import Path
from datetime import datetime, timedelta

HOME = Path.home()
SESSIONS_DIR = HOME / ".hermes" / "sessions"
OUTPUT_DIR = HOME / ".hermes" / "cron" / "output"
RESEARCH_SIGNALS = [
    r"## Comparison",
    r"## Benchmark",
    r"## Competitive",
    r"## RCA",
    r"## Root Cause",
    r"## Architecture Comparison",
    r"## Side-by-Side",
    r"vs\s+Microsoft\s+IQ",
    r"vs\s+Letta",
    r"vs\s+Mem0",
    r"vs\s+Zep",
    r"## Honest Take",
    r"## Strategic",
    r"## Where They Diverge",
    r"competitive\s+analysis",
    r"market\s+positioning",
    r"## Analysis",
    r"## Findings",
    r"## Recommendations",
]
PERSIST_SIGNALS = [
    r"mcp_memroos_knowledge_write",
    r"knowledge_write",
    r"wrote\s+to\s+memroos",
    r"saved\s+to\s+memroos",
    r"persisted\s+to\s+memroos",
]


def is_research_message(content: str) -> bool:
    if not content or len(content) < 200:
        return False
    for pat in RESEARCH_SIGNALS:
        if re.search(pat, content, re.IGNORECASE):
            return True
    return False


def has_persist_call(content: str) -> bool:
    if not content:
        return False
    for pat in PERSIST_SIGNALS:
        if re.search(pat, content, re.IGNORECASE):
            return True
    return False


def scan_sessions(since_hours: int = 24) -> list:
    """Find sessions from the last N hours and check for research-without-persist."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    cutoff = datetime.now() - timedelta(hours=since_hours)
    findings = []

    if not SESSIONS_DIR.exists():
        return findings

    for session_dir in SESSIONS_DIR.iterdir():
        if not session_dir.is_dir():
            continue
        try:
            mtime = datetime.fromtimestamp(session_dir.stat().st_mtime)
        except Exception:
            continue
        if mtime < cutoff:
            continue

        transcript = session_dir / "transcript.jsonl"
        if not transcript.exists():
            continue

        research_messages = []
        persist_messages = []
        session_id = session_dir.name
        try:
            with transcript.open() as f:
                for line in f:
                    try:
                        msg = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    role = msg.get("role", "")
                    content = msg.get("content", "")
                    if role == "assistant" and is_research_message(content):
                        research_messages.append({"role": role, "excerpt": content[:300]})
                    if has_persist_call(content):
                        persist_messages.append({"role": role, "excerpt": content[:200]})
        except Exception as e:
            continue

        if research_messages and not persist_messages:
            findings.append(
                {
                    "session_id": session_id,
                    "research_message_count": len(research_messages),
                    "first_research_excerpt": research_messages[0]["excerpt"][:200],
                    "detected_at": mtime.isoformat(),
                }
            )

    return findings


def write_report(findings: list):
    today = datetime.now().strftime("%Y-%m-%d")
    out_path = OUTPUT_DIR / f"research-without-persist-{today}.md"
    if not findings:
        out_path.write_text(
            f"# Research Without Persist — {today}\n\n"
            f"✅ No sessions in last 24h produced research without a corresponding "
            f"MemroOS knowledge_write call.\n"
        )
        return out_path

    lines = [
        f"# Research Without Persist — {today}",
        f"",
        f"⚠️ **{len(findings)} session(s)** produced research-style content but did "
        f"NOT call `mcp_memroos_knowledge_write`.",
        f"",
        f"This is the failure mode that caused the July 5 Microsoft IQ comparison "
        f"to land only in Discord.",
        f"",
    ]
    for f in findings:
        lines.append(f"## Session `{f['session_id']}`")
        lines.append(f"- Research messages: {f['research_message_count']}")
        lines.append(f"- Detected at: {f['detected_at']}")
        lines.append(f"- First excerpt:")
        lines.append(f"  > {f['first_research_excerpt']}")
        lines.append("")
    out_path.write_text("\n".join(lines))
    return out_path


STATE_FILE = OUTPUT_DIR / ".research-without-persist.last-run"


def get_last_run_marker() -> float:
    """Get Unix timestamp of last detector run, or 0 if never run."""
    if STATE_FILE.exists():
        try:
            return float(STATE_FILE.read_text().strip())
        except (ValueError, OSError):
            return 0.0
    return 0.0


def set_last_run_marker(ts: float):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(str(ts))


def main():
    """
    Scan strategy:
    - Default: scan everything since last successful run (state file)
    - First run: scan last 30 days (covers the original Jun 30 incident)
    - --full flag: scan everything regardless of state
    - SCAN_HOURS env: override with custom window (debug only)

    The state marker means we never miss a session, but we also don't
    re-scan the same transcripts on every run.
    """
    import time as _time

    if "--full" in sys.argv:
        # Force full scan — look back 365 days
        since_hours = 365 * 24
        print("Running FULL scan (365 days)")
    else:
        last_run = get_last_run_marker()
        if last_run > 0:
            elapsed_hours = (_time.time() - last_run) / 3600.0
            # Add 1 hour buffer to catch sessions that ended right at last_run
            since_hours = max(1, int(elapsed_hours) + 1)
            print(f"Incremental scan: last run {elapsed_hours:.1f}h ago")
        else:
            # First run — look back 30 days to catch historical misses
            since_hours = 30 * 24
            print(f"First run: scanning last 30 days")

    override = os.environ.get("SCAN_HOURS")
    if override:
        since_hours = int(override)
        print(f"SCAN_HOURS override: {since_hours}h")

    findings = scan_sessions(since_hours=since_hours)
    report = write_report(findings)
    set_last_run_marker(_time.time())

    if findings:
        print(f"⚠️ {len(findings)} session(s) with research but no persist → {report}")
        sys.exit(1)  # Non-zero so cron delivers the message
    else:
        print(f"✅ Clean — {report}")


if __name__ == "__main__":
    main()