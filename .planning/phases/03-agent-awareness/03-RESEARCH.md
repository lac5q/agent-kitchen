# Phase 3: Agent Awareness - Research

**Researched:** 2026-04-09
**Domain:** Claude Code hooks, mem0 HTTP API, session-start context injection
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KNOW-05 | mem0 session-start preload — hook or CLAUDE.md instruction that calls `memory_search` with current project context so agents don't start cold every session | SessionStart hook mechanism verified; mem0 HTTP API confirmed running; query construction patterns identified |

</phase_requirements>

---

## Summary

Phase 3 wires mem0 memory into the beginning of every Claude Code session so agents start with project-relevant context instead of a cold blank slate. The two available mechanisms are (1) a SessionStart shell hook that calls the mem0 HTTP API directly and injects formatted memories as plain-text context, and (2) a CLAUDE.md instruction that directs Claude to call the `memory_search` MCP tool at startup. Research confirms the **SessionStart hook is the better implementation path**: it is fully automatic (no Claude turn required), runs before Claude processes any prompt, and injects context regardless of what instructions Claude might follow.

The mem0 HTTP server is confirmed running on `localhost:3201` via a macOS LaunchAgent (`com.mem0.server`, `KeepAlive: true`). The relevant agents are `claude` (8 memories, session/skill usage) and `shared` (100+ memories, cross-project decisions). The HTTP API's `/memory/search` endpoint requires an explicit `agent_id` — omitting it defaults to `shared` only. The hook must therefore issue **two search calls** (one for `claude`, one for `shared`) and merge results. Project identification uses `basename(cwd)` since the hook's working directory is set to the project root by Claude Code.

**Primary recommendation:** Implement a global SessionStart hook (`~/.claude/hooks/mem0-session-preload.sh`) registered in `~/.claude/settings.json`. The hook queries mem0 for both `claude` and `shared` memories using the project name as the search term, filters to scores above 0.55, and outputs a compact markdown block. Pair this with a brief CLAUDE.md instruction telling Claude how to interpret the injected block. The hook must be fail-safe: any error (mem0 down, slow response, no results) exits silently with code 0 and zero output.

---

## Standard Stack

### Core

| Library/Tool | Version | Purpose | Why Standard |
|---|---|---|---|
| bash | system | SessionStart hook runtime | Already used for all existing hooks in `~/.claude/hooks/` |
| curl | 8.7.1 [VERIFIED: `curl --version`] | HTTP calls to mem0 REST API | Standard, no dependencies, already on PATH |
| python3 | 3.14.2 [VERIFIED: `python3 --version`] | JSON parsing in hook | Already used in `mem0-export.sh` for same task |
| jq | 1.7.1 [VERIFIED: `jq --version`] | Lightweight JSON alternative | Available, simpler for basic field extraction |

### mem0 Stack (pre-existing, no installation needed)

| Component | Location | Purpose |
|---|---|---|
| mem0 HTTP server | `localhost:3201` | REST API for memory search |
| LaunchAgent | `~/Library/LaunchAgents/com.mem0.server.plist` | Auto-start on login, KeepAlive |
| MCP server | `mcp-mem0-wrapper.sh` → `mcp-mem0.py` | Claude tool access (MCP layer) |
| Config | `~/github/knowledge/mem0-config.yaml` | Qdrant Cloud backend |

**No new packages to install** — all tooling is pre-existing. [VERIFIED: live server check `curl http://localhost:3201/health`]

---

## Architecture Patterns

### Recommended Implementation: Global SessionStart Hook

```
~/.claude/
├── hooks/
│   └── mem0-session-preload.sh   # NEW: SessionStart hook
└── settings.json                 # EDIT: register hook under SessionStart
```

```
~/.claude/CLAUDE.md               # EDIT: add mem0 preload interpretation instruction
```

The hook lives at the global level (not project-level) so it fires for ALL projects, satisfying success criterion #2 ("any known project").

### Pattern 1: SessionStart Hook with HTTP API

**What:** A shell script that runs at every session start, queries the mem0 HTTP API for both `claude` and `shared` agent memories using the project name as the search term, and prints a formatted memory block to stdout.

**When to use:** Default for all projects. The hook is fail-safe — if mem0 is unavailable, it exits cleanly.

