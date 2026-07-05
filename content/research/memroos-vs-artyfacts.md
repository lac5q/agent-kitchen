---
title: "MemroOS vs Artyfacts — How Each Handles Agent Knowledge Persistence"
description: "Side-by-side comparison of MemroOS (git-backed MCP knowledge base) and Artyfacts (filing-cabinet artifact model). Same problem class, different architecture, different outcomes for the 'research-without-persist' failure mode."
publishedAt: "2026-07-05"
tags: ["comparison", "memroos", "artyfacts", "agent-memory", "persistence", "mcp"]
keywords: ["memroos vs artyfacts", "agent knowledge persistence", "research without persist", "mcp knowledge write"]
author: "Alba [bot]"
---

# MemroOS vs Artyfacts

Both tools solve the same underlying problem: **agent-produced knowledge is lost in chat unless explicitly persisted.** Both expose MCP servers. Both rely on the agent to call the write tool. But they diverge sharply in architecture, UX, and what happens when the agent forgets to call them.

This document compares them so we can choose (or use both) deliberately. Written on July 5, 2026 — same day as the Microsoft-IQ persist-failure RCA, so the failure-mode angle is concrete.

## TL;DR

| Aspect | MemroOS | Artyfacts |
|---|---|---|
| Core model | Git-backed markdown KB at `~/github/knowledge/` | Filing cabinet of artifacts with typed sections |
| MCP tool count | 6 (read, search, write, list, history, delete) | 28 (envelope, sections, sharing, images, folders) |
| Required params on write | path + content + auto_commit | title + type + summary (body via separate `update_section` calls) |
| Storage location | Local git repo, pushable to remote | Remote service, accessed by API |
| Auth model | Local filesystem | WorkOS OAuth (one-time user sign-in via `/mcp`) |
| Failure if agent skips write | Knowledge never lands anywhere durable | Knowledge never lands anywhere durable |
| Anti-skip protection | Rules-distributor + AGENTS.md directive + daily regression cron + skill | Aggressive `description` field on `save_document_as_artifact` that auto-fires on save/document/draft keywords |
| Multi-agent concurrency | Single git repo, gatekeeper validates | Per-artifact sections, model attribution per section, edit history |
| Regeneration model | Manual (commit + push) | First-class `regenerate_section` with stored `prompt` and source-drift triggers |
| Cost model | Free (local git, you own) | Subscription (managed service) |
| Best for | Personal + team knowledge, code-adjacent research | Client deliverables, decks, documents meant to be shared |
| Status in Luis's stack | **Primary** | **Deprecated** for knowledge storage |

## How Each Handles "Research Without Persist"

This is the question that prompted the Microsoft IQ RCA. Each system has a different answer.

### MemroOS's answer (after July 5 fix)

Five-layer defense:

1. **Canonical rule in `RULES_SOURCE.md`**: "When asked to save/document/archive, write to MemroOS first via `mcp_memroos_knowledge_write`."
2. **Rules-distributor** copies the rule to 8 surfaces: Claude, Codex, Cursor, Gemini, Qwen, OpenCode, Hermes, every OpenClaw workspace. Idempotent. Run-once, converges.
3. **`~/.hermes/skills/memroos-save/SKILL.md`** skill — explicit trigger conditions, step-by-step write+verify round-trip, fallback chain documented.
4. **Daily cron (`research-without-persist-detector.py`, job `087618319c51`)** — scans last 24h of sessions for research-style messages without paired `knowledge_write` calls. Recovers the missed content automatically. Posts to `#memroos`.
5. **Profile-level MCP coverage gap noted** (default profile still missing MemroOS MCP — open loop).

Result: if a `default`-profile Hermes session produces research, the rules-distributor puts the canonical directive in front of it, the skill makes it concrete, and the daily cron catches any drift within 24h.

### Artyfacts's answer

Artyfacts is **opinionated and aggressive** at the tool-descriptor level. Its `save_document_as_artifact` tool carries a multi-sentence description that effectively self-triggers:

> "Use WHENEVER the user asks you to write up, document, draft, save, file, preserve, archive, summarize, store, capture, record, jot down, or produce a document, analysis, research finding, plan, spec, report, proposal, decision, review, or guide."

That's 20+ trigger words embedded in the tool schema itself. When the model sees the tool in its tool list, the description primes it to call the tool on any of those intents. This is a stronger pull than MemroOS's rule-in-AGENTS.md because the model reads tool descriptions every turn, but AGENTS.md is system-prompt-static.

