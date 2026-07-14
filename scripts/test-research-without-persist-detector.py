#!/usr/bin/env python3
"""
Tests for the Research-Without-Persist Detector
================================================

Original cases (v2.0):
1. Synthetic session with `## Comparison` header and no write → flagged
2. Synthetic session with `## Comparison` header and mcp_memroos_knowledge_write
   tool call → NOT flagged
3. Synthetic session with empty assistant content but tool_calls that include
   the write → NOT flagged (the v2.0 content-extraction fix)
4. (M5) Synthetic session that wrote correctly but the artifact was later
   deleted → flagged by --verify-writes mode.
5. Synthetic session that wrote correctly and the artifact still exists
   → NOT flagged by --verify-writes mode.

v3.0 cases (tightened heuristics, 2026-07-08):
6.  Direct-write fallback (write_file under ~/github/knowledge) → NOT flagged (S1)
7.  Shell heredoc/cat> write under knowledge tree → NOT flagged (S1)
8.  Save verb + one-line answer, no structure → NOT flagged (S2 quality gate)
9.  Save-verb noise ("do not preserve API keys") + 1 URL → NOT flagged (S4)
10. Save verb in generic context + substantial structured output → flagged (S4
    regression: protects the 3 recovered artifacts a tighter regex would drop)
11. >= MIN_URLS_STANDALONE external URLs, no save verb → flagged (S2 standalone)

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


# --- v3.0 fixtures ---------------------------------------------------------

def synthetic_session_direct_write_fallback(tmp: Path) -> Path:
    """S1 fixture: research header + a write_file to ~/github/knowledge/... .

    This is the Vendasta pattern — the agent couldn't reach the MCP and
    wrote directly to the knowledge tree. The detector must NOT flag it.
    """
    msgs = [
        {"role": "user", "content": "Research Vendasta and save it"},
        {
            "role": "assistant",
            "content": "## Analysis\n\nVendasta is a ...",
            "reasoning": "Writing to the fallback path.",
            "tool_calls": [
                {
                    "id": "call_dw",
                    "type": "function",
                    "function": {
                        "name": "write_file",
                        "arguments": json.dumps({
                            "path": "/Users/x/github/knowledge/projects/agency/vendors/vendasta.md",
                        }),
                    },
                }
            ],
            "finish_reason": "tool_calls",
        },
    ]
    p = tmp / "20260424_145419_test_dw.jsonl"
    p.write_text("\n".join(json.dumps(m) for m in msgs) + "\n")
    return p


def synthetic_session_direct_write_shell(tmp: Path) -> Path:
    """S1 fixture: heredoc shell write under the knowledge tree."""
    msgs = [
        {"role": "user", "content": "Save this research"},
        {
            "role": "assistant",
            "content": "",
            "reasoning": "Using a heredoc.",
            "tool_calls": [
                {
                    "id": "call_sh",
                    "type": "function",
                    "function": {
                        "name": "terminal",
                        "arguments": json.dumps({
                            "command": "cat > /Users/x/github/knowledge/x.md <<'EOF'\n# stuff\nEOF"
                        }),
                    },
                }
            ],
            "finish_reason": "tool_calls",
        },
    ]
    p = tmp / "20260701_000000_test_sh.jsonl"
    p.write_text("\n".join(json.dumps(m) for m in msgs) + "\n")
    return p


def synthetic_session_one_liner_ack(tmp: Path) -> Path:
    """S2 fixture: user said 'save' + assistant gave a one-line answer, no URLs.

    No header and < MIN_STRUCTURED_CHARS. Must NOT be flagged (the dominant
    noise pattern from the 2026-07-05 backlog).
    """
    long_verb_phrase = "Note this down: save money on the monthly plan."
    msgs = [
        {"role": "user", "content": long_verb_phrase},
        {"role": "assistant", "content": "OK, got it.", "finish_reason": "stop"},
    ]
    p = tmp / "20260512_211219_test_ol.jsonl"
    p.write_text("\n".join(json.dumps(m) for m in msgs) + "\n")
    return p


def synthetic_session_save_verb_noise(tmp: Path) -> Path:
    """S4 fixture: 'reviewable file paths' / 'do not preserve API keys' noise.

    Save-trigger verb in non-imperative context + < structured threshold +
    few URLs. Must NOT be flagged.
    """
    msgs = [
        {"role": "user", "content": "Do not preserve any API keys or credentials."},
        {
            "role": "assistant",
            "content": "Understood — I will not preserve credentials. Here is one link https://example.com",
            "finish_reason": "stop",
        },
    ]
    p = tmp / "20260501_133222_test_sv.jsonl"
    p.write_text("\n".join(json.dumps(m) for m in msgs) + "\n")
    return p


def synthetic_session_real_miss_pattern(tmp: Path) -> Path:
    """S4 regression fixture: a REAL recovered-artifact pattern.

    Mirrors the creator-outreach / context-rot recoveries: the user used a
    save verb in generic context, but the assistant produced substantial
    structured research (>= MIN_STRUCTURED_CHARS). Must BE flagged — this
    is exactly the case tightening the verb regex would have broken.
    """
    # Build >= MIN_STRUCTURED_CHARS of structured markdown.
    bullet = "- Point with enough detail to be research-grade content here.\n"
    block = "## Analysis\n\n" + bullet * 60
    msgs = [
        {"role": "user", "content": "ready to save [tool: execute_code]\nNext step."},
        {"role": "assistant", "content": block, "finish_reason": "stop"},
    ]
    p = tmp / "20260519_173730_test_rm.jsonl"
    p.write_text("\n".join(json.dumps(m) for m in msgs) + "\n")
    return p


def synthetic_session_many_urls_no_save(tmp: Path) -> Path:
    """S2 fixture: >= MIN_URLS_STANDALONE external URLs, no save verb, no write.

    Many URLs alone is a research signal. Must BE flagged.
    """
    urls = " ".join(f"https://example.com/p{i}" for i in range(10))
    msgs = [
        {"role": "user", "content": "What did you find?"},
        {"role": "assistant", "content": f"Sources:\n{urls}", "finish_reason": "stop"},
    ]
    p = tmp / "20260505_023729_test_mu.jsonl"
    p.write_text("\n".join(json.dumps(m) for m in msgs) + "\n")
    return p


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


# --- v3.0 tests ------------------------------------------------------------

def _scan_ids(tmp: Path) -> set[str]:
    """Helper: scan tmp and return the set of flagged session ids."""
    det.SESSIONS_DIR = tmp
    return {f.session_id for f in det.scan_sessions(since_epoch=None)}


def test_6_direct_write_fallback_not_flagged() -> bool:
    """S1: write_file to ~/github/knowledge/... → must NOT be flagged."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        synthetic_session_direct_write_fallback(tmp)
        ids = _scan_ids(tmp)
        if "20260424_145419_test_dw" in ids:
            print(f"❌ Test 6 FAILED: direct-write fallback was flagged")
            return False
    print(f"✅ Test 6 PASSED: direct-write fallback NOT flagged (S1 rescue)")
    return True


