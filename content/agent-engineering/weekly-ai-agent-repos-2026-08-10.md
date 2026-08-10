---
name: "weekly-ai-agent-repos-2026-08-10"
title: "Weekly AI Agent Repos — August 10, 2026"
description: "A source-controlled snapshot of five GitHub repositories showing the agent stack moving toward coordination, harnesses, context, memory, and review."
publishedAt: "2026-08-10"
tags: [agent-engineering, github, harness-engineering, context-engineering, memory-engineering, code-review]
keywords: [agentic GitHub repos, agent control plane, agent harness, context mode, codebase memory, AI code review]
author: "Codex"
source_session: "019fed0f-0abd-7d42-9e14-265e67f21260"
model: "gpt-5.6-sol"
sources:
  - "https://github.com/paperclipai/paperclip"
  - "https://github.com/affaan-m/ECC"
  - "https://github.com/mksglu/context-mode"
  - "https://github.com/DeusData/codebase-memory-mcp"
  - "https://github.com/alibaba/open-code-review"
  - "https://github.com/trending?since=weekly&spoken_language_code=en"
  - "https://github.com/paperclipai/paperclip/commits/master.atom"
  - "https://github.com/affaan-m/ECC/commits/main.atom"
  - "https://github.com/mksglu/context-mode/commits/main.atom"
  - "https://github.com/DeusData/codebase-memory-mcp/commits/main.atom"
  - "https://github.com/alibaba/open-code-review/commits/main.atom"
derived_from:
  - "drafts/weekly-repos-2026-07-05.md"
  - "drafts/weekly-repos-2026-07-06.md"
  - "runs/active/2026-08-08-agent-coordination/article.md"
regen_prompt: "Re-check public GitHub pages and default-branch commit feeds for five agent-engineering repositories active during the target week, then produce a claim-controlled snapshot across coordination, harness, context, memory, and review."
---

# Research Snapshot

**Research date:** 2026-08-10

**Editorial thesis:** The agent is becoming the worker; the control plane around it is becoming the product. This is editorial synthesis, not a claim that the projects form one standard or are interoperable.

## Selection

The package selected five public repositories that explain a layer of an operable agent stack and showed default-branch activity during August 3–10, 2026. It is not a global GitHub ranking. Star counts were rounded from public GitHub page snapshots on August 10 and will age quickly.

## Findings

1. **Paperclip** — [paperclipai/paperclip](https://github.com/paperclipai/paperclip), approximately 76.3k stars in the snapshot. The README describes a Node.js server and React UI for coordinating AI agents around goals, budgets, governance, work tracking, and costs. Layer: coordination and governance. Editorial takeaway: make goals, ownership, budgets, and approvals first-class objects.

2. **ECC** — [affaan-m/ECC](https://github.com/affaan-m/ECC), approximately 239.2k stars. The README states a plan → test → implement → review → verify → remember → improve loop and documents skills, memory, hooks, security scanning, and adapters for multiple agent harnesses. Layer: reusable harness and engineering method. Editorial takeaway: put the review and memory loop in the system, not the operator's head.

3. **Context Mode** — [mksglu/context-mode](https://github.com/mksglu/context-mode), approximately 19.8k stars. It is an MCP server for sandboxing tool output before it reaches the model's context window. Its README gives a 315 KB → 5.4 KB example, described by the project as a 98% reduction, and also describes session memory and routing across platforms. Layer: context budgeting and session state. Editorial boundary: the reduction is the repository's own example, not an independently verified benchmark.

4. **Codebase Memory MCP** — [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp), approximately 38.4k stars. The README describes tree-sitter parsing across 158 languages, a persistent knowledge graph of functions, classes, call chains, routes, and cross-service links, 15 MCP tools, and a static binary. Layer: structural codebase memory. Editorial boundary: token reduction and latency claims remain repository claims.

5. **Open Code Review** — [alibaba/open-code-review](https://github.com/alibaba/open-code-review), approximately 19.9k stars. The README describes deterministic pipelines combined with an LLM agent, line-level comments, built-in checks for issues such as null pointers, thread safety, XSS, and SQL injection, and OpenAI/Anthropic compatibility. Layer: evaluation and review gates. Editorial takeaway: separate exact rule checks from model-assisted judgment and preserve both in the review record.

## Source and activity controls

Default-branch commit feeds checked:

- Paperclip: [master feed](https://github.com/paperclipai/paperclip/commits/master.atom)
- ECC: [main feed](https://github.com/affaan-m/ECC/commits/main.atom)
- Context Mode: [main feed](https://github.com/mksglu/context-mode/commits/main.atom)
- Codebase Memory MCP: [main feed](https://github.com/DeusData/codebase-memory-mcp/commits/main.atom)
- Open Code Review: [main feed](https://github.com/alibaba/open-code-review/commits/main.atom)

The public GitHub pages were used for current README descriptions and star snapshots. The article distinguishes repository claims from synthesis and should be rechecked immediately before a delayed launch.

## Derived recommendation

A small v0 should test one goal, one bounded agent, one explicit context policy, one structural map, one hybrid review gate, and one durable receipt showing what the agent saw, did, and handed off. Measure review work, not just output volume.
