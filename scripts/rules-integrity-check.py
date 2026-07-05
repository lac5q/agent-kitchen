#!/usr/bin/env python3
"""
Rules Integrity Checker
========================

Verifies that the canonical Knowledge Filing rule in RULES_SOURCE.md
matches the rule block present in every distributed target file.

This catches the failure mode where someone manually edits ~/.hermes/AGENTS.md
(or any other target) and the canonical rule drifts out of sync — silently.

Exit codes:
  0 = all targets match canonical
  1 = drift detected (file:line details printed)
  2 = canonical rule not found in RULES_SOURCE.md itself

Schedule: every 6 hours via cron. Posts to Discord #memroos on drift.
"""

import os
import re
import sys
import hashlib
from pathlib import Path

HOME = Path.home()
KNOWLEDGE_REPO = HOME / "github" / "knowledge"
RULES_SOURCE = KNOWLEDGE_REPO / "shared" / "RULES_SOURCE.md"

# Canonical rule block — the entire ## Knowledge Filing section.
# This is what we expect to find (verbatim, modulo whitespace) in every
# distributed target.

CANONICAL_HEADING = "## Knowledge Filing"

# Targets mirror rules-distributor.py — keep in sync.
TARGETS = [
    ("claude", HOME / ".claude" / "CLAUDE.md"),
    ("codex", HOME / ".codex" / "AGENTS.md"),
    ("cursor", HOME / ".cursorrules"),
    ("gemini", HOME / ".gemini" / "GEMINI.md"),
    ("qwen", HOME / ".qwen" / "QWEN.md"),
    ("opencode", HOME / ".config" / "opencode" / "instructions.md"),
    ("hermes", HOME / ".hermes" / "AGENTS.md"),
]

# OpenClaw workspaces — glob-discovered
OPENCLAW_GLOB = list(HOME.glob(".openclaw/workspace*/AGENTS.md"))
OPENCLAW_GLOB += list((HOME / ".openclaw" / "workspace").glob("*/AGENTS.md"))
for path in OPENCLAW_GLOB:
    name = path.parent.name
    TARGETS.append((f"openclaw:{name}", path))


def extract_canonical_block() -> str:
    """Read RULES_SOURCE.md and extract the ## Knowledge Filing block."""
    if not RULES_SOURCE.exists():
        print(f"❌ RULES_SOURCE.md not found at {RULES_SOURCE}", file=sys.stderr)
        sys.exit(2)
    text = RULES_SOURCE.read_text()
    # Match the heading and capture until the next ## heading or EOF
    pattern = re.compile(
        r"(## Knowledge Filing.*?)(?=\n## |\Z)",
        re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        print(f"❌ Canonical '{CANONICAL_HEADING}' block not found in RULES_SOURCE.md", file=sys.stderr)
        sys.exit(2)
    return match.group(1).strip()


def normalize(text: str) -> str:
    """Normalize text for comparison: collapse whitespace, strip trailing."""
    # Collapse all whitespace runs to a single space, strip
    return re.sub(r"\s+", " ", text).strip()


def find_rule_in_target(path: Path) -> tuple[bool, str]:
    """Return (found, normalized_block_in_file)."""
    if not path.exists():
        return False, ""
    text = path.read_text()
    pattern = re.compile(
        r"(## Knowledge Filing.*?)(?=\n## |\Z)",
        re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        return False, ""
    return True, normalize(match.group(1))


def main():
    canonical_block = extract_canonical_block()
    canonical_norm = normalize(canonical_block)
    canonical_hash = hashlib.sha256(canonical_norm.encode()).hexdigest()[:12]

    print(f"Canonical block hash: {canonical_hash}")
    print(f"Canonical block (normalized, first 200 chars):")
    print(f"  {canonical_norm[:200]}...")
    print()

    drift = []
    missing = []
    ok = []

    for name, path in TARGETS:
        found, in_file = find_rule_in_target(path)
        if not found:
            if path.exists():
                missing.append((name, path, "rule block not found"))
            else:
                missing.append((name, path, "file does not exist"))
            continue
        if in_file == canonical_norm:
            ok.append((name, path))
        else:
            drift.append((name, path, in_file))

    print(f"✅ {len(ok)} target(s) match canonical rule")
    for name, path in ok:
        print(f"   {name}: {path}")
    print()

    if missing:
        print(f"❌ {len(missing)} target(s) MISSING the rule:")
        for name, path, reason in missing:
            print(f"   {name}: {path} — {reason}")
        print()

    if drift:
        print(f"⚠️  {len(drift)} target(s) DRIFTED from canonical:")
        for name, path, in_file in drift:
            print(f"   {name}: {path}")
            print(f"     Canonical: {canonical_norm[:120]}...")
            print(f"     In file:   {in_file[:120]}...")
            print()

    if drift or missing:
        print("=" * 60)
        print("DRIFT DETECTED. Run `python3 ~/github/knowledge/scripts/rules-distributor.py` to re-converge.")
        print("=" * 60)
        sys.exit(1)

    print("✅ All targets match canonical rule.")


if __name__ == "__main__":
    main()