def test_7_direct_write_shell_not_flagged() -> bool:
    """S1: heredoc/cat> shell write under knowledge tree → NOT flagged."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        synthetic_session_direct_write_shell(tmp)
        ids = _scan_ids(tmp)
        if "20260701_000000_test_sh" in ids:
            print(f"❌ Test 7 FAILED: shell direct-write was flagged")
            return False
    print(f"✅ Test 7 PASSED: shell direct-write NOT flagged (S1 rescue)")
    return True


def test_8_one_liner_not_flagged() -> bool:
    """S2: save verb + one-line answer, no structure → NOT flagged."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        synthetic_session_one_liner_ack(tmp)
        ids = _scan_ids(tmp)
        if ids:
            print(f"❌ Test 8 FAILED: one-liner ack was flagged: {ids}")
            return False
    print(f"✅ Test 8 PASSED: one-liner ack NOT flagged (S2 quality gate)")
    return True


def test_9_save_verb_noise_not_flagged() -> bool:
    """S4: 'do not preserve API keys' noise + 1 URL → NOT flagged."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        synthetic_session_save_verb_noise(tmp)
        ids = _scan_ids(tmp)
        if ids:
            print(f"❌ Test 9 FAILED: save-verb noise was flagged: {ids}")
            return False
    print(f"✅ Test 9 PASSED: save-verb noise NOT flagged (S4 corroboration)")
    return True


def test_10_real_miss_pattern_flagged() -> bool:
    """S4 regression: save verb in generic context + substantial structured
    output → MUST be flagged. This protects the 3 recovered artifacts that
    a tighter verb-regex would have dropped as false negatives."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        synthetic_session_real_miss_pattern(tmp)
        ids = _scan_ids(tmp)
        if "20260519_173730_test_rm" not in ids:
            print(f"❌ Test 10 FAILED: real-miss pattern NOT flagged: {ids}")
            return False
    print(f"✅ Test 10 PASSED: real-miss pattern flagged (no false negative)")
    return True


def test_11_many_urls_flagged() -> bool:
    """S2: >= MIN_URLS_STANDALONE URLs alone → MUST be flagged."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        synthetic_session_many_urls_no_save(tmp)
        ids = _scan_ids(tmp)
        if "20260505_023729_test_mu" not in ids:
            print(f"❌ Test 11 FAILED: many-URL session NOT flagged: {ids}")
            return False
    print(f"✅ Test 11 PASSED: many-URL session flagged (S2 standalone)")
    return True


def main() -> int:
    results = [
        test_1_flagged(),
        test_2_not_flagged_with_write(),
        test_3_tool_call_with_write(),
        test_4_deleted_after_write(),
        test_5_write_target_exists(),
        test_6_direct_write_fallback_not_flagged(),
        test_7_direct_write_shell_not_flagged(),
        test_8_one_liner_not_flagged(),
        test_9_save_verb_noise_not_flagged(),
        test_10_real_miss_pattern_flagged(),
        test_11_many_urls_flagged(),
    ]
    if all(results):
        print(f"\n✅ All {len(results)} tests passed")
        return 0
    failed = sum(1 for r in results if not r)
    print(f"\n❌ {failed}/{len(results)} test(s) failed")
    return 1


if __name__ == "__main__":
    sys.exit(main())