**How stdout becomes context:** Claude Code SessionStart hook stdout is injected directly as additional context for Claude before any user prompt is processed. [VERIFIED: Claude Code docs `https://code.claude.com/docs/en/hooks`]

**Example:**

```bash
#!/bin/bash
# mem0-session-preload.sh — SessionStart hook: inject relevant memories
# Queries mem0 HTTP API for project-relevant memories at session start.
# FAIL-SAFE: any error = silent exit 0 (never blocks startup)

MEM0_URL="http://localhost:3201"
TIMEOUT=3  # seconds — keep startup fast

# Parse session context from stdin JSON
INPUT=$(cat)
CWD=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('cwd',''))" 2>/dev/null)
SOURCE=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('source','startup'))" 2>/dev/null)

# Only run on fresh session starts (not resume/compact to avoid noise)
if [ "$SOURCE" != "startup" ]; then exit 0; fi

# Extract project name from cwd
PROJECT=$(basename "${CWD:-$(pwd)}")
if [ -z "$PROJECT" ]; then exit 0; fi

# Build query: project name is the primary search term
QUERY="${PROJECT}"

# Search both agents; merge and deduplicate results
search_memories() {
    local agent_id="$1"
    curl -sf --max-time "$TIMEOUT" \
        "${MEM0_URL}/memory/search?q=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${QUERY}'))")&agent_id=${agent_id}&limit=5" \
        2>/dev/null
}

CLAUDE_RESULTS=$(search_memories "claude")
SHARED_RESULTS=$(search_memories "shared")

# Merge, filter by score threshold, format output
python3 - <<'PYEOF'
import json, os, sys

threshold = 0.55
claude_raw = os.environ.get('CLAUDE_RESULTS', '{}')
shared_raw = os.environ.get('SHARED_RESULTS', '{}')

# Parse results
all_mems = []
for raw in [claude_raw, shared_raw]:
    try:
        data = json.loads(raw)
        for r in data.get('results', []):
            score = r.get('score', 0)
            if score >= threshold:
                all_mems.append((score, r.get('user_id', '?'), r.get('memory', '')))
    except:
        pass

if not all_mems:
    sys.exit(0)

# Sort by score descending, take top 5
all_mems.sort(reverse=True)
all_mems = all_mems[:5]

print(f"## Memory Preload — {os.environ.get('PROJECT', 'project')}")
print()
for score, uid, mem in all_mems:
    print(f"- [{uid}] {mem}")
print()
PYEOF

exit 0
```

### Pattern 2: CLAUDE.md Instruction (Paired with Hook)

**What:** A brief instruction in `~/.claude/CLAUDE.md` that tells Claude what to do with the injected memory block — and as a fallback instruction for when the hook output is absent.

**Example addition to `~/.claude/CLAUDE.md`:**

```markdown
## Session Memory

At the start of each session, you will see a "Memory Preload" block above.
These are relevant memories from past sessions. Use them to avoid repeating
past mistakes, recall prior decisions, and maintain continuity across sessions.

If no memory block is present, call `memory_search` with the project name and
current task to retrieve relevant context manually.
```

### Pattern 3: Project-Scoped Memory Queries

The hook uses `basename(cwd)` as the primary search term. For more targeted results, the hook can also incorporate:

1. **Git branch name** (`git -C "$CWD" branch --show-current 2>/dev/null`) for branch-specific context
2. **Recent commit message** (`git -C "$CWD" log --oneline -1 2>/dev/null`) for task continuity
3. Combine as: `"agent-kitchen knowledge curator phase 3"` if STATE.md reveals active phase

[ASSUMED] A compound query (project + phase context) may return better results than project name alone. The current memory corpus has sparse agent-kitchen-specific memories, so scores tend to be 0.5–0.7. This will improve as Phase 2's nightly exports populate the corpus.

### Anti-Patterns to Avoid

