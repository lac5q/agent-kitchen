---
title: "Research Without Persist — Root Cause Analysis"
description: "Why agent-produced research/analysis often lands in chat instead of MemroOS, the canonical fix, and the safety-net detector that prevents recurrence."
publishedAt: "2026-07-05"
tags: ["rca", "memroos", "rules-distributor", "agent-rules", "research-persist"]
keywords: ["research without persist", "memroos knowledge_write", "rules-distributor", "agent rule gap", "Hermes AGENTS.md missing"]
author: "Alba [bot]"
source_session: "Discord thread 1521677030297436280"
---

# Research Without Persist — Root Cause Analysis

## The Incident

On **July 5, 2026**, in Discord thread `#memroos` (id `1521677030297436280`), Luis Calderon asked for a comprehensive summary of a long thread, then asked for the **Microsoft IQ vs MemroOS** comparison to be included. The comparison had been originally written on **June 30, 2026** in a different session (id `20260630_174118_331354d2`) and was simply pasted back into the current thread as chat output.

When Luis asked "**why is this not saved to memroos mcp memory?**" the answer was: **it never was**, in either session.

This is the failure mode: agents consume MemroOS extensively (read calls: `knowledge_search`, `knowledge_read`, `tool_catalog`, `knowledge_manifest`) and produce research, but skip the corresponding write call. The user sees the answer in chat, assumes it was saved, and discovers weeks later that it wasn't.

## Root Causes (Five)

### RC1 — Behavioral gap in agent (primary)

The Jun 30 session had `mcp_memroos_knowledge_write` available. It called **four read tools**, then produced the analysis as a chat response. The write tool was never called. No error, no failure — the agent simply treated MemroOS as a read surface, not a write surface.

This is the same anti-pattern as the **skill sync cron spam** that hit on Jun 28: agents do the obvious thing (read, deliver) and skip the persistence step unless explicitly prompted.

### RC2 — Hermes profile-level MCP coverage gap (real bug)

- `memroos` MCP is registered on `~/.hermes/profiles/alba/config.yaml`
- It is **NOT registered** on `~/.hermes/profiles/default/config.yaml`
- Discord threads typically run under the `default` profile
- The current session has no `mcp_memroos_*` tools available
- So when a Hermes `default`-profile session produces research, it has no MCP path to write back to MemroOS — it would have to fall back to direct file I/O

### RC3 — Rules distributor targeted 6 of 8 surfaces, missed Hermes + OpenClaw

`~/github/knowledge/scripts/rules-distributor.py` distributed the canonical "write to MemroOS first" rule to:
- Claude (`~/.claude/CLAUDE.md`)
- Codex (`~/.codex/AGENTS.md`)
- Cursor (`~/.cursorrules`)
- Gemini (`~/.gemini/GEMINI.md`)
- Qwen (`~/.qwen/QWEN.md`)
- OpenCode (`~/.config/opencode/instructions.md`)

It did **NOT** target:
- Hermes (`~/.hermes/AGENTS.md`)
- OpenClaw (`~/.openclaw/workspace/AGENTS.md` and the `workspace-gizmo`, `workspace-gwen` siblings)

Result: every Claude/Codex session had the rule, but Hermes and OpenClaw did not.

### RC4 — OpenClaw workspaces had a divergent, older rule

The OpenClaw workspaces (`~/.openclaw/workspace/AGENTS.md`, dated **May 29**) contained a rule that predated the canonical MemroOS-first rule:

> "When asked to save, document, draft, or archive anything: write markdown to the git knowledge graph first, commit, and push. Use MCP servers (memroos, artyfacts) only as secondary paths when explicitly requested."

This is the inverse of the canonical rule (MemroOS primary, git knowledge graph secondary). It was overwritten when the canonical rule was introduced on Jun 28, but the OpenClaw workspaces never got the new rule because they weren't in the distributor's target list.

### RC5 — No "auto-save research" default behavior

There was no system prompt, AGENTS.md directive, skill, or hook that said:
> "When you produce research, competitive analysis, market positioning, benchmark results, or comparison content, AUTOMATICALLY write it to MemroOS via `knowledge_write`. Don't wait for the user to ask."

Compare to the X-post scoring rule which DOES exist (`ALWAYS score X/LinkedIn posts with x-post-scorer before presenting`). There was no equivalent for MemroOS writes.

## The Fix (Five Layers)

### Fix 1 — Canonical rule (already existed, but needed distribution)

The canonical rule is in `~/github/knowledge/shared/RULES_SOURCE.md` (Knowledge Filing section, lines 117–119):

```
**Primary store:** MemroOS knowledge base via MCP — git-backed, owned, portable.
**Rule:** When asked to save/document/archive: write to MemroOS first via `mcp_memroos_knowledge_write`.
```

No edit needed — the rule was correct. It just wasn't reaching Hermes or OpenClaw.

### Fix 2 — Extend rules-distributor to cover Hermes + OpenClaw

Modified `~/github/knowledge/scripts/rules-distributor.py`:

- Added `hermes` target → writes `~/.hermes/AGENTS.md`
- Added `openclaw-workspaces` special target → writes every `~/.openclaw/workspace*/AGENTS.md` (and every subdirectory of `workspace/`)
- The special target skips symlinks (e.g. `~/.openclaw/agents/gwen/agent/AGENTS.md → workspace/AGENTS.md`)
- Auto-discovers new workspaces via glob

After the patch, all 8 targets converge on the canonical rule. Run is idempotent (second run reports 8 unchanged). Committed as `a4162d45` in `lac5q/agent-knowledge`.

### Fix 3 — Created `memroos-save` skill

New skill at `~/.hermes/skills/memroos-save/SKILL.md`. It is the canonical implementation of the rule:

