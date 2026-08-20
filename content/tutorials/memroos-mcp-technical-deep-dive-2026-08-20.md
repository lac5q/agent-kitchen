---
name: memroos-mcp-technical-deep-dive
title: MemroOS MCP on maeve-u1 - Technical Deep Dive
description: NotebookLM-ready engineering tutorial covering the MemroOS MCP launcher, CLI integration installer, Pi wiring, transports, tools, persistence, audit, skills, and verified maeve-u1 state.
publishedAt: 2026-08-20
tags: [memroos, mcp, notebooklm, agent-integration, maeve-u1, technical-tutorial]
keywords: [MemroOS, MCP, FastMCP, stdio, Streamable HTTP, KnowledgeStore, knowledge_write, Pi, agent skills, audit, Git]
author: Pi
source_session: 01a01daf-2798-7d20-b230-5833ebd792d6
model: gpt-5.6-luna
sources:
  - https://github.com/lac5q/memroos
  - https://github.com/lac5q/memroos/blob/main/docs/integrations/mcp.md
  - https://github.com/lac5q/memroos/blob/main/scripts/install-agent-integrations.sh
  - https://github.com/lac5q/memroos/blob/main/scripts/memroos-mcp.sh
  - https://github.com/lac5q/memroos/blob/main/services/knowledge-mcp/knowledge_system/mcp_server.py
  - https://github.com/lac5q/memroos/blob/main/services/knowledge-mcp/knowledge_system/store.py
  - https://modelcontextprotocol.io/
  - https://notebooklm.google.com/
derived_from: []
regen_prompt: Refresh this tutorial from the current MemroOS MCP integration guide, installer, launcher, server, store, skill files, and a fresh maeve-u1 installer/check/handshake/health verification; preserve the distinction between source-code behavior, observed host state, and interpretation.
sensitivity: internal
authoritative: true
verified_at: 2026-08-20
---

# MemroOS MCP on `maeve-u1`

## Purpose

This durable brief is the source-backed companion to the full NotebookLM upload artifact at `/home/lac5q/memroos-notebooklm/memroos-mcp-technical-deep-dive.md`. It explains MemroOS to an engineer who needs to understand the MCP boundary, local installation, transports, persistence, governance, and evidence limits.

## Executive model

MemroOS is a company-owned memory and governance layer around agent runtimes. It is not an LLM and is not an agent CLI. It gives different harnesses a common context and proof layer for Markdown knowledge, durable memory, agent context, tool discovery, governed writes, audit, and Git lineage.

Three commands must be kept separate:

1. `scripts/install-agent-integrations.sh` wires MemroOS into detected agent CLIs. It copies canonical agent instructions and the `memroos-save` skill, optionally fans out extra skills, and upserts MCP entries into real client configuration files. It is idempotent. `--check` audits drift; `--local` forces the local launcher.
2. `scripts/memroos-mcp.sh` is the MCP server launcher. An MCP client starts it. It resolves `MEMROOS_ROOT`, scrubs inherited Python path variables, loads an optional scoped agent key, optionally enforces the strict server-memory gate, selects Python 3.10+, verifies FastMCP/HTTPX/PyYAML, refreshes dependencies when needed, and launches the Python server. Stdout is reserved for MCP JSON-RPC; diagnostics go to stderr.
3. `bin/memroos` is the operator/deployment CLI for launch, stop, restart, status, logs, update, redeploy, snapshots, restore, rollback, and diagnostics. It is not the MCP registration command.

The local path is:

```text
Pi or another agent CLI
  -> MCP config entry named memroos
  -> /bin/bash -lc exec .../scripts/memroos-mcp.sh
  -> FastMCP server in services/knowledge-mcp/knowledge_system/mcp_server.py
  -> KnowledgeStore and optional Mem0/operator/graph/connector services
```

## Installation verified on `maeve-u1`

The checkout is `/home/lac5q/github/memroos` and `hostname` is `maeve-u1`. The commands used were:

```bash
cd /home/lac5q/github/memroos
bash scripts/install-agent-integrations.sh --local
bash scripts/install-agent-integrations.sh --check
bash scripts/verify-agent-integrations.sh
```

Pi reads `/home/lac5q/.config/mcp/mcp.json`, which contains this local stdio registration:

```json
{
  "mcpServers": {
    "memroos": {
      "command": "/bin/bash",
      "args": ["-lc", "exec \"${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh\""],
      "connectTimeout": 30,
      "timeout": 60000
    }
  }
}
```

Pi has these relevant skills:

```text
/home/lac5q/.pi/agent/skills/memroos-recall/SKILL.md
/home/lac5q/.pi/agent/skills/memroos-save/SKILL.md
/home/lac5q/.pi/agent/skills/no-ai-slop/SKILL.md
/home/lac5q/.pi/agent/skills/ponytail/SKILL.md
```

The installer audit passes for all detected targets. The integration verifier passes; its only warning is the optional unbuilt `services/knowledge-mcp/dist/cli.js` smoke target. A direct stdio MCP `initialize` handshake independently succeeded, proving that the launcher, Python environment, FastMCP import, and protocol negotiation work. The local environment contains Python 3.11.15, FastMCP 2.14.7, HTTPX 0.28.1, and PyYAML 6.0.3.