- **Blocking startup:** Never use `--max-time` greater than 5 seconds or omit a timeout — mem0 startup latency kills the user experience.
- **Searching without agent_id filter:** The `/memory/search` endpoint defaults `user_id` to `"shared"` when `agent_id` is omitted. Cross-agent search requires separate calls. [VERIFIED: mem0-server.py source]
- **Non-zero exit on mem0 failure:** A hook that exits non-zero blocks or aborts the Claude session. Always `exit 0`.
- **Registering as project-level hook:** A `.claude/settings.json` in the project would only fire for that project. Use global `~/.claude/settings.json` to cover all projects.
- **Using `additionalContext` JSON format for SessionStart:** Plain stdout is simpler and equally effective for this use case. JSON `additionalContext` adds complexity without meaningful benefit here.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| mem0 HTTP client | Custom Python/JS HTTP wrapper | `curl` in hook | Sufficient, no dependencies |
| Memory deduplication | Custom hash-based dedup | Score threshold filter (0.55) | mem0 semantic search already deduplicates by meaning |
| mem0 server management | Process management in hook | LaunchAgent (`KeepAlive: true`) | Already handles restart on crash |
| JSON parsing in shell | `sed`/`awk` on JSON | `python3 -c "import json..."` | Already used in `mem0-export.sh` |

**Key insight:** The entire value of this phase is wiring existing infrastructure together (mem0 ↔ Claude Code SessionStart hook). No new infrastructure, no new services.

---

## Common Pitfalls

### Pitfall 1: mem0 Server Unavailable at Session Start

**What goes wrong:** Hook calls `curl localhost:3201` but server isn't up yet (e.g., after reboot before LaunchAgent starts).

**Why it happens:** LaunchAgent `RunAtLoad: true` starts mem0 at login, but the hook may fire before the server is ready (cold start ~3–5 seconds).

**How to avoid:** Use `--max-time 3` on curl calls. If server isn't up, the curl call fails fast and the hook exits silently. Users don't notice — they just start without memory preload for that session.

**Warning signs:** Claude starts fine but never shows memory preload block. Check `launchctl list | grep mem0` and `curl http://localhost:3201/health`.

### Pitfall 2: Low Relevance Scores (Sparse Memory Corpus)

**What goes wrong:** The hook runs, finds results, but they're irrelevant to the current project (score < 0.55).