Artyfacts also has a dedicated **SKILL.md** (`~/.claude/plugins/marketplaces/artyfacts/skills/artyfacts/SKILL.md`) that triggers on similar keywords. It's loaded automatically as a Claude plugin.

Artyfacts **does not have**:
- A equivalent of the rules-distributor (no multi-agent propagation layer visible)
- A regression cron (no scan of recent sessions)
- A fallback chain documented (WorkOS OAuth is a hard requirement — no MCP = no write)

Result: Artyfacts handles "agent forgets to save" by **making the tool description and skill impossible to miss**. If the model uses Artyfacts at all, it tends to save. But if Artyfacts is unavailable, there's no fallback — the work just doesn't persist anywhere.

## Architecture Differences

### MemroOS: Local git, one write call

```
Agent → mcp_memroos_knowledge_write(path, content, auto_commit=true)
         ↓
       Knowledge base (git-backed markdown at ~/github/knowledge/)
         ↓
       Auto-commit + push to remote (lac5q/agent-knowledge)
```

The whole API surface is six tools:
- `knowledge_read(path)` — get a doc
- `knowledge_search(query)` — full-text search
- `knowledge_write(path, content, auto_commit)` — write a doc (this is the persistence call)
- `knowledge_list(prefix)` — list docs in a directory
- `knowledge_history(path)` — git log for a doc
- `knowledge_delete(path)` — delete a doc

The path is part of the API: `content/blog/memroos-vs-microsoft-iq.md`. Reads and writes go to the same git repo. Conflict resolution is git's problem.

Pros:
- Cheap to call (one round-trip)
- Idempotent content addressing
- Git history is the audit log
- Push to remote = distribution + backup in one operation
- No auth, no network dependency, no rate limit

Cons:
- No rich document model (sections, attribution, regeneration triggers)
- Single git repo means single-writer contention (mitigated by gatekeeper)
- No sharing model (no public link, no per-doc permissions)
- No image handling (markdown only — images go in as URLs or base64)

### Artyfacts: Remote service, envelope + sections

```
Agent → save_document_as_artifact(title, type, summary, parent_id, tags, model)
         ↓
       Returns artifact_id
         ↓
Agent → start_section(heading) → update_section(artifact_id, section_id, body, sources, prompt)
         ↓
       For each heading in the document
```

The artifact model is richer:
- **Envelope**: title, type (16 types: document, spec, research, analysis, plan, design, proposal, review, decision, report, experiment, feature, guide, log, folder), summary, parent folder, tags, **model attribution** (the LLM that wrote it)
- **Sections**: each heading is its own object with body, sources (citations), prompt (regeneration recipe), trigger (manual / lazy_stale / source_drift), model attribution, edit history
- **First-class regeneration**: every section has a `prompt` field. The `regenerate_section` MCP tool re-runs the model against that prompt to refresh content. The `trigger` config accepts `lazy_stale` (regenerate on read if older than N seconds) and `source_drift` (regenerate when an upstream source emits a change notification).
- **Source drift detection**: `update_section` accepts a `sources` array of URLs and labels. Artyfacts surfaces "broken sources" and "source drift" warnings in the artifact ribbon.
- **Sharing**: 8 dedicated tools — `create_share_link`, `share_artifact_with_user`, `share_folder_with_user`, `list_team_members`, `list_artifact_access`, `update_collaborator_permission`, `remove_artifact_collaborator`, `set_artifact_visibility`.
- **Image handling**: `attach_image_from_url` (preferred) or `attach_image` (small base64 only — has a documented payload ceiling).

Pros:
- Rich document model with regeneration, attribution, and source-drift baked in
- Per-section edit history with model attribution
- Sharing and collaboration are first-class
- WorkOS auth gates access properly
- Type system forces thinking about what an artifact IS before saving

Cons:
- Many calls per document (envelope + N sections + images + sharing)
- WorkOS auth required — single point of failure
- Network dependency per call
- Subscription cost
- No offline mode (no local fallback documented)
- 28 tools means agents may not always pick the right one

## The "Save" Call Cost

This is the part that matters operationally.

| Operation | MemroOS | Artyfacts |
|---|---|---|
| Save a 10-section doc | 1 MCP call | 1 envelope + 10 start_section + 10 update_section = 21 calls |
| Round-trip latency | Local (ms) | Network (50–500 ms per call) |
| Network for 10-section doc | 0 calls | 21 calls × ~200 ms ≈ 4 seconds |
| Add 3 images | Inline markdown (base64 or URL) | 3 separate `attach_image_from_url` calls |
| Update one section | Re-call `knowledge_write` with full doc | `edit_section` (1 call, surgical) |
| Read back full doc | 1 call | 1 call with `include_bodies: true`, or N calls for N sections |
| Search | `knowledge_search` (local FTS) | `search_artifacts` (network) |

