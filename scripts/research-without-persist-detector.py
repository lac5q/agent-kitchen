#!/usr/bin/env python3
"""
Research-Without-Persist Detector
==================================

Cron job that scans recent Hermes/OpenClaw session transcripts for
agent-produced research/analysis content that was NEVER persisted to
MemroOS via mcp_memroos_knowledge_write.

LAYOUT (CRITICAL — read before editing)
---------------------------------------
Hermes stores sessions as FLAT files at:
    ~/.hermes/sessions/<session-id>.jsonl

NOT as directories. Earlier versions of this script (incorrectly)
iterated `iterdir()` and skipped everything except directories,
which meant it matched zero sessions. Fixed in v2.0.

MESSAGE SHAPE
-------------
Assistant messages in Hermes sessions take two shapes:

  1. Tool-using turn:
     {"role": "assistant", "content": "", "reasoning": "...", "tool_calls": [{"function": {"name": "terminal", ...}}], "finish_reason": "tool_calls"}

  2. Final-answer turn:
     {"role": "assistant", "content": "...markdown...", "reasoning": "...", "finish_reason": "stop"}

Earlier versions only read `content`, missing the research text on
tool-using turns. Fixed in v2.0 — we now read `reasoning` + `content`
together for every assistant message.

DETECTION HEURISTIC
-------------------
A "research without persist" finding fires when:
- The session contains a `## Comparison` / `## Benchmark` / `## RCA`
  / `## Analysis` / `## Recommendations` header, OR
- The session cites an external URL (http:// or https://) outside tool output
- AND there is no `mcp_memroos_knowledge_write` tool call in the entire session

The session is also flagged if the user asked to "save/document/archive/
file" but no write happened.

USAGE
-----
python3 research-without-persist-detector.py [--full] [--since=<epoch>]

Cron calls this daily. First run after install uses --full to scan
the last 30 days; subsequent runs use --since=<last_run_epoch>.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

# --- Config ----------------------------------------------------------------

HOME = Path(os.environ.get("HOME", Path.home()))
SESSIONS_DIR = HOME / ".hermes" / "sessions"
OUTPUT_DIR = HOME / ".hermes" / "cron" / "output"
STATE_FILE = OUTPUT_DIR / ".research-without-persist.last-run"
MEMROOS_KB_DIR = Path(os.environ.get("MEMROOS_ROOT", HOME / "github" / "memroos")) / "content"
LOG_RETENTION_DAYS = 30

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Patterns that signal "research / analysis / durable content"
RESEARCH_HEADER_RE = re.compile(
    r"^#{1,3}\s*(comparison|benchmark|rca|root[- ]cause|analysis|recommendation|"
    r"market\s+(positioning|analysis|research)|competitive\s+analysis|"
    r"research\s+(summary|findings)|summary\s+of\s+research)",
    re.IGNORECASE | re.MULTILINE,
)
URL_CITE_RE = re.compile(r"https?://[^\s)>\]]+")
SAVE_TRIGGER_RE = re.compile(
    r"\b(save|document|archive|file|store|preserve|persist|write\s+down|capture|note\s+this)\b",
    re.IGNORECASE,
)
MEMROOS_WRITE_RE = re.compile(r"mcp_memroos_knowledge_write", re.IGNORECASE)
MEMROOS_WRITE_TOOL_RE = re.compile(r'"name"\s*:\s*"mcp_memroos_knowledge_write"|"function":\s*{[^}]*"name"\s*:\s*"mcp_memroos_knowledge_write"')


# --- Types -----------------------------------------------------------------

@dataclass
class Finding:
    session_id: str
    session_path: Path
    modified: str
    evidence: list[str] = field(default_factory=list)
    has_write: bool = False
    user_message_count: int = 0
    assistant_message_count: int = 0

    def is_real(self) -> bool:
        # Must have research evidence AND no write
        return bool(self.evidence) and not self.has_write


# --- Helpers ---------------------------------------------------------------

def get_assistant_text(msg: dict) -> str:
    """Concatenate all textual content from an assistant message.

    Reads content + reasoning + tool-call function name + tool output.
    This is the v2.0 fix for the bug where tool-using turns had empty
    content and the detector missed all research text.
    """
    parts: list[str] = []
    content = msg.get("content")
    if isinstance(content, str):
        parts.append(content)
    elif isinstance(content, list):
        for c in content:
            if isinstance(c, dict) and c.get("type") == "text":
                parts.append(c.get("text", ""))
    reasoning = msg.get("reasoning")
    if isinstance(reasoning, str):
        parts.append(reasoning)
    tool_calls = msg.get("tool_calls") or []
    for tc in tool_calls:
        if not isinstance(tc, dict):
            continue
        fn = tc.get("function") or {}
        if isinstance(fn, dict):
            name = fn.get("name", "")
            if name:
                parts.append(f"[tool:{name}]")
        output = tc.get("output") or tc.get("result")
        if isinstance(output, str):
            parts.append(output)
    return "\n".join(parts)


def session_has_memroos_write(messages: list[dict]) -> bool:
    """True if any assistant message called mcp_memroos_knowledge_write."""
    for msg in messages:
        if msg.get("role") != "assistant":
            continue
        # Direct tool-call match (in tool_calls[].function.name)
        tool_calls = msg.get("tool_calls") or []
        for tc in tool_calls:
            if not isinstance(tc, dict):
                continue
            fn = tc.get("function") or {}
            if isinstance(fn, dict) and fn.get("name") == "mcp_memroos_knowledge_write":
                return True
        # String-based fallbacks (in case tool_calls structure differs)
        text = get_assistant_text(msg)
        if MEMROOS_WRITE_RE.search(text):
            return True
        if MEMROOS_WRITE_TOOL_RE.search(text):
            return True
    return False


def session_has_research_evidence(messages: list[dict]) -> list[str]:
    """Return list of evidence strings (headers / triggers) suggesting research."""
    evidence: list[str] = []
    combined_text = ""
    user_text = ""
    for msg in messages:
        role = msg.get("role")
        if role == "user":
            content = msg.get("content")
            if isinstance(content, str):
                user_text += "\n" + content
        elif role == "assistant":
            combined_text += "\n" + get_assistant_text(msg)
    # Headers
    for m in RESEARCH_HEADER_RE.finditer(combined_text):
        evidence.append(f"research header: {m.group(0).strip()[:80]}")
    # External URL citations
    urls = URL_CITE_RE.findall(combined_text)
    if urls:
        evidence.append(f"external URLs cited: {len(urls)} (e.g. {urls[0][:60]})")
    # User asked to save/document
    if SAVE_TRIGGER_RE.search(user_text):
        evidence.append("user asked to save/document/file")
    return evidence


def load_session(path: Path) -> list[dict]:
    messages: list[dict] = []
    try:
        with path.open("r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(obj, dict) and "role" in obj:
                    messages.append(obj)
    except OSError:
        return []
    return messages


def scan_sessions(since_epoch: float | None) -> list[Finding]:
    """Scan all Hermes session files for research-without-persist findings.

    Args:
        since_epoch: Unix timestamp cutoff. Files modified before this
            are skipped. None means "scan all files."
    """
    findings: list[Finding] = []
    if not SESSIONS_DIR.is_dir():
        return findings
    for session_path in SESSIONS_DIR.glob("*.jsonl"):
        try:
            mtime = session_path.stat().st_mtime
        except OSError:
            continue
        if since_epoch is not None and mtime < since_epoch:
            continue
        messages = load_session(session_path)
        if not messages:
            continue
        has_write = session_has_memroos_write(messages)
        evidence = session_has_research_evidence(messages)
        if not evidence:
            continue
        user_count = sum(1 for m in messages if m.get("role") == "user")
        assistant_count = sum(1 for m in messages if m.get("role") == "assistant")
        finding = Finding(
            session_id=session_path.stem,
            session_path=session_path,
            modified=session_path.stat().st_mtime.__repr__() if False else str(int(mtime)),
            evidence=evidence,
            has_write=has_write,
            user_message_count=user_count,
            assistant_message_count=assistant_count,
        )
        if finding.is_real():
            findings.append(finding)
    return findings


def get_last_run_marker() -> float:
    """Get Unix timestamp of last detector run, or 0 if never run."""
    if STATE_FILE.exists():
        try:
            return float(STATE_FILE.read_text().strip())
        except (OSError, ValueError):
            return 0.0
    return 0.0


def set_last_run_marker(epoch: float) -> None:
    STATE_FILE.write_text(f"{epoch}\n")


def write_report(findings: list[Finding], since_epoch: float | None) -> Path:
    """Write a Markdown report to OUTPUT_DIR."""
    from datetime import datetime, timezone
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    report_path = OUTPUT_DIR / f"research-without-persist-{timestamp}.md"
    lines = [
        "# Research Without Persist — Detector Report",
        "",
        f"**Run at (UTC):** {datetime.now(timezone.utc).isoformat()}",
        f"**Sessions scanned:** all *.jsonl in {SESSIONS_DIR}",
        f"**Since:** {datetime.fromtimestamp(since_epoch, timezone.utc).isoformat() if since_epoch else '(no cutoff)'}",
        f"**Findings:** {len(findings)}",
        "",
    ]
    if findings:
        lines.append("## ⚠️ Sessions that produced research without writing to MemroOS")
        lines.append("")
        for f in findings:
            lines.append(f"### `{f.session_id}`")
            lines.append(f"- **Path:** `{f.session_path}`")
            lines.append(f"- **Modified epoch:** {f.modified}")
            lines.append(f"- **User messages:** {f.user_message_count}, Assistant messages: {f.assistant_message_count}")
            lines.append(f"- **Evidence:**")
            for e in f.evidence:
                lines.append(f"  - {e}")
            lines.append("")
        lines.append("## Recovery")
        lines.append("")
        lines.append("For each session above, run the `memroos-save` skill to backfill the missed write:")
        lines.append("")
        lines.append("```bash")
        lines.append("# For each session_path, read the transcript and persist the research.")
        lines.append("# The End-of-Task Persist Checklist in ~/.hermes/AGENTS.md applies retroactively.")
        lines.append("```")
    else:
        lines.append("✅ Clean — no research-without-persist findings.")
    report_path.write_text("\n".join(lines) + "\n")
    return report_path


def main() -> int:
    full = "--full" in sys.argv
    since_epoch: float | None
    if full:
        # First run: scan the last 30 days to catch historical misses
        since_epoch = None  # no cutoff → scan all
    else:
        # Subsequent runs: only what's new since last run
        last = get_last_run_marker()
        since_epoch = last if last > 0 else None

    findings = scan_sessions(since_epoch)
    set_last_run_marker(__import__("time").time())
    report = write_report(findings, since_epoch)

    if findings:
        print(f"⚠️  {len(findings)} session(s) produced research without persisting to MemroOS.")
        print(f"   Report: {report}")
        return 1
    print(f"✅ Clean — no research-without-persist findings.")
    print(f"   Report: {report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())