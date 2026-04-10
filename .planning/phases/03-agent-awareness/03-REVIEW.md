---
phase: 03-agent-awareness
reviewed: 2026-04-09T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - /Users/lcalderon/.claude/hooks/mem0-session-preload.sh
  - /Users/lcalderon/.claude/CLAUDE.md
findings:
  critical: 1
  warning: 2
  info: 3
  total: 6
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-04-09
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Two files were reviewed: the new `mem0-session-preload.sh` SessionStart hook and the updated `CLAUDE.md` instruction file. The shell script is well-structured with correct fail-safe patterns (non-zero exit suppression, curl fallbacks, silent Python errors). One critical issue exists: memory strings fetched from mem0 are injected verbatim into the agent's session context, creating a prompt injection vector. Two warnings cover an incorrect API response field assumption and missing binary dependency guards. Three info items cover minor hardening opportunities.

`CLAUDE.md` changes are documentation-only and correct.

---

## Critical Issues

### CR-01: Prompt Injection via Unsanitized mem0 Memory Content

**File:** `/Users/lcalderon/.claude/hooks/mem0-session-preload.sh:76`

**Issue:** Memory strings retrieved from mem0 are printed verbatim into the agent's system context (`print(f"- [{uid}] {mem}")`). If any stored memory contains adversarial text such as `"Ignore previous instructions and..."`, that text will be injected into the Claude session context at startup with no sanitization or escaping. Since mem0 memories can be written by any agent or process (including the Knowledge Curator), a compromised or malicious memory write would silently execute a prompt injection attack on every subsequent session startup.

**Fix:** Strip or escape any text that looks like a markdown heading, instruction directive, or system-level command before printing. At minimum, replace newlines within individual memory strings so a single memory cannot span multiple lines and masquerade as a new section:

```python
import re

def sanitize_mem(text: str) -> str:
    # Collapse internal newlines — prevents multi-line injection
    text = text.replace('\n', ' ').replace('\r', ' ')
    # Strip leading '#' characters that could open a new markdown heading
    text = re.sub(r'^#+\s*', '', text.strip())
    return text

for score, uid, mem in all_mems:
    print(f"- [{uid}] {sanitize_mem(mem)}")
```

A stronger defense is to enforce a character allowlist or max length per memory (e.g., 300 chars).

---

## Warnings

### WR-01: API Response Field `user_id` May Not Exist — Silent Data Loss

**File:** `/Users/lcalderon/.claude/hooks/mem0-session-preload.sh:60`

**Issue:** The Python block reads `r.get('user_id', '?')` to extract a label for each memory result. The mem0 HTTP search API response schema uses `agent_id` (or no user identifier at all in the results array), not `user_id`. If the field name is wrong, every memory entry will display `[?]` as its label, which reduces usefulness but does not surface as an error because `get` with a default silently succeeds. Worse, if the field name for the memory text (`memory`) is also wrong, all results will appear as empty strings and the block will be printed with blank bullets — a subtle silent failure.

**Fix:** Verify the exact response schema from `mem0` (`/memory/search` endpoint) and use the correct field names. Add a guard that skips entries where the memory text is empty:

```python
for r in data.get('results', []):
    score = r.get('score', 0)
    mem_text = r.get('memory', '') or r.get('text', '')  # check both common field names
    if score >= threshold and mem_text:
        agent_label = r.get('agent_id') or r.get('user_id') or '?'
        all_mems.append((score, agent_label, mem_text))
```

### WR-02: No Guard for Required Binary Dependencies (`jq`, `python3`, `curl`)

**File:** `/Users/lcalderon/.claude/hooks/mem0-session-preload.sh:15`

**Issue:** The script depends on `jq`, `curl`, and `python3` without verifying they are available. On a fresh machine or in a restricted environment, any of these missing will produce a command-not-found error. While `set +e` and `2>/dev/null` suppress most failure output, the missing-binary case for `jq` on line 15 means `CWD` and `SOURCE` will be empty strings, causing the gate on line 19 (`SOURCE != "startup"`) to evaluate as `"" != "startup"` — which is **true** — so the script will always proceed past the gate even when `jq` is absent. This could trigger spurious curl calls against an unreachable mem0 server on every session start.

**Fix:** Add a fast dependency check near the top, before any processing:

```bash
# Dependency guard — fail fast and silently if required tools are missing
for dep in jq curl python3; do
    command -v "$dep" >/dev/null 2>&1 || exit 0
done
```

Place this block immediately after the variable declarations (after line 11).

---

## Info

### IN-01: `SCORE_THRESHOLD` Exported as String — Float Conversion Depends on Locale

**File:** `/Users/lcalderon/.claude/hooks/mem0-session-preload.sh:11,47`

**Issue:** `SCORE_THRESHOLD` is set as the string `"0.50"` in shell and parsed with `float()` in Python. In locales that use a comma as the decimal separator (e.g., `LC_NUMERIC=de_DE`), `float("0.50")` succeeds because the value comes from the env var string — but any future `printf`-formatted float output from shell could break. This is low risk today but worth noting.

**Fix:** Explicitly set `LC_NUMERIC=C` at the top of the script to pin numeric formatting:

```bash
export LC_NUMERIC=C
```

### IN-02: Hardcoded `limit=5` in Both curl Calls — Magic Number

**File:** `/Users/lcalderon/.claude/hooks/mem0-session-preload.sh:31,35`

**Issue:** The query limit `5` appears twice in the curl URLs and is not extracted into a named variable. The final deduplication (`all_mems[:5]`) uses the same value implicitly, but if limits are ever changed, they must be updated in three places.

**Fix:**

```bash
MEM0_LIMIT=5  # memories per agent source

CLAUDE_RESULTS=$(curl -sf --max-time "$TIMEOUT" \
    "${MEM0_URL}/memory/search?q=${QUERY_ENCODED}&agent_id=claude&limit=${MEM0_LIMIT}" \
    2>/dev/null || echo '{"results":[]}')
```

Export `MEM0_LIMIT` and use `int(os.environ.get('MEM0_LIMIT', '5'))` in Python.

### IN-03: `CLAUDE.md` Fallback Instruction References Potentially Unavailable Tool

**File:** `/Users/lcalderon/.claude/CLAUDE.md:56-57`

**Issue:** The new "Session Memory" section instructs: "If no Memory Preload block appears... call `memory_search` with the project name." The `memory_search` tool is an MCP tool that is only available when the mem0 MCP server is running. When mem0 is down (the exact condition that would cause the hook to produce no output), `memory_search` will also be unavailable. The fallback instruction would silently fail.

**Fix:** Soften the instruction to acknowledge the dependency:

```markdown
If no Memory Preload block appears (mem0 may be unavailable), attempt to call
`memory_search` with the project name if the tool is available. If it is not,
note the absence of memory context and proceed without it.
```

---

_Reviewed: 2026-04-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