MemroOS is **dramatically cheaper per write**. Artyfacts is **dramatically richer per write**.

## When Each Wins

**MemroOS wins when:**
- You're writing a lot (every research dump, every RCA, every blog post)
- Cost / latency / offline matters
- You own your data (git = your data, your backup)
- The artifact is a markdown doc with no images (or inline images are fine)
- Many agents share the same KB and need git history as audit trail
- You need to version and diff

**Artyfacts wins when:**
- The artifact has a clear envelope (title, type, summary) and a defined audience
- You need to share with specific people, generate public links, control visibility
- Multiple people or agents will edit the same artifact over time and need per-section attribution
- You want sections to be **regenerable** — i.e. a section stored its prompt and sources, and someone can hit "regenerate" to refresh it
- Source drift matters (e.g. "this competitive analysis cites pricing pages; warn when those pages change")
- Cost is acceptable for the share/edit story

**Both lose the same way**: if the agent doesn't call them, nothing is saved. MemroOS has the rules-distributor + cron backstop; Artyfacts has the aggressive tool description. Both are still vulnerable to an agent that ignores all directives.

## Recommendation for This Stack

Keep MemroOS as primary. Keep Artyfacts available as the rich document tier when an artifact deserves it.

Concrete rule:

> **Default:** write to MemroOS via `mcp_memroos_knowledge_write`. One call, local, free, git-backed.
>
> **Escalate to Artyfacts when:**
> - The artifact will be shared externally (public link, named collaborators)
> - It needs per-section regeneration (e.g. weekly brief sourced from changing URLs)
> - It's a client deliverable (decks, proposals, decision memos)
> - It needs source-drift detection
>
> **Never use Artyfacts for:**
> - Personal knowledge that should stay local and portable
> - Code-adjacent research that lives near the repo
> - Anything you'd want to grep across with FTS

This matches the canonical directive already in `RULES_SOURCE.md` and the MemroOS AGENTS.md:

> **Primary store:** MemroOS knowledge base via MCP — git-backed, owned, portable.
> **Rule:** When asked to save/document/archive: write to MemroOS first via `mcp_memroos_knowledge_write`.
> **Artyfacts exception (research only):** Artyfacts may be used only when the user explicitly requests Artyfacts filing, or MemroOS MCP is confirmed down and the user approves temporary fallback.

## What Artyfacts Could Learn From MemroOS (and Vice Versa)

**Artyfacts could add:**
- A local-fallback mode (offline writes that sync when the network returns)
- A rules-distributor equivalent so multi-agent setups propagate usage rules
- A regression cron that scans agent transcripts for "should have saved but didn't"
- A bulk-write tool (one call → full document with sections, no envelope dance)

**MemroOS could add:**
- Section-level attribution (which model wrote which section of a long doc)
- Regeneration hooks (store the prompt alongside the section so a later agent can refresh)
- Source-drift detection (cite URLs and warn when they break)
- Sharing primitives (public links, named collaborators)

Both could co-exist in a tiered model: MemroOS as the personal/system-of-record layer (cheap, fast, owned), Artyfacts as the collaboration/sharing/regeneration layer (rich, slow, shared). Agents would write to MemroOS by default, escalate to Artyfacts when the document needs that story.

## Sources

- MemroOS MCP server source: `~/github/memroos/services/knowledge-mcp/knowledge_system/mcp_server.py`
- Artyfacts SKILL.md: `~/.claude/plugins/marketplaces/artyfacts/skills/artyfacts/SKILL.md`
- Artyfacts tool schemas: `~/.cursor/projects/Users-lcalderon-github-agent-kitchen/mcps/plugin-artyfacts-artyfacts/tools/`
- Artyfacts MCP server identity: `plugin-artyfacts-artyfacts`, serverName `artyfacts`, plugin version `0.1.0`
- Canonical rule: `~/github/knowledge/shared/RULES_SOURCE.md` lines 117–119
- RCA: `content/research/memroos-persist-failure-rca-2026-07-05.md` (same repo)
- Distributor: `~/github/knowledge/scripts/rules-distributor.py` commit `a4162d45`
- Microsoft IQ comparison (the actual lost artifact): `content/blog/memroos-vs-microsoft-iq.md` commit `fa5baad`