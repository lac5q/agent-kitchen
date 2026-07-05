---
title: "Context rot — LinkedIn/X post research (recovered)"
description: "Recovered research deliverable from session 20260414_053203_6ae6c5db — LinkedIn and X posts about context rot in Claude when MCP tool schemas consume 25-72% of context window. Originally missed the persist gate (no mcp_memroos_knowledge_write call); recovered by research-without-persist-detector cron on 2026-07-05."
publishedAt: "2026-07-05"
tags: [memroos, recovered, content, linkedin, context-rot, mcp, claude]
keywords: [context-rot, mcp, claude, token-economy, linkedin, x-post, post-mortem]
author: "Alba [bot]"
source_session: "20260414_053203_6ae6c5db"
model: "minimax-m3"
sources:
  - "https://github.com/lac5q/memroos/blob/main/content/research/memroos-persist-failure-rca-2026-07-05.md"
  - "https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview"
  - "https://modelcontextprotocol.io/introduction"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
  - "content/research/research-without-persist-backlog-2026-07-05.md"
regen_prompt: "Re-read the recovered session JSONL at ~/.hermes/sessions/20260414_053203_6ae6c5db.jsonl, extract the longest assistant message containing the LinkedIn/X post copy, and write this doc to memroos content/research/recovered-context-rot-posts-2026-07-05.md."
---

# Context rot — LinkedIn/X post research

**Recovered from session:** `20260414_053203_6ae6c5db` (2026-04-14)
**Original ask:** "can you write a linkedin and x post about how to manage context rot. CLIs Make kit sound a little alarming. Add a good image. Research latest and greatest thinking."
**Persist gate status:** ❌ Did NOT call `mcp_memroos_knowledge_write` — content lived only in the session transcript.
**Recovered by:** `research-without-persist-detector` cron, 2026-07-05.

---

## Deliverable text (verbatim from assistant message)

Now let me write the posts.

---

**LINKEDIN POST:**

Your AI is bleeding tokens. You just can't see it yet.

Every MCP server you connect to Claude — Gmail, Drive, Zapier, whatever — uploads its entire tool schema into the context window before you type a single word.

Not after. Before.

Here's what the data shows:

10–20 MCP servers can consume 25–72% of a 200k context window. That's 82,000 tokens gone. Just sitting there. Doing nothing.

Add Zapier MCP (8,000+ apps) on top of direct Google connectors? You're paying the context tax twice for the same capabilities. Claude doesn't deduplicate. It just burns.

This is context rot. It's invisible. It's expensive. And it's getting worse with every new server you add.

The fix is boring:

1. Audit your MCP integrations. All of them.
2. Remove duplicates — Zapier OR direct Google, not both.
3. Prune servers you added "just in case."
4. Measure actual tool usage. If you haven't called it in a week, cut it.

More connectors ≠ smarter AI. The data shows the opposite.

A lean setup with 3–4 focused servers outperforms a bloated one with 20. Every time.

Your context window is your most expensive resource. Stop treating it like it's free.

—

**X POST:**

Your AI is quietly burning 40% of its brain before you even say hello.

Every MCP server you connect dumps its entire tool schema into Claude's context window upfront.

10 servers = 82k tokens gone.
Zapier + Google = paying twice for the same tools.
Claude doesn't deduplicate. It just burns.

This is context rot.

It's invisible. It's expensive. And it's making your AI dumber.

The fix:

1. Audit every MCP server
2. Kill duplicates (Zapier OR direct Google, not both)
3. Prune "just in case" connectors
4. If you haven't called a tool in a week → cut it

More tools ≠ smarter AI.

Fewer tools, faster responses, better results.

Your context window is your most expensive resource. Stop treating it like it's free. 🧵

---

![LinkedIn visual — crushed AI chip under cable overload](https://v3b.fal.media/files/b/0a963868/sRIQewlmsUOPa-kZztMds_EaoV3AA8.png)

Want me to post these to your accounts, or tweak the tone first?

---

## Provenance

- Source session: `~/.hermes/sessions/20260414_053203_6ae6c5db.jsonl`
- 2 user messages, 4 assistant messages, 30 URLs cited
- LinkedIn post copy + X post copy + image prompt for "crushed AI chip under cable overload"
- Underlying technical claim ("10-20 MCP servers can consume 25-72% of a 200k context window") was sourced from contemporaneous Anthropic / MCP community discussion captured in the session's tool outputs (now compressed, not restorable from this doc alone — see `derived_from` for where to find related context-rot mitigation content at `~/github/knowledge/skills/beastmode/references/context-rot-mitigation.md`).

## Why this was missed

The original session did not include a `mcp_memroos_knowledge_write` call — the assistant treated the LinkedIn/X post as a chat deliverable rather than a durable artifact. The user's "Research latest and greatest thinking" instruction should have triggered the persist gate per `memroos-save` skill rules, but didn't.

This doc itself is the persist that was missing. Cross-reference `content/research/memroos-persist-failure-rca-2026-07-05.md` for the broader failure-mode analysis.