The current MCP session reports 34 tools. `knowledge_health` reports the active root as `/home/lac5q/github/memroos` with 1,078 known files, no generated wiki, and `mem0: unavailable`. This means the MCP server and file-backed Markdown path are healthy while the optional Mem0 tier was not healthy at the snapshot.

SSH authentication from `maeve-u1` to `main-mac` was unavailable during setup, so no unknown private skills were copied from that machine. Only repository-backed and already-known local skills were installed.

## Transport modes

Default local stdio:

```bash
scripts/memroos-mcp.sh --stdio
```

Remote Streamable HTTP:

```bash
npm run mcp:http
# equivalent to scripts/memroos-mcp.sh --http --host 0.0.0.0 --port 8765
```

The default HTTP path is `/mcp`. Use Tailscale/private LAN, firewall rules, and an authentication boundary. Do not expose an unauthenticated MCP endpoint publicly. Legacy SSE remains available with `--sse`.

`MEMROOS_REQUIRE_SERVER_MEMORY=1` activates a pre-start gate that requires an agent identity and scoped key, authenticates to the app, checks agent-context access and `/api/memory/health`, retries transient failures, and exits before MCP if the required server-backed memory contract cannot be proven.

If `MEMROOS_OPERATOR_URL` or `MEMROOS_APP_URL` is set and `--local` is not passed, the installer can register `scripts/memroos-operator-stub.sh`. The stub proxies line-oriented JSON-RPC to the operator route, propagates an optional bearer key, and fails closed if the operator is unreachable. It does not clone a corpus as a fallback.

## MCP server and progressive capabilities

`mcp_server.py` builds a FastMCP server named `knowledge-system`; `memroos` is the client registration name. The internal `_mcp_tool` registry drives both FastMCP registration and the machine-readable contract `memroos-mcp-tools.v1`, available through `mcp_tool_contract` and `mcp://tools/contract`.

The core manifest recommends:

- `knowledge_health` — non-secret root, file count, wiki, and Mem0 status;
- `knowledge_manifest` — Markdown inventory;
- `knowledge_search` — literal source/wiki search;
- `knowledge_read` — safe repo-relative read with traversal protection and role-aware access;
- `memory_recall` — unified recall across knowledge, meeting collections, connectors, and memory adapters;
- `memory_search` — configured durable-memory adapter search;
- `memory_save` — configured durable-memory adapter write.

Deeper workspaces are opened progressively: `wiki`, `vector`, `agent-memory`, `admin`, `graph`, `dashboard`, `ingestion`, `workflows`, `skill-packs`, `integrations`, `primitives`, `tool-attention`, and `write`. The goal is context control, not hiding functionality.

## Governed write path

A `knowledge_write` call follows this shape:

```text
MCP knowledge_write
  -> resolve KNOWLEDGE_ROOT
  -> validate repo-relative path and frontmatter labels
  -> enforce admin-only and append-only rules
  -> in operator mode, post central audit before disk write
  -> write Markdown
  -> optionally stage and commit Git
  -> write local JSONL audit mirror
  -> return path, bytes, status, and commit SHA
```

`KnowledgeStore` treats Markdown as source material. It rejects traversal, applies tenant/user/role context, validates labels, protects selected administrative paths, and requires admin for deletion. Recognized sensitivity values are `public`, `internal`, `confidential`, and `restricted`.

The local audit mirror is `~/.memroos/audit/knowledge-writes.jsonl`. In operator mode, both app URL and agent API key must be present. Central audit is fail-closed: if the operator cannot record the operation, the file is not written. A Git commit, local audit line, and central audit row are separate proofs.

## Engineering interpretation

Follow the boundary:

```text
agent client
  -> MCP registration
  -> launcher
  -> transport
  -> FastMCP facade
  -> capability and policy layer
  -> knowledge or memory backend
  -> audit and Git proof
```

`knowledge_health: ok` proves that the configured knowledge root exists; it does not prove Mem0, graph memory, the operator API, or every connector is healthy. A successful MCP `initialize` proves process startup and protocol negotiation; it does not prove every optional backend is available.

## NotebookLM prompts

Use the full local artifact and ask:

- “Trace one `knowledge_write` call from an agent tool call to Markdown, central audit, local audit, and Git.”
- “Compare local stdio, Streamable HTTP, SSE, and operator-stub mode.”
- “Explain why `knowledge_health: ok` can coexist with `mem0: unavailable`.”
- “What does `memroos-mcp-tools.v1` guarantee?”
- “Which statements are source-code behavior, which are observed on `maeve-u1`, and which are interpretation?”
- “Quiz me one question at a time on the architecture and security model.”

Full upload-ready file:

```text
/home/lac5q/memroos-notebooklm/memroos-mcp-technical-deep-dive.md
```

## Primary source files

- `docs/integrations/mcp.md`
- `scripts/install-agent-integrations.sh`
- `scripts/memroos-mcp.sh`
- `scripts/memroos-operator-stub.sh`
- `services/knowledge-mcp/knowledge_system/mcp_server.py`
- `services/knowledge-mcp/knowledge_system/store.py`
- `services/knowledge-mcp/knowledge_system/capabilities.py`
- `.agents/skills/memroos-recall/SKILL.md`
- `.agents/skills/memroos-save/SKILL.md`
- `scripts/verify-agent-integrations.sh`
