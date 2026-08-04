---
name: memroos-save
description: Persist durable agent work product to MemroOS MCP knowledge base with verification, metadata, and source-drift support. Use when producing research, competitive analysis, market positioning, comparison posts, benchmarks, RCA documents, or any "save/document/archive" request. Auto-validates the write succeeded.
version: 1.2.0
auto_load: true
source_repo: https://github.com/lac5q/memroos/blob/main/.agents/skills/memroos-save/SKILL.md
---

# Memroos Save — Durable Knowledge Persistence

## When to Use This Skill

Use this skill whenever any of these are true:
- The user asked you to "save," "document," "archive," "file," or "store" something
- You produced research, a competitive analysis, a benchmark, or a market-positioning doc
- You wrote a root-cause analysis (RCA) or post-mortem
- You generated a comparison table (X vs Y, A vs B, etc.)
- You produced content that took 5+ tool calls to assemble
- A previous turn delivered analysis as chat output and the user might want it durable

**Implicit triggers (the rule fires without explicit ask):**
- You produced a `## Comparison`, `## Benchmark`, `## RCA`, `## Analysis`, or `## Recommendations` section
- You cited external URLs or named sources in your output
- You derived findings from prior research (a follow-up to an existing artifact)

**The rule (canonical, in `agents/AGENTS_TEMPLATE.md` of the MemroOS repo):**

> When asked to save/document/archive, write to MemroOS first via `mcp_memroos_knowledge_write`.

This skill exists because agents used to read MemroOS extensively but skip the write step (a "research without persist" failure mode — see RCA in `content/research/memroos-persist-failure-rca-2026-07-05.md` in the MemroOS repo).

## Steps

1. **Sanity-check availability.** If `mcp_memroos_knowledge_write` is NOT in the current session's tool list:
   - Register MemroOS MCP on the current profile (run `bash $HOME/github/memroos/scripts/install-agent-integrations.sh`), OR
   - Fall back to direct write to `$MEMROOS_ROOT/content/<topic-slug>.md` + `git commit && git push`, then load the canonical rule + alert the user that the MCP path was bypassed.

2. **Choose the path.** Default: `content/<topic-slug>/<doc-slug>-YYYY-MM-DD.md`. Match any existing `content/<topic>/` directory if one already exists for the topic. Use lowercase-kebab-case for both the topic and doc slug.

3. **Build the markdown.** Include this frontmatter:
   ```yaml
   ---
   title: "..."
   description: "..."
   publishedAt: "YYYY-MM-DD"
   tags: [...]
   keywords: [...]
   author: "<agent-name>"
   source_session: "<session-id-if-known>"
   model: "<model-id>"  # e.g. "claude-opus-4-7", "gpt-5.1", "gemini-2.5-pro"
   sources:
     - "https://..."
     - "label:identifier"
   derived_from:
     - "<path-to-prior-artifact>"
   regen_prompt: "<prompt that could regenerate this doc>"
   ---
   ```

   These metadata fields close the Artyfacts gap — see "Metadata parity with Artyfacts" below.

4. **Write it.**
   ```python
   mcp_memroos_knowledge_write(
       path="content/<topic-slug>/<doc-slug>-YYYY-MM-DD.md",
       content=<full_markdown_with_frontmatter>,
       auto_commit=True,
       commit_message="<type>: <short title>"
   )
   ```

5. **Verify.** Read it back:
   ```python
   mcp_memroos_knowledge_read(path="content/<topic-slug>/...")
   ```
   Confirm the round-trip matched what you intended.

6. **Confirm to the user.** Quote the path back to the user so they can verify. Do NOT just say "saved" — give them the exact path.

## Metadata Parity With Artyfacts

The comparison doc at `content/research/memroos-vs-artyfacts.md` identified four gaps vs. Artyfacts. This skill requires metadata that closes three of them via frontmatter (the fourth — sharing primitives — is a future MemroOS feature):

| Artyfacts feature | MemroOS equivalent (this skill) |
|---|---|
| Model attribution per section | `model:` in frontmatter (per-document for now) |
| Sources / citations | `sources:` array in frontmatter |
| Regeneration prompt | `regen_prompt:` in frontmatter |
| Derived-from links | `derived_from:` array in frontmatter |
| Sharing / public links | Not yet — see Artyfacts gap roadmap |

When you write a doc, fill in what you can:
- `model` — the LLM you used. This is how future readers know who wrote it.
- `sources` — every URL you cited, every external doc you referenced, every Discord message you read. The detector at `$MEMROOS_ROOT/scripts/source-drift-detector.py` will warn if any of these go 404 or change substantially.
- `regen_prompt` — a single sentence describing how to regenerate the doc. Useful for "this comparison is now stale, can you refresh it?"
- `derived_from` — paths to prior artifacts this one builds on. Forms a derivation chain.

Don't fill these in for trivial one-liners. Do fill them in for research, comparisons, and RCAs.

## Common Failure Modes

- **"I forgot to call write."** This is the most common. Treat `mcp_memroos_knowledge_write` as a default — call it for any analysis longer than 3 paragraphs.
- **"MCP not in my tool list."** Different sessions load different MCP servers. Run `bash $HOME/github/memroos/scripts/install-agent-integrations.sh` to register MCP on the current profile.
- **"I wrote to Discord/Slack/chat only."** Chat is ephemeral. MemroOS is durable. They are not substitutes.
- **"The user didn't say 'save.'"** If the user asked for a comparison, RCA, benchmark, or research, the implicit ask is "and remember this." Always persist.
- **"I called write but didn't include metadata."** Even if the user doesn't ask for it, fill in `model`, `sources`, and `derived_from`. Future-you will thank present-you.

## Related Skills

- `memroos-operations` — general MemroOS platform operations
- `knowledge-base-manager` — broader KB management (umbrella)
- `memroos-filing` — canonical filing patterns

## Sources

- Thread #memroos Discord, July 5 2026: "Microsoft IQ vs MemroOS comparison never persisted to MemroOS"
- RCA: `content/research/memroos-persist-failure-rca-2026-07-05.md` (in MemroOS repo)
- Comparison: `content/research/memroos-vs-artyfacts.md` (in MemroOS repo)
- Hardening round 2: `content/research/memroos-hardening-july-2026.md` (in MemroOS repo)
- Canonical template: `agents/AGENTS_TEMPLATE.md` (in MemroOS repo)
- Installer: `scripts/install-agent-integrations.sh` (in MemroOS repo)
- Source drift detector: `$MEMROOS_ROOT/scripts/source-drift-detector.py`