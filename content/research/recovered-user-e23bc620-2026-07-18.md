---
title: "Recovered research — user (session 20260413_082305_e23bc620)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, user]
author: "Alba [bot]"
source_session: "20260413_082305_e23bc620"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260413_082305_e23bc620.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260413_082305_e23bc620.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — user

**Source session:** `20260413_082305_e23bc620`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 5000 characters of the largest assistant-side structured block recovered from the session transcript.

```
Here's the full article with the harness image woven in — ready to post:

---

**Stop Using Markdown for Agent Memory**

If your agent forgets everything when you switch frameworks, you didn't build memory.

You built a file attachment.

I've been thinking a lot about this lately.

A few weeks ago I had a bunch of smart people building AI agents. We were doing what everyone does — putting context in markdown files. `memory.md`. `AGENTS.md`. `skills.md`.

It felt clever.

It worked great for about a week.

Then we hit 100 files across a handful of agents. And I asked myself: what happens when this is 500 files? What happens next month?

The answer wasn't good.

---

Here's the thing nobody wants to admit:

**Markdown doesn't work as memory.**

It works for a few files. It kind of works for twenty. But at 50+ files across multiple agents? You're in trouble.

The agent has to load a bunch of files just to start working. Half the context window is gone before the agent even sees what the user asked.

So what does the agent do? It skims. It grabs the first files that look relevant. It misses the important one from two weeks ago. It makes mistakes that the context it didn't load would have prevented.

And then you blame the model.

But the model isn't the problem. Your memory architecture is.

---

![Your AI harness weighs five times more than it needs to](https://v3b.fal.media/files/b/0a961d55/FIvH5a7uWxAkRMq_0a09S_thmuJDWn.png)

*This is your agent with 100+ markdown files as "memory." The harness was built for someone else. It's too heavy. And it's crushing the thing it was supposed to help.*

---

Here's what we know from the research:

Stanford did a study called "Lost in the Middle." It proved that LLMs are really bad at finding important information buried in long text. Put the key fact early — great. Put it in the middle of 50 files — it might as well not exist.

There are these "needle in a haystack" tests. Even with huge context windows — 128K tokens — accuracy drops way past 30K. More context doesn't mean better answers. It means more stuff for the model to get confused by.

Production systems fail to find the right context 20 to 40 percent of the time. That's 1 in 3. Not sometimes. Often.

And here's the kicker: a file written on day one is treated the same as one written yesterday. No idea which is current. No recency. No decay. Just a folder of equally-weighted text files, some of which are just wrong now.

---

**A file system is not a memory system.**

---

So what do you actually build instead?

We call it **Agentic Harness Engineering**. It sounds fancy but it's simple: build the knowledge layer between the agent and its work. And build it so it works no matter what model, agent, or framework you're using.

Because the model will change. The framework will change. But the knowledge? That's the thing that compounds.

Here's what it looks like:

🔗 **A knowledge graph.** Not a document. A real graph you can query. It maps how everything connects. When an agent needs to change something, it checks what breaks before it touches anything.

🧠 **Semantic memory.** Not files with facts dumped in them. Vectors. The agent searches by meaning, not keywords. It doesn't search for "budget" — it searches for "why did that thing break" and gets the right answer.

📦 **A skill registry.** One place for procedural knowledge. When one agent learns something, every agent gets it. Regardless of what framework it runs on.

💬 **Session memory.** Every conversation stored and searchable. The agent remembers not because it loaded the right file, but because it's indexed.

📁 **A git repo.** Version controlled knowledge. Every agent clones it on startup. The repo is the brain. The agents are the hands. The harness? Just the wiring — thin, fast, replaceable.

---

**Four simple rules:**

1. **Be framework-agnostic.** The tool you use today won't be the tool you use in six months. Your knowledge shouldn't die when it changes.

2. **Let agents share.** One agent learns something, they all learn it. If your agents can't share knowledge, you don't have a team. You have isolated processes.

3. **Think long-term.** 100 files in a few days. What about 500? 1,000? You need structure, not files.

4. **Build it once.** If you do something twice, you failed the first time. Every task should become a skill or an automated job.

---

Here's what it looks like when it works:

One agent figures out a better way to do something. Saves it. The next agent picks it up automatically. Nobody told anyone. Nobody copied anything. The infrastructure just handled it.

That's the whole thing.

Not a folder of markdown files. A system.

The people who figure this out are going to have agents that actually get better over time. The ones who don't are going to have agents that just get slower.

The tools exist. The research is clear.

**You're either building a folder or building a system.**

Pick one.

---

Full article saved to `~/.hermes/scripts/age
```

## Why this was missed

The detector classifies this session as research-without-persist because:

1. The session produced structured markdown output (research, comparison, analysis, or recommendations)
2. The session cited external sources OR the user message asked to save/document/file
3. The session never called `mcp_memroos_knowledge_write`

This is a pre-ratchet-era finding — the ratchet fix (`--full` flag discipline +
last-run marker for incremental scans) was deployed after this session completed.
The current daily incremental scan is clean; these backlog entries reflect
sessions that completed before the persist gatekeeper was tightened.

## Recovery status

This is a backfill artifact. The original session content was preserved in
the Hermes session log at `~/.hermes/sessions/20260413_082305_e23bc620.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
