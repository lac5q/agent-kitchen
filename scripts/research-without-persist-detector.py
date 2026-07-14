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

DETECTION HEURISTIC (v3.0 — tightened 2026-07-08)
--------------------------------------------------
A "research without persist" finding fires when ALL of:

  (1) the session produced a research-grade signal — at least ONE of:
        - a `## Comparison` / `## Benchmark` / `## RCA` / `## Analysis`
          / `## Recommendations` header (standalone trigger), OR
        - >= MIN_URLS_STANDALONE external URLs cited outside tool output
          (standalone trigger), OR
        - a save/document/file verb in the user message CORROBORATED by
          >= MIN_STRUCTURED_CHARS of structured markdown OR one of the two
          standalone triggers above. (A lone save verb, or a save verb +
          a single URL, is NOT enough — that path produces the "save
          money" / "do not preserve API keys" noise.)

  (2) the research was NOT persisted — i.e. none of:
        - an `mcp_memroos_knowledge_write` tool call, OR
        - a direct-write fallback (write_file/patch/edit/create_file whose
          `path` is under the knowledge tree, OR a heredoc/tee/cat> shell
          write under the knowledge tree), OR
        - (opt-in, `--git-xref`) a git commit landing in
          `~/github/knowledge` or `~/github/memroos/content` within
          +/-GIT_XREF_WINDOW_HOURS of the session mtime.

Structured-chars alone is deliberately NOT a standalone trigger: the
real corpus has many large coding/operational sessions ("create a
resume", "why am I seeing this error") whose markdown output exceeds the
threshold but is not research. It only serves as a save-verb corroboration.

A bare "save/document/file" verb is NO LONGER sufficient on its own.
Tightening the verb regex instead produced false negatives on the three
recovered artifacts this detector exists to catch (the verb appeared in
generic context, not as an imperative), so corroboration is used instead.
See CHANGELOG (v3.0).

USAGE
-----
python3 research-without-persist-detector.py [--full] [--verify-writes] [--git-xref]

Cron calls this daily. The recommended daily invocation is INCREMENTAL
(no --full): the last-run marker limits the scan to sessions modified
since the previous run. Use --full only for first-run / ad-hoc full
sweeps; running --full daily re-reports the entire backlog every day,
which is the "ratchet" failure mode this version fixes.

CHANGELOG
---------
v3.0 (2026-07-08) — tightened heuristics, grounded against the real
    151-session backlog and the 3 known-real recovered artifacts.
    - S1 direct-write rescue: write_file/patch/edit/create_file under a
      KB root, or a heredoc/tee/cat> shell write, counts as a persist.
      Removes the Vendasta-style fallback-path false positives the old
      detector always flagged (~26/151 in the 2026-07-05 backlog).
    - S2 quality gate: standalone research triggers are a research header
      OR >= MIN_URLS_STANDALONE external URLs. Structured-chars alone is
      NOT a standalone trigger (the corpus has large coding/operational
      sessions that would false-positive); it only corroborates a save
      verb. Drops ~30 one-liner acknowledgments AND ~80 dev/ops sessions
      that produce lots of markdown but no research.
    - S3 git cross-reference (opt-in, --git-xref): suppress a session
      when a knowledge-repo commit landed within +/-24h of its mtime.
    - S4 save-trigger corroboration: a bare save/document/file verb is
      NO LONGER sufficient alone; it must be corroborated by an S2 research
      signal (header OR >= MIN_STRUCTURED_CHARS OR >= MIN_URLS_STANDALONE).
      Tightening the verb regex instead produced false negatives on the 3
      recovered artifacts (verb appeared in generic context). Corroboration
      keeps all 3/3 real misses while dropping ~41 noise sessions ("save
      money", "reviewable file paths", "do not preserve API keys"). A
      single URL does NOT corroborate (would re-admit the noise).
    - main(): prints [full] vs [incremental] scope. The daily cron should
      run INCREMENTAL; --full is for first-run / ad-hoc sweeps only.
      Running --full daily is the root cause of the ratchet.

v2.0 — read content + reasoning + tool output for every assistant
    message (earlier versions missed tool-using turns). Session layout
    is FLAT *.jsonl files, not directories.
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
# Direct-write fallback targets (per ~/.hermes/AGENTS.md "Fallback Flow"):
# agents may write directly under these trees when the MCP is unavailable.
KB_ROOT_MARKERS = (
    "github/knowledge",
    "github/memroos/content",
    "/knowledge/",
    "memroos/content",
)
# Knowledge repos scanned by the optional --git-xref suppression signal.
GIT_XREF_REPOS = (HOME / "github" / "knowledge", HOME / "github" / "memroos")
GIT_XREF_WINDOW_HOURS = 24  # +/- around the session mtime
LOG_RETENTION_DAYS = 30

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Quality / corroboration thresholds (v3.0). Tuned against the real
# 151-session backlog + the 3 known-real recovered artifacts so that:
#   - all 3 real misses survive (no false negatives), and
#   - save-trigger-verb noise (e.g. "save money", "reviewable file paths",
#     "do not preserve API keys") is dropped unless corroborated.
MIN_STRUCTURED_CHARS = 500       # structured markdown chars to count as research
MIN_URLS_STANDALONE = 8          # URLs alone (no header/structure) => research

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
# Structured-markdown line marker (headers, bullets, numbered lists, tables,
# blockquotes). Used to measure how much of the assistant output is real
# research prose vs. a one-line acknowledgement.
STRUCTURED_LINE_RE = re.compile(
    r"^\s*(#{1,6}\s|\|\s|>\s|[-*+]\s|\d+\.\s)", re.MULTILINE
)
# Shell idioms that write a file (heredoc / tee / redirect). Used to catch
# the direct-write fallback path inside `terminal` tool calls.
SHELL_WRITE_RE = re.compile(
    r"(cat\s*>|cat\s*>>|\btee\b|<<\s*['\"]?(EOF|PY|SH|HEREDOC)\b)"
)
# Tool names that create/modify a file. `str_replace_editor` covers the
# OpenClaw/Codex-family editor tool.
FILE_WRITE_TOOL_NAMES = frozenset({
    "write_file", "patch", "edit", "create_file", "str_replace_editor",
})
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
    # v3.0 audit fields — record WHY a session was or wasn't flagged so the
    # report stays debuggable after the heuristics got denser.
    structured_chars: int = 0
    url_count: int = 0
    has_save_trigger: bool = False
    has_research_header: bool = False
    # Why the session was treated as "already persisted" (empty when it wasn't).
    persisted_via: str = ""

    def is_real(self) -> bool:
        # Must have research evidence AND no write. "Evidence" here is the
        # post-v3.0 corroborated research signal, populated by
        # `classify_session`.
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


def _iter_tool_calls(messages: list[dict]):
    """Yield (tool_name, parsed_args_dict) for every assistant tool call."""
    for msg in messages:
        if msg.get("role") != "assistant":
            continue
        for tc in msg.get("tool_calls") or []:
            if not isinstance(tc, dict):
                continue
            fn = tc.get("function") or {}
            if not isinstance(fn, dict):
                continue
            name = fn.get("name", "")
            args = fn.get("arguments", "")
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except (json.JSONDecodeError, ValueError):
                    args = {}
            if not isinstance(args, dict):
                args = {}
            yield name, args


def session_has_direct_write(messages: list[dict]) -> tuple[bool, str]:
    """Detect the direct-write fallback path (S1).

    Agents that can't reach `mcp_memroos_knowledge_write` may write directly
    to the knowledge tree via a file-edit tool or a heredoc/tee/cat> shell
    command. Per ~/.hermes/AGENTS.md this is a legitimate durable persist,
    so these sessions must NOT be flagged.

    Returns (True, reason) when a fallback write landed under a KB root.
    """
    for name, args in _iter_tool_calls(messages):
        if name in FILE_WRITE_TOOL_NAMES:
            path = args.get("path") or args.get("file_path") or ""
            if isinstance(path, str) and any(k in path for k in KB_ROOT_MARKERS):
                return True, f"direct-write {name}: {path[:80]}"
        elif name in ("terminal", "bash", "shell"):
            cmd = args.get("command", "") if isinstance(args, dict) else ""
            if isinstance(cmd, str) and any(k in cmd for k in KB_ROOT_MARKERS):
                if SHELL_WRITE_RE.search(cmd):
                    return True, f"direct-write shell ({name})"
    return False, ""


def git_xref_has_persist(mtime_epoch: float) -> tuple[bool, str]:
    """Opt-in (S3): did any knowledge-repo commit land near this session?

    Runs `git log --since/--until` +/- GIT_XREF_WINDOW_HOURS around the
    session mtime. Slow (one git call per session), so only used when the
    caller passes `--git-xref`. Returns (True, commit summary) on a hit.
    """
    import datetime as _dt
    base = _dt.datetime.fromtimestamp(mtime_epoch, _dt.timezone.utc)
    since = (base - _dt.timedelta(hours=GIT_XREF_WINDOW_HOURS)).strftime("%Y-%m-%d %H:%M")
    until = (base + _dt.timedelta(hours=GIT_XREF_WINDOW_HOURS)).strftime("%Y-%m-%d %H:%M")
    for repo in GIT_XREF_REPOS:
        if not repo.is_dir():
            continue
        try:
            out = subprocess.run(
                ["git", "-C", str(repo), "log",
                 f"--since={since}", f"--until={until}",
                 "--pretty=format:%h|%s"],
                capture_output=True, text=True, timeout=10,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if out.returncode == 0 and out.stdout.strip():
            first = out.stdout.strip().splitlines()[0][:80]
            return True, f"git commit {repo.name}: {first}"
    return False, ""


def structured_char_count(text: str) -> int:
    """Count chars on structured-markdown lines (headers/lists/tables/code)."""
    total = 0
    for line in text.splitlines():
        if STRUCTURED_LINE_RE.match(line):
            total += len(line) + 1
    return total


def classify_research_signal(
    messages: list[dict],
) -> tuple[list[str], bool, int, int, bool]:
    """Compute the v3.0 research signal for a session.

    Returns (evidence_strings, has_header, structured_chars, url_count,
    has_save_trigger). The evidence list only includes signals that count
    as research-grade under the tightened rules; a bare save-trigger verb
    is reported separately via `has_save_trigger` so the caller can apply
    corroboration.
    """
    combined_text = ""
    user_text = ""
    for msg in messages:
        role = msg.get("role")
        if role == "user":
            content = msg.get("content")
            if isinstance(content, str):
                user_text += "\n" + content
            elif isinstance(content, list):
                for c in content:
                    if isinstance(c, dict) and c.get("type") == "text":
                        user_text += "\n" + c.get("text", "")
        elif role == "assistant":
            combined_text += "\n" + get_assistant_text(msg)

    has_header = bool(RESEARCH_HEADER_RE.search(combined_text))
    structured = structured_char_count(combined_text)
    urls = URL_CITE_RE.findall(combined_text)
    url_count = len(urls)
    has_save = bool(SAVE_TRIGGER_RE.search(user_text))

    evidence: list[str] = []
    # S2 standalone research triggers: a research header OR many external
    # URLs. Structured-chars alone is NOT a standalone trigger — the
    # corpus has many large coding/operational sessions ("create a resume",
    # "why am I seeing this error") whose markdown output exceeds the
    # threshold but is not research. Structured-chars is used only to
    # corroborate a save-trigger verb (see corroboration_evidence).
    if has_header:
        m = RESEARCH_HEADER_RE.search(combined_text)
        evidence.append(f"research header: {m.group(0).strip()[:80]}")
    if url_count >= MIN_URLS_STANDALONE:
        evidence.append(f"external URLs cited: {url_count} (e.g. {urls[0][:60]})")

    return evidence, has_header, structured, url_count, has_save


def corroboration_evidence(
    base_evidence: list[str],
    has_save: bool,
    has_header: bool,
    structured: int,
    url_count: int,
) -> list[str]:
    """Apply the save-trigger corroboration rule (S4).

    A bare save-trigger verb is only added to the evidence when it is
    corroborated by EITHER an S2 standalone trigger (header / many URLs,
    already in `base_evidence`) OR substantial structured output
    (>= MIN_STRUCTURED_CHARS). A single URL does NOT corroborate — the
    simulation showed that would keep the "do not preserve API keys" +
    one-link noise. All three recovered real misses had a header or
    >= 500 structured chars, so this rule keeps 3/3 while dropping the
    "save money" / "reviewable file paths" verb noise.
    """
    if not has_save:
        return base_evidence
    corroborated = bool(base_evidence) or structured >= MIN_STRUCTURED_CHARS
    if corroborated:
        if structured >= MIN_STRUCTURED_CHARS and not base_evidence:
            # Note *why* the save verb was admitted (structure corroborated it).
            return [f"structured output: {structured} chars",
                    "user asked to save/document/file"]
        return base_evidence + ["user asked to save/document/file"]
    return base_evidence


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


def scan_sessions(
    since_epoch: float | None,
    git_xref: bool = False,
) -> list[Finding]:
    """Scan all Hermes session files for research-without-persist findings.

    Applies the v3.0 tightened heuristics: direct-write rescue (S1),
    quality gate (S2), optional git cross-reference (S3), and
    save-trigger corroboration (S4).

    Args:
        since_epoch: Unix timestamp cutoff. Files modified before this
            are skipped. None means "scan all files."
        git_xref: when True, suppress a session if a knowledge-repo git
            commit landed within +/- GIT_XREF_WINDOW_HOURS of its mtime.
            Slow (one git call per surviving session); opt-in only.
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

        # --- persisted? ---------------------------------------------------
        persisted_via = ""
        if session_has_memroos_write(messages):
            continue  # clean: persisted via the MCP primary path
        direct, reason = session_has_direct_write(messages)
        if direct:
            continue  # clean: persisted via the direct-write fallback (S1)
        if git_xref:
            hit, g_reason = git_xref_has_persist(mtime)
            if hit:
                continue  # clean: a knowledge-repo commit landed nearby (S3)

        # --- research signal (S2) + save corroboration (S4) ---------------
        base_ev, has_header, structured, url_count, has_save = (
            classify_research_signal(messages)
        )
        evidence = corroboration_evidence(
            base_ev, has_save, has_header, structured, url_count
        )
        if not evidence:
            continue  # no research-grade signal; a lone save verb is not enough

        user_count = sum(1 for m in messages if m.get("role") == "user")
        assistant_count = sum(1 for m in messages if m.get("role") == "assistant")
        findings.append(Finding(
            session_id=session_path.stem,
            session_path=session_path,
            modified=str(int(mtime)),
            evidence=evidence,
            has_write=False,
            user_message_count=user_count,
            assistant_message_count=assistant_count,
            structured_chars=structured,
            url_count=url_count,
            has_save_trigger=has_save,
            has_research_header=has_header,
            persisted_via=persisted_via,
        ))
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


def write_report(
    findings: list[Finding],
    since_epoch: float | None,
    missing_writes: list[dict] | None = None,
) -> Path:
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
    missing_writes = missing_writes or []
    if missing_writes:
        lines.append("## ⚠️ Sessions that wrote but the artifact was later deleted (M5)")
        lines.append("")
        for m in missing_writes:
            lines.append(f"### `{m['session_id']}`")
            lines.append(f"- **Session:** `{m['session_path']}`")
            lines.append(f"- **Expected file:** `{m['expected_path']}`")
            lines.append(f"- **Missing on disk:** `{m['missing_file']}`")
            lines.append("")
    if findings:
        lines.append("## ⚠️ Sessions that produced research without writing to MemroOS")
        lines.append("")
        lines.append("_v3.0 heuristics: direct-write rescue + structured-output quality gate + "
                     "save-trigger corroboration. A bare save verb is no longer enough._")
        lines.append("")
        for f in findings:
            lines.append(f"### `{f.session_id}`")
            lines.append(f"- **Path:** `{f.session_path}`")
            lines.append(f"- **Modified epoch:** {f.modified}")
            lines.append(f"- **User messages:** {f.user_message_count}, Assistant messages: {f.assistant_message_count}")
            lines.append(f"- **Signal:** header={f.has_research_header}, "
                         f"structured={f.structured_chars}c, urls={f.url_count}, "
                         f"save_trigger={f.has_save_trigger}")
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


def find_missing_writes(since_epoch: float | None) -> list[dict]:
    """Find sessions that called mcp_memroos_knowledge_write, where the
    write target no longer exists in the MemroOS knowledge base.

    This addresses M5 (delete-after-write): a session that wrote correctly
    at the time but whose artifact was later deleted is still surfaced.
    """
    misses: list[dict] = []
    if not SESSIONS_DIR.is_dir():
        return misses
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
        # Find write paths called in this session
        write_paths: list[str] = []
        for msg in messages:
            if msg.get("role") != "assistant":
                continue
            for tc in msg.get("tool_calls") or []:
                if not isinstance(tc, dict):
                    continue
                fn = tc.get("function") or {}
                if not isinstance(fn, dict) or fn.get("name") != "mcp_memroos_knowledge_write":
                    continue
                args = fn.get("arguments")
                if isinstance(args, str):
                    try:
                        args_obj = json.loads(args)
                    except json.JSONDecodeError:
                        args_obj = {}
                elif isinstance(args, dict):
                    args_obj = args
                else:
                    args_obj = {}
                path = args_obj.get("path")
                if isinstance(path, str):
                    write_paths.append(path)
        if not write_paths:
            continue
        # Check each write path on disk
        for path in write_paths:
            full = MEMROOS_KB_DIR / path
            if not full.exists():
                misses.append({
                    "session_id": session_path.stem,
                    "session_path": str(session_path),
                    "expected_path": path,
                    "missing_file": str(full),
                })
    return misses


def main() -> int:
    args = sys.argv[1:]
    full = "--full" in args
    verify_writes = "--verify-writes" in args
    git_xref = "--git-xref" in args

    since_epoch: float | None
    if full or verify_writes:
        # First run or M5 audit: scan all
        since_epoch = None
    else:
        last = get_last_run_marker()
        since_epoch = last if last > 0 else None

    findings = scan_sessions(since_epoch, git_xref=git_xref)
    missing_writes: list[dict] = []
    if verify_writes:
        missing_writes = find_missing_writes(since_epoch)
    set_last_run_marker(__import__("time").time())
    report = write_report(findings, since_epoch, missing_writes)

    total = len(findings) + len(missing_writes)
    scope = "full" if since_epoch is None else "incremental"
    if total:
        print(f"⚠️  [{scope}] {len(findings)} session(s) without write + "
              f"{len(missing_writes)} session(s) with deleted write = {total} total.")
        print(f"   Report: {report}")
        return 1
    print(f"✅ [{scope}] Clean — no findings.")
    print(f"   Report: {report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())