**Why it happens:** mem0 memories are keyed to `user_id` (agent_id), not to project names. Until agents write project-specific memories (which Phase 2's nightly export will enable), the corpus is sparse for specific projects.

**How to avoid:** Start with a permissive threshold (0.50) for the first weeks. After Phase 2's nightly exports run for a few days, the corpus will populate. Raise threshold to 0.60 once memory quality improves.

**Warning signs:** Memory preload shows generic cross-project memories (e.g., `"mem0 MCP connected"`). This is expected at Phase 3 launch; improves as Phase 2 runs.

### Pitfall 3: Hook Registers at Project Level Instead of Global

**What goes wrong:** Hook added to `agent-kitchen/.claude/settings.json` instead of `~/.claude/settings.json`.

**Why it happens:** Confusion between global and project-level settings.

**How to avoid:** Verify the hook fires in a different project (e.g., `cd ~/github/shopifybot && claude`). SessionStart should show memory block there too.

### Pitfall 4: stdin JSON Parsing Fails in Bash Hook

**What goes wrong:** Hook reads `cwd` from stdin JSON but fails to parse it, resulting in empty `$PROJECT`.

**Why it happens:** `cat` with `INPUT=$(cat)` works, but `python3 -c` inline with shell variable substitution can fail on special characters.

**How to avoid:** Write stdin to a temp file, or use `jq -r '.cwd // ""'`. Test the hook standalone: `echo '{"cwd":"/Users/test/myproject","source":"startup"}' | bash mem0-session-preload.sh`.

---

## Code Examples

### mem0 HTTP Search (verified against live server)

```bash
# Search 'claude' agent for project memories
# Source: verified live against localhost:3201 on 2026-04-09
curl -sf --max-time 3 \
    "http://localhost:3201/memory/search?q=agent-kitchen&agent_id=claude&limit=5"

# Response format:
# {
#   "results": [
#     {
#       "id": "uuid",
#       "memory": "Claude Code invoked the skill-pruner skill...",
#       "score": 0.612,
#       "user_id": "claude",
#       "created_at": "2026-04-06T12:46:06.269471-07:00",
#       "updated_at": null,
#       "hash": "...",
#       "metadata": null
#     }
#   ]
# }
```

### mem0 MCP Tool (inside Claude, not in hooks)

```typescript
// Source: verified from mcp-mem0.py source, 2026-04-09
// Tool name: memory_search (maps to mcp__mem0__memory_search in Claude tool calls)
memory_search({ query: "agent-kitchen decisions architecture", agent_id: "claude", limit: 5 })
memory_search({ query: "agent-kitchen", agent_id: "shared", limit: 5 })

// Returns formatted string:
// "1. Claude Code invoked the skill-pruner skill during a coding session (relevance: 0.61)
//  2. ..."
```

### SessionStart Hook Registration in settings.json

```json
// Add to ~/.claude/settings.json under "hooks" > "SessionStart"
// Source: verified pattern from existing gsd-check-update.js registration
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash /Users/lcalderon/.claude/hooks/mem0-session-preload.sh",
            "timeout": 8,
            "statusMessage": "Loading memory context..."
          }
        ]
      }
    ]
  }
}
```

### Parsing SessionStart JSON Input

```bash
# SessionStart hook receives JSON on stdin:
# {"session_id":"abc123","cwd":"/Users/.../project","source":"startup","hook_event_name":"SessionStart",...}
# Source: verified from Claude Code docs https://code.claude.com/docs/en/hooks

INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // ""' 2>/dev/null)
SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"' 2>/dev/null)
PROJECT=$(basename "$CWD")
```

---

## Runtime State Inventory

> This phase adds a new SessionStart hook to the global Claude config. It does not rename, migrate, or refactor existing systems.

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | mem0 memories in Qdrant Cloud (`agent_memory` collection) — 8 `claude` memories, 100+ `shared` memories | Read-only; no modification |
| Live service config | `~/.claude/settings.json` — existing `SessionStart` array has 3 hooks | Add new hook entry to array (not replace) |
| OS-registered state | `com.mem0.server` LaunchAgent — already running, `KeepAlive: true` | No change required |
| Secrets/env vars | `QDRANT_API_KEY` injected via LaunchAgent plist; hook uses HTTP API, not Qdrant directly | No change required |
| Build artifacts | None | None |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| mem0 HTTP server | Hook HTTP calls | yes | running at localhost:3201 [VERIFIED: live health check] | Hook exits silently if down; no block |
| curl | Hook HTTP client | yes | 8.7.1 [VERIFIED: `curl --version`] | — |
| python3 | JSON parsing in hook | yes | 3.14.2 [VERIFIED: `python3 --version`] | Use `jq` instead |
| jq | JSON parsing alternative | yes | 1.7.1 [VERIFIED: `jq --version`] | Use python3 |
| ~/.claude/settings.json | Hook registration | yes | exists, writable [VERIFIED: read during research] | — |
| LaunchAgent (com.mem0.server) | mem0 auto-start | yes | KeepAlive:true [VERIFIED: plist read] | Manual `start-mem0-simple.sh` |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** mem0 server may be briefly unavailable after reboot (LaunchAgent cold start ~3–5s). The hook uses `--max-time 3` to fail fast and silently.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Cold session start (no memory) | SessionStart hook injects memory preload | Phase 3 (this phase) | Agents recall past decisions without manual prompting |
| CLAUDE.md-only memory instructions | Hook + CLAUDE.md paired | Phase 3 | Hook is automatic; CLAUDE.md is fallback/interpretation layer |
| memory_search on demand (user must ask) | Automatic preload on session start | Phase 3 | Zero friction — memory surfaces proactively |

**Note on mem0 corpus sparsity:** The `claude` agent currently has only 8 memories (mostly skill invocations logged automatically). The `shared` agent has 100+ cross-project memories. Project-specific agent-kitchen memories will accumulate over time as: (1) Claude Code sessions write to `claude` agent, and (2) Phase 2's nightly export runs and makes memories searchable via Qdrant.

---

## Validation Architecture

> nyquist_validation is not set in `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|---|---|
| Framework | Manual verification (no automated test framework for shell hooks) |
| Config file | none |
| Quick run command | `echo '{"cwd":"/Users/lcalderon/github/agent-kitchen","source":"startup"}' \| bash ~/.claude/hooks/mem0-session-preload.sh` |
| Full suite command | Same command across multiple projects |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|---|---|---|---|---|
| KNOW-05 (SC1) | CLAUDE.md instruction or hook exists | manual | `ls ~/.claude/hooks/mem0-session-preload.sh && grep -c "mem0" ~/.claude/settings.json` | File existence check |
| KNOW-05 (SC2) | Starting a session surfaces at least one memory | manual | `echo '{"cwd":"...","source":"startup"}' \| bash ~/.claude/hooks/mem0-session-preload.sh` | Functional test |

### Wave 0 Gaps

- [ ] `~/.claude/hooks/mem0-session-preload.sh` — covers KNOW-05 SC1/SC2 (to be created in Wave 1)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | no | mem0 is localhost-only, no auth |
| V3 Session Management | no | hook is stateless read-only |
| V4 Access Control | no | localhost-only service |
| V5 Input Validation | yes | project name from cwd — sanitize before URL-encoding in curl call |
| V6 Cryptography | no | no secrets in hook output |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Path traversal in project name | Tampering | `basename "$CWD"` strips path components; URL-encode before curl |
| mem0 output contains injected instructions | Tampering / prompt injection | Memories are human-written facts, not instructions; output wrapped in clear section header |
| Hook output too large (floods context) | DoS | Limit to top 5 memories; total output < 1KB |

**Key point:** The hook reads from a trusted local service (localhost:3201). The primary security consideration is that mem0 memories could theoretically contain adversarial content if a malicious memory was written (e.g., via a compromised agent). Mitigation: limit output to 5 items; the `## Memory Preload` section header frames it clearly as data, not instruction.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | A compound query (project + phase context) may return better results than project name alone | Architecture Patterns | Hook may need query refinement after testing; acceptable to ship with simple query first |
| A2 | Relevance will improve after Phase 2's nightly exports populate the corpus | Common Pitfalls #2 | If mem0 memories are never written in project context, the hook will always return low-relevance shared memories |

---

## Open Questions

1. **Should the hook also search by the current git branch name?**
   - What we know: `git -C "$CWD" branch --show-current` is available in hook context
   - What's unclear: Will branch-based queries produce meaningfully different results from project-name queries alone?
   - Recommendation: Start with project name only; add git context in a follow-up if results are too noisy

2. **Which `source` values should trigger the preload?**
   - What we know: `source` can be `startup`, `resume`, `clear`, `compact`
   - What's unclear: Should `resume` sessions also get a preload? They already have context in transcript
   - Recommendation: `startup` only for Phase 3. Avoids double-injection on resume.

3. **Should scores below 0.55 be shown if no results exceed threshold?**
   - What we know: Current corpus returns mostly 0.5–0.7 for project queries
   - What's unclear: Is "no results shown" better UX than "low-confidence results shown"?
   - Recommendation: Show results if any exist (no threshold filter), but display score so Claude can judge relevance. Alternatively: threshold 0.50 for Phase 3, revisit.

---

## Sources

### Primary (HIGH confidence)

- `localhost:3201` (live mem0 HTTP API) — health check, memory search behavior, response format, agent_id defaulting
- `~/github/knowledge/mcp-mem0.py` (source code) — MCP tool interface, `memory_search` signature, HTTP API wrapper
- `~/github/knowledge/mem0-server.py` (source code) — `/memory/search` endpoint, `agent_id` defaults to `"shared"`, supported parameters
- `~/.claude/settings.json` (live config) — existing `SessionStart` hooks pattern, hook registration format
- `~/.claude/hooks/gsd-session-state.sh` (source code) — hook template pattern, stdin reading, stdout injection
- `https://code.claude.com/docs/en/hooks` [CITED: fetched 2026-04-09] — SessionStart hook JSON input schema, stdout injection behavior, `source` field values
- `~/Library/LaunchAgents/com.mem0.server.plist` (live config) — `KeepAlive: true`, `RunAtLoad: true`

### Secondary (MEDIUM confidence)

- `~/github/knowledge/shared/AGENT_INFRASTRUCTURE_SETUP.md` — mem0 access patterns for Claude Code (MCP tools), HTTP API examples

### Tertiary (LOW confidence)

- Web search: Claude Code SessionStart hook behavior and additionalContext injection (corroborated by official docs fetch)

---

## Metadata

**Confidence breakdown:**
- Hook mechanism: HIGH — verified from official docs + existing working hooks in settings.json
- mem0 API: HIGH — verified from live server + source code
- Query strategy: MEDIUM — functional search confirmed, relevance quality depends on corpus growth
- Success criteria feasibility: HIGH — both SC1 and SC2 are achievable with a shell hook

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable infrastructure; mem0 API and Claude Code hook format unlikely to change)
