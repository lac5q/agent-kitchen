# MemroOS Agent Directive Template
#
# This file is the SINGLE SOURCE OF TRUTH for what every agent should know
# about MemroOS. It is installed to every agent CLI's expected AGENTS.md
# location by `scripts/install-agent-integrations.sh` in the MemroOS repo.
#
# DO NOT edit the copy in your home directory. To change the canonical rule,
# edit THIS file in lac5q/memroos and re-run the installer. The installer
# is idempotent — running it again re-converges every target.
#
# Source: https://github.com/lac5q/memroos/blob/main/agents/AGENTS_TEMPLATE.md
# Installer: https://github.com/lac5q/memroos/blob/main/scripts/install-agent-integrations.sh

## MemroOS — Knowledge Store (PRIMARY)

All durable agent knowledge **must** be written to MemroOS via MCP. MemroOS is git-backed, owned, and portable. This is the canonical rule that applies to every agent in every context.

### Always Do

- **MUST use `mcp_memroos_knowledge_write`** when the user asks to save, file, document, archive, or store research, analysis, plans, reports, comparisons, benchmarks, RCAs, or any durable work product.
- **MUST use `mcp_memroos_knowledge_read`** to retrieve stored knowledge — never read `~/github/knowledge/` directly when the MCP is available.
- **MUST use `mcp_memroos_knowledge_search`** to discover what exists before writing duplicates.
- **MUST commit after writes** — MemroOS auto-commits, but verify with `mcp_memroos_knowledge_git_status` if unsure.
- **MUST include metadata in frontmatter** for any non-trivial artifact: `model`, `sources`, `derived_from`, `regen_prompt`. See the `memroos-save` skill for the schema.
- **MUST run the End-of-Task Persist Checklist** (below) before sending your final reply on any research/analysis task.

### Never Do

- NEVER skip `mcp_memroos_knowledge_write` for a comparison, RCA, benchmark, or research deliverable. Chat output is ephemeral; MemroOS is durable.
- NEVER leave durable work product only in session-scoped paths (`~/.hermes/hermes-agent/reports/`, `/tmp/`, Discord messages).
- NEVER write to `~/github/knowledge/` directly via `write_file` or shell when MemroOS MCP is available. Direct file I/O bypasses gatekeeper validation and audit logging.

### End-of-Task Persist Checklist (mandatory for research/analysis work)

Before sending your final reply to the user on any task that produced research, competitive analysis, market positioning, comparison content, benchmark results, or root-cause analysis:

1. **Did I produce research?** (look for `## Comparison`, `## Benchmark`, `## RCA`, `## Analysis`, `## Recommendations` sections, or external sources cited)
2. **Did I call `mcp_memroos_knowledge_write` for it?** If not → call it now.
3. **Did I read it back to verify?** If not → call `mcp_memroos_knowledge_read`.
4. **Did I tell the user the path?** If not → include the path in your final reply.

If `mcp_memroos_knowledge_write` is not in your tool list (MCP unavailable):
- Use the fallback: direct file write to `<MEMROOS_ROOT>/content/<topic-slug>.md` → `git add` → commit with author `Alba [bot] <alba@memroos.dev>` → `git push origin main`
- Tell the user you used the fallback path

The daily cron `research-without-persist-detector` scans for sessions that produced research without `knowledge_write` — but the cron is the safety net, not the primary path. Do the checklist at end-of-task every time.

### Correct Flow

```
Agent → memroos MCP (mcp_memroos_knowledge_write, mcp_memroos_knowledge_read)
              ↓
       Knowledge base (git-backed markdown at MEMROOS_ROOT/content/)
```

### Fallback Flow (when MCP unavailable)

```
Agent → write_file(path="MEMROOS_ROOT/content/<slug>.md")
              ↓
       git add && git commit && git push
              ↓
       Knowledge base (git-backed markdown, persisted via git)
```

### Why MCP-First?

- **Enforcement**: MemroOS validates paths, schema, and permissions
- **Auditability**: every read/write is logged with agent ID and timestamp to `~/.memroos/audit/knowledge-writes.jsonl`
- **Backend portability**: storage backend can change without touching agent code
- **Coordination**: many agents sharing one git repo need a gatekeeper to prevent clobbered writes
- **Governance**: MemroOS is the single source of truth for agent knowledge

## MemroOS vs Artyfacts

Artyfacts is a third-party filing-cabinet MCP server (28 tools, plugin name `artyfacts`, serverName `artyfacts`). It is **deprecated for knowledge storage** in this stack — MemroOS is primary.

When to use which:
- **Use MemroOS** for personal/team knowledge, code-adjacent research, anything you want git-backed and ownable.
- **Use Artyfacts** only for client deliverables that need sharing/regeneration primitives MemroOS doesn't yet expose (public share links, named-collaborator invites, per-section regeneration, source-drift detection).

Artyfacts trigger words (so you know what NOT to call): `save_document_as_artifact`, `start_section`, `update_section`, `share_artifact_with_user`. Artyfacts auth: WorkOS OAuth (one-time `/mcp` sign-in).

## MemroOS MCP Registration

The MemroOS MCP server is registered automatically by `scripts/install-agent-integrations.sh` from the MemroOS repo. Standard registration:

```yaml
mcp_servers:
  memroos:
    command: /bin/bash
    args:
      - -lc
      - exec "${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh"
    connect_timeout: 30
    timeout: 60
```

If `mcp_memroos_*` tools are missing from your tool list, run the installer:
```bash
bash "$HOME/github/memroos/scripts/install-agent-integrations.sh"
```

It is idempotent — running it again re-converges every target.

## MemroOS Skills

The `memroos-save` skill (canonical location: `lac5q/memroos/.agents/skills/memroos-save/SKILL.md`) is installed alongside this directive. Load it with:

- Claude Code / Cursor / OpenCode: auto-loaded on first save/document request
- Hermes / OpenClaw: explicit `skill_view(name="memroos-save")`
- Codex: load via `/skills`

## How To Update This Directive

1. Edit `agents/AGENTS_TEMPLATE.md` in `lac5q/memroos`
2. Commit and push to `lac5q/memroos main`
3. Re-run the installer on each machine: `bash $HOME/github/memroos/scripts/install-agent-integrations.sh`
4. Or wait — `scripts/install-agent-integrations.sh` is also callable from cron (`scripts/cron-reinstall-agent-integrations.sh` weekly) to auto-rollout.

The canonical rule will never go stale.

## Source

- Repo: https://github.com/lac5q/memroos
- Template: https://github.com/lac5q/memroos/blob/main/agents/AGENTS_TEMPLATE.md
- Installer: https://github.com/lac5q/memroos/blob/main/scripts/install-agent-integrations.sh
- RCA for the original failure mode this prevents: `content/research/memroos-persist-failure-rca-2026-07-05.md`