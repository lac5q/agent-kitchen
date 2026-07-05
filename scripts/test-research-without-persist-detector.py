#!/usr/bin/env python3
"""
Tests for the Research-Without-Persist Detector
================================================

Three test cases:
1. Synthetic session with `## Comparison` header and no write → flagged
2. Synthetic session with `## Comparison` header and mcp_memroos_knowledge_write
   tool call → NOT flagged
3. Synthetic session with empty assistant content but tool_calls that include
   the write → NOT flagged (the v2.0 content-extraction fix)

Run with:
    python3 scripts/test-research-without-persist-detector.py

(Plain script — no pytest dependency — so it runs anywhere.)
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

# Load the detector module dynamically. Registering in sys.modules is
# required because @dataclass inspects sys.modules[cls.__module__].__dict__
# at class-creation time.
SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

DETECTOR_PATH = SCRIPT_DIR / "research-without-persist-detector.py"
det_source = DETECTOR_PATH.read_text(encoding="utf-8")
det = type(sys)("det")
det.__file__ = str(DETECTOR_PATH)
sys.modules["det"] = det
exec(compile(det_source, str(DETECTOR_PATH), "exec"), det.__dict__)


# --- Test fixtures ---------------------------------------------------------

def synthetic_session_comparison_no_write(tmp: Path) -> Path:
    """Session with `## Comparison` header but no mcp_memroos_knowledge_write."""
    msgs = [
        {"role": "user", "content": "Compare Acme vs Beta for our use case"},
        {
            "role": "assistant",
            "content": "## Comparison\n\nAcme is faster but more expensive. Beta is cheaper.",
            "reasoning": "User asked for a comparison.",
            "finish_reason": "stop",
        },
    ]
    p = tmp / "20260705_120000_test1.jsonl"
    p.write_text("\n".join(json.dumps(m) for m in msgs) + "\n")
    return p


def synthetic_session_comparison_with_write(tmp: Path) -> Path:
    """Same as above but with an mcp_memroos_knowledge_write tool call."""
    msgs = [
        {"role": "user", "content": "Compare Acme vs Beta for our use case"},
        {
            "role": "assistant",
            "content": "",
            "reasoning": "Comparing Acme vs Beta.",
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {
                        "name": "mcp_memroos_knowledge_write",
                        "arguments": json.dumps({"path": "content/comparisons/acme-vs-beta.md"}),
                    },
                }
            ],
            "finish_reason": "tool_calls",
        },
        {
            "role": "assistant",
            "content": "## Comparison\n\nAcme is faster. Beta is cheaper. Wrote to MemroOS.",
            "finish_reason": "stop",
        },
    ]
    p = tmp / "20260705_120000_test2.jsonl"
    p.write_text("\n".join(json.dumps(m) for m in msgs) + "\n")
    return p


def synthetic_session_tool_only_with_write(tmp: Path) -> Path:
    """Session where the write happened entirely inside a tool_call (content empty)."""
    msgs = [
        {"role": "user", "content": "Document the security finding"},
        {
            "role": "assistant",
            "content": "",
            "reasoning": "I'll document the finding.",
            "tool_calls": [
                {
                    "id": "call_2",
                    "type": "function",
                    "function": {
                        "name": "mcp_memroos_knowledge_write",
                        "arguments": json.dumps({"path": "content/research/security-finding.md"}),
                    },
                }
            ],
            "finish_reason": "tool_calls",
        },
    ]
    p = tmp / "20260705_120000_test3.jsonl"
    p.write_text("\n".join(json.dumps(m) for m in msgs) + "\n")
    return p


# --- Tests -----------------------------------------------------------------

def test_1_flagged() -> bool:
    """Test 1: research evidence, no write → must be flagged."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        p = synthetic_session_comparison_no_write(tmp)
        # Point the detector at this temp dir
        det.SESSIONS_DIR = tmp
        findings = det.scan_sessions(since_epoch=None)
        if len(findings) != 1 or findings[0].session_id != "20260705_120000_test1":
            print(f"❌ Test 1 FAILED: expected 1 finding (test1), got {len(findings)}: {[f.session_id for f in findings]}")
            return False
        if findings[0].has_write:
            print(f"❌ Test 1 FAILED: session should NOT have a write")
            return False
    print(f"✅ Test 1 PASSED: research-without-write correctly flagged")
    return True


def test_2_not_flagged_with_write() -> bool:
    """Test 2: research evidence + write → must NOT be flagged."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        p = synthetic_session_comparison_with_write(tmp)
        det.SESSIONS_DIR = tmp
        findings = det.scan_sessions(since_epoch=None)
        if len(findings) != 0:
            print(f"❌ Test 2 FAILED: expected 0 findings (write happened), got {len(findings)}: {[f.session_id for f in findings]}")
            return False
    print(f"✅ Test 2 PASSED: session with write NOT flagged (correct)")
    return True


def test_3_tool_call_with_write() -> bool:
    """Test 3: write happened entirely inside tool_calls (content empty) → must NOT be flagged."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        p = synthetic_session_tool_only_with_write(tmp)
        det.SESSIONS_DIR = tmp
        findings = det.scan_sessions(since_epoch=None)
        if len(findings) != 0:
            print(f"❌ Test 3 FAILED: expected 0 findings (tool-call write), got {len(findings)}")
            return False
    print(f"✅ Test 3 PASSED: tool-call-only write correctly NOT flagged")
    return True


def main() -> int:
    results = [test_1_flagged(), test_2_not_flagged_with_write(), test_3_tool_call_with_write()]
    if all(results):
        print("\n✅ All tests passed")
        return 0
    print(f"\n❌ {results.count(False)} test(s) failed")
    return 1


if __name__ == "__main__":
    sys.exit(main())