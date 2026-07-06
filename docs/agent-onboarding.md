# MemroOS Agent Onboarding Architecture

## One source of truth

```
lac5q/memroos (the repo, the package, the only place this stuff lives)
│
├── agents/AGENTS_TEMPLATE.md             ← canonical rule (every agent reads this)
├── .agents/skills/memroos-save/SKILL.md  ← canonical skill (every agent loads this)
├── scripts/memroos-mcp.sh                ← MemroOS MCP server launcher
├── scripts/install-agent-integrations.sh ← the ONE install path
├── scripts/verify-agent-integrations.sh  ← smoke-test for the install
├── scripts/research-without-persist-detector.py  ← safety net cron (daily)
├── scripts/rules-integrity-check.py      ← safety net cron (every 6h)
└── scripts/source-drift-detector.py      ← safety net cron (weekly Mon)
```

## How a new install works

1. User runs `curl -fsSL https://raw.githubusercontent.com/lac5q/memroos/main/install.sh | bash`
2. `install.sh` clones the repo to `$HOME/github/memroos` (or `$MEMROOS_INSTALL_DIR`)
3. `install.sh` calls `select_mode` (docker / demo / full)
4. `install.sh` calls `install_agent_integrations` (NEW)
5. `install_agent_integrations` runs `scripts/install-agent-integrations.sh`
6. The installer copies `agents/AGENTS_TEMPLATE.md` to every detected agent CLI's expected AGENTS.md path
7. The installer copies `.agents/skills/memroos-save/SKILL.md` to every detected agent CLI's skills directory
8. The installer registers the MemroOS MCP server in every detected agent CLI's config (YAML/TOML/JSON as appropriate)
9. The installer is idempotent — re-running re-converges any drift
10. `install.sh` runs `show_status` and shows next steps

## What changes when the rule evolves

When the canonical rule changes:

1. Edit `agents/AGENTS_TEMPLATE.md` in `lac5q/memroos`
2. Commit and push
3. Every machine that runs `scripts/install-agent-integrations.sh` picks up the change immediately
4. No per-machine editing required
5. The `rules-integrity-check` cron (every 6h) catches any drift that creeps in via manual edits

## How agents find MemroOS

| Agent CLI | Config file | MCP registration style |
|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | `mcp_servers:` block in `CLAUDE.md` |
| Codex | `~/.codex/AGENTS.md` + `~/.codex/config.toml` | `[mcp_servers.memroos]` block in `config.toml` |
| Cursor | `~/.cursorrules` + `~/.cursor/mcp.json` | `mcpServers` block in `mcp.json` |
| Gemini | `~/.gemini/GEMINI.md` | YAML in adjacent `mcp.yaml` |
| Qwen | `~/.qwen/QWEN.md` | YAML in adjacent `mcp.yaml` |
| ZCode | `~/.zcode/AGENTS.md` + `~/.zcode/cli/config.json` | `mcp.servers` block in `config.json` |
| OpenCode | `~/.config/opencode/instructions.md` | YAML in adjacent `mcp.yaml` |
| Hermes | `~/.hermes/AGENTS.md` + `~/.hermes/profiles/<name>/config.yaml` | `mcp_servers:` block in `config.yaml` |
| OpenClaw | `~/.openclaw/workspace*/AGENTS.md` | YAML in adjacent `mcp.yaml` |

When the installer runs, it writes to all of the above that exist on the machine.

## How to add a new agent CLI

1. Add a row to the `TARGETS` array in `scripts/install-agent-integrations.sh`
2. Format: `"name|<AGENTS.md-path>|<skills-dir>|<mcp-style>"` where `mcp-style` is `yaml`, `toml`, `json`, or a tool-specific style such as `zcode-json`
3. Run `bash scripts/verify-agent-integrations.sh` to confirm
4. Add a row to the table above
5. Commit and push

That's the entire integration.

## Why this design

The original failure (see `content/research/memroos-persist-failure-rca-2026-07-05.md`) was: agents had read-only access to MemroOS knowledge but never wrote to it. The canonical rule (use `mcp_memroos_knowledge_write` for research) lived in one place but the rules-distributor copied it to 8+ per-host files. When the rule changed, every per-host file had to be updated, and one was missed — so the rule drifted.

This new architecture has ONE source of truth (`agents/AGENTS_TEMPLATE.md`) and ONE install path (`scripts/install-agent-integrations.sh`). The installer is idempotent and re-runnable. Drift cannot happen because the canonical file is the *only* file the installer ever writes.

The safety-net crons (`research-without-persist-detector`, `rules-integrity-check`, `source-drift-detector`) catch failures of the primary path. But the primary path is now simple enough that it shouldn't fail.

## What this REPLACES

- `~/github/knowledge/scripts/rules-distributor.py` (DELETED — installer takes over)
- `~/github/agent-kitchen/` as a separate codebase (DEPRECATED — it's the same repo)
- Manual `write_file` of `AGENTS.md` on each agent CLI (DEPRECATED — installer does it)
- Bespoke per-machine knowledge-filing patches (DEPRECATED — no longer needed)

## What this DOES NOT REPLACE

- The MemroOS MCP server itself (`services/knowledge-mcp/`)
- The MemroOS MCP client integration with each agent CLI (handled by the agent CLIs themselves)
- The MemroOS web UI (separate product)
- The MemroOS Discord/community

## Testing

To regression-test the installer, run:

```bash
bash scripts/verify-agent-integrations.sh
```

To verify idempotency, run twice — second run should be a no-op:

```bash
bash scripts/install-agent-integrations.sh
bash scripts/install-agent-integrations.sh
```

To verify drift detection, modify one target file and re-run with `--check`:

```bash
echo "tampered" >> ~/.hermes/AGENTS.md
bash scripts/install-agent-integrations.sh --check  # should report drift
bash scripts/install-agent-integrations.sh         # should re-converge
```