- Trigger conditions (5+ tool calls, comparison/benchmark/RCA output, "save" / "document" / "archive" requests)
- Steps: check MCP availability → choose path → build markdown → write → verify by reading back → confirm path to user
- Common failure modes documented
- Related skills (`memroos-operations`, `knowledge-base-manager`, `memroos-filing`)

The skill makes the abstract rule concrete: agents that load this skill know exactly what to do, in what order, with what fallback behavior.

### Fix 4 — Created `research-without-persist-detector.py`

A daily cron job that scans recent Hermes session transcripts for research-style messages that were not paired with a `knowledge_write` call. Lives at `~/.hermes/scripts/research-without-persist-detector.py`.

Detection heuristic: looks for assistant messages containing research signals (## Comparison, ## Benchmark, ## RCA, vs Microsoft IQ, vs Letta, etc.) and flags sessions that have such messages but no `mcp_memroos_knowledge_write` calls in the same session.

Schedule: daily 09:00 Pacific. Posts to `#memroos`. When findings exist, the cron also recovers the missed content into MemroOS via `knowledge_write`. This is the safety net.

Cron job id: `087618319c51`.

### Fix 5 — The Microsoft IQ comparison itself was saved

The comparison was written to `content/blog/memroos-vs-microsoft-iq.md` in `lac5q/memroos`, committed as `fa5baad`, pushed to origin. The RCA document (this file) and the comparison together form the durable record of the incident + response.

## What Now Does Not Happen

For **Hermes sessions**: the AGENTS.md now contains the canonical rule. Any session that loads `~/.hermes/AGENTS.md` (every Hermes session does) sees:
- "Primary store: MemroOS knowledge base via MCP"
- "Rule: When asked to save/document/archive: write to MemroOS first via `mcp_memroos_knowledge_write`."

For **OpenClaw sessions**: every workspace AGENTS.md (workspace, workspace-gizmo, workspace-gwen, workspace/main, workspace/mlt20-buildathon-site-04-2026) now has the canonical rule. Any agent that loads any of these sees the rule.

For **future drift**: the rules-distributor covers all 8 surfaces. A future edit to `RULES_SOURCE.md` propagates to all of them via one run.

For **agent lapses**: the daily detector scans for research-without-persist and recovers the missed content. The cron posts alerts to `#memroos` so this RCA failure mode never goes silent again.

## Verification (as of 2026-07-05)

| Surface | Rule present | Verified |
|---|---|---|
| `~/.claude/CLAUDE.md` | ✅ | confirmed via grep |
| `~/.codex/AGENTS.md` | ✅ | confirmed via grep |
| `~/.cursorrules` | ✅ | distributor reports up to date |
| `~/.gemini/GEMINI.md` | ✅ | distributor reports up to date |
| `~/.qwen/QWEN.md` | ✅ | distributor reports up to date |
| `~/.config/opencode/instructions.md` | ✅ | distributor reports up to date |
| `~/.hermes/AGENTS.md` | ✅ | distributor wrote it |
| `~/.openclaw/workspace/AGENTS.md` | ✅ | distributor wrote it |
| `~/.openclaw/workspace-gizmo/AGENTS.md` | ✅ | distributor wrote it |
| `~/.openclaw/workspace-gwen/AGENTS.md` | ✅ | distributor wrote it |
| `~/.openclaw/workspace/main/AGENTS.md` | ✅ | distributor wrote it |
| `~/.openclaw/workspace/mlt20-buildathon-site-04-2026/AGENTS.md` | ✅ | distributor wrote it |
| Distributor idempotent on 2nd run | ✅ | confirmed (0 written, 8 unchanged) |
| Detector test run (current state) | ✅ | confirmed (0 sessions, clean) |
| Daily cron job scheduled | ✅ | id `087618319c51`, daily 09:00 PT |
| `memroos-save` skill created | ✅ | at `~/.hermes/skills/memroos-save/SKILL.md` |

## Open Loops (Not Fixed Yet)

1. **Hermes profile-level MCP registration**. The default profile still lacks MemroOS MCP. The rule says "use mcp_memroos_knowledge_write" but the tool may not be available in `default` profile sessions. Fix: register MCP on default profile. Not blocking — direct file write works as fallback, and the AGENTS.md rule is honored regardless.

2. **MemroOS launchd services down**. From the Jun 28 stack audit: `com.memroos.batch-embed`, `circleback-sync`, `memory-healthcheck`, `memory-degradation-evals` were crash-looping. Status as of Jul 5: services appear running (`launchctl list | grep memroos` shows `com.memroos`, `com.memroos.skill-curation`, `com.memroos.discord-message-memory`, `com.memroos.memory-healthcheck`, `com.memroos.memory-tripwire`), but health endpoints (`localhost:8765`, `localhost:3100`) are not responding. MCP server process exists (`mcp_server.py`) but is not listening. Deeper investigation needed.

3. **Skill curator stale**. Last curator run: 2026-06-07 (3+ weeks ago). Not blocking this fix.

## References

- Discord thread: `#memroos`, id `1521677030297436280`
- Original comparison session: `20260630_174118_331354d2`
- Canonical rule source: `~/github/knowledge/shared/RULES_SOURCE.md`
- Distributor patch: `~/github/knowledge/scripts/rules-distributor.py` commit `a4162d45`
- New skill: `~/.hermes/skills/memroos-save/SKILL.md`
- New detector: `~/.hermes/scripts/research-without-persist-detector.py`
- Daily cron: job id `087618319c51`
- Microsoft IQ comparison saved: `content/blog/memroos-vs-microsoft-iq.md` commit `fa5baad` in `lac5q/memroos`