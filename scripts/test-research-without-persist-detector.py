#!/usr/bin/env python3
"""
Tests for the Research-Without-Persist Detector
================================================

Five test cases:
1. Synthetic session with `## Comparison` header and no write → flagged
2. Synthetic session with `## Comparison` header and mcp_memroos_knowledge_write
   tool call → NOT flagged
3. Synthetic session with empty assistant content but tool_calls that include
   the write → NOT flagged (the v2.0 content-extraction fix)
4. (M5) Synthetic session that wrote correctly but the artifact was later
   deleted → flagged by --verify-writes mode.
5. Synthetic session that wrote correctly and the artifact still exists
   → NOT flagged by --verify-writes mode.

Run with:
    python3 scripts/test-research-without-persist-detector.py

(Plain script — no pytest dependency — so it runs anywhere.)
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

# Load the detector module dynamically. Registering in sys.modules is
# required because @dataclass inspects sys.modules[cls.__module__].__dict__
# at class-creation time.
DETECTOR_PATH = SCRIPT_DIR / "research-without-persist-detector.py"
det_source = DETECTOR_PATH.read_text(encoding="utf-8")
det = type(sys)("det")
det.__file__ = str(DETECTOR_PATH)
sys.modules["det"] = det
exec(compile(det_source, str(DETECTOR_PATH), "exec"), det.__dict__)


# --- Test fixtures ---------------------------------------------------------

def synthetic_session_comparison_no_write(tmp: Path) -> Path:
    """Test 1 fixture: `## Comparison` header, no write call."""
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
    """Test 2 fixture: same as Test 1 plus an mcp_memroos_knowledge_write call."""
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
    """Test 3 fixture: write happened entirely inside tool_calls (content empty)."""
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


def synthetic_session_write_target_deleted(tmp: Path) -> Path:
    """Test 4 fixture (M5): wrote to 'will-be-deleted.md', then it was deleted."""
    msgs = [
        {"role": "user", "content": "Document the analysis"},
        {
            "role": "assistant",
            "content": "",
            "reasoning": "I'll document this.",
            "tool_calls": [
                {
                    "id": "call_m5",
                    "type": "function",
                    "function": {
                        "name": "mcp_memroos_knowledge_write",
                        "arguments": json.dumps({"path": "content/research/will-be-deleted.md"}),
                    },
                }
            ],
            "finish_reason": "tool_calls",
        },
    ]
    p = tmp / "20260705_120000_test4.jsonl"
    p.write_text("\n".join(json.dumps(m) for m in msgs) + "\n")
    return p


def synthetic_session_write_target_exists(tmp: Path) -> tuple[Path, Path]:
    """Test 5 fixture: wrote to 'persisted.md' and it still exists."""
    msgs = [
        {"role": "user", "content": "Document the analysis"},
        {
            "role": "assistant",
            "content": "",
            "reasoning": "I'll document this.",
            "tool_calls": [
                {
                    "id": "call_ok",
                    "type": "function",
                    "function": {
                        "name": "mcp_memroos_knowledge_write",
                        "arguments": json.dumps({"path": "content/research/persisted.md"}),
                    },
                }
            ],
            "finish_reason": "tool_calls",
        },
    ]
    p = tmp / "20260705_120000_test5.jsonl"
    p.write_text("\n".join(json.dumps(m) for m in msgs) + "\n")
    kb = tmp / "kb" / "content" / "research" / "persisted.md"
    kb.parent.mkdir(parents=True, exist_ok=True)
    kb.write_text("# Persisted\n")
    return p, kb


# --- Tests -----------------------------------------------------------------

def test_1_flagged() -> bool:
    """Research evidence, no write → must be flagged."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        synthetic_session_comparison_no_write(tmp)
        det.SESSIONS_DIR = tmp
        findings = det.scan_sessions(since_epoch=None)
        if len(findings) != 1 or findings[0].session_id != "20260705_120000_test1":
            print(f"❌ Test 1 FAILED: expected 1 finding (test1), got {len(findings)}")
            return False
        if findings[0].has_write:
            print(f"❌ Test 1 FAILED: session should NOT have a write")
            return False
    print(f"✅ Test 1 PASSED: research-without-write correctly flagged")
    return True


def test_2_not_flagged_with_write() -> bool:
    """Research evidence + write → must NOT be flagged."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        synthetic_session_comparison_with_write(tmp)
        det.SESSIONS_DIR = tmp
        findings = det.scan_sessions(since_epoch=None)
        if len(findings) != 0:
            print(f"❌ Test 2 FAILED: expected 0 findings, got {len(findings)}")
            return False
    print(f"✅ Test 2 PASSED: session with write NOT flagged (correct)")
    return True


def test_3_tool_call_with_write() -> bool:
    """Write happened entirely inside tool_calls (content empty) → must NOT be flagged."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        synthetic_session_tool_only_with_write(tmp)
        det.SESSIONS_DIR = tmp
        findings = det.scan_sessions(since_epoch=None)
        if len(findings) != 0:
            print(f"❌ Test 3 FAILED: expected 0 findings, got {len(findings)}")
            return False
    print(f"✅ Test 3 PASSED: tool-call-only write correctly NOT flagged")
    return True


def test_4_deleted_after_write() -> bool:
    """(M5) Session wrote correctly but the artifact was later deleted → must be flagged."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        synthetic_session_write_target_deleted(tmp)
        det.SESSIONS_DIR = tmp
        det.MEMROOS_KB_DIR = tmp / "kb"
        misses = det.find_missing_writes(since_epoch=None)
        if len(misses) != 1 or misses[0]["session_id"] != "20260705_120000_test4":
            print(f"❌ Test 4 FAILED: expected 1 missing write (test4), got {len(misses)}")
            return False
        if misses[0]["expected_path"] != "content/research/will-be-deleted.md":
            print(f"❌ Test 4 FAILED: wrong expected_path: {misses[0]['expected_path']}")
            return False
    print(f"✅ Test 4 PASSED: deleted-after-write correctly flagged (M5 fix)")
    return True


def test_5_write_target_exists() -> bool:
    """Write target still exists → must NOT be flagged by --verify-writes."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        p, existing = synthetic_session_write_target_exists(tmp)
        det.SESSIONS_DIR = tmp
        det.MEMROOS_KB_DIR = tmp / "kb"
        misses = det.find_missing_writes(since_epoch=None)
        if len(misses) != 0:
            print(f"❌ Test 5 FAILED: expected 0 missing writes (artifact exists), got {len(misses)}")
            return False
    print(f"✅ Test 5 PASSED: write target exists NOT flagged")
    return True


def main() -> int:
    results = [
        test_1_flagged(),
        test_2_not_flagged_with_write(),
        test_3_tool_call_with_write(),
        test_4_deleted_after_write(),
        test_5_write_target_exists(),
    ]
    if all(results):
        print(f"\n✅ All {len(results)} tests passed")
        return 0
    failed = sum(1 for r in results if not r)
    print(f"\n❌ {failed}/{len(results)} test(s) failed")
    return 1


if __name__ == "__main__":
    sys.exit(main())