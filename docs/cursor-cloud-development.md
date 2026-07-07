# Cursor Cloud Development

This repo can run in Cursor Cloud without starting the full local MemRoOS service stack. Use this path for `lac5q/memroos` cloud development when the goal is code work plus access to the MemRoOS MCP "main brain".

## Automatic Environment Setup

Commit `.cursor/environment.json` wires the install script so every new Cursor Cloud environment bootstraps skills and dependencies automatically:

```json
{
  "install": "bash scripts/setup-cursor-cloud.sh"
}
```

Cursor runs the `install` command before each agent session (idempotently). After the first successful run, Cursor caches the disk state so later agents start faster.

To re-run setup manually or refresh skills:

```bash
bash scripts/setup-cursor-cloud.sh
bash scripts/setup-cursor-cloud.sh --maintenance
```

## What Gets Installed

The bootstrap script installs:

1. **Node dependencies** — `npm ci`
2. **MemRoOS MCP Python deps** — lightweight `.venv` for the knowledge MCP
3. **GSD Cursor skills (full profile)** — all `/gsd` workflow skills under `~/.cursor/skills`
4. **MemRoOS cloud skills** — `$qwen-cloud` and `$beastmode-qwen-cloud` from `docs/codex-cloud/skills`
5. **Qwen executor lane** — `~/.local/bin/qwen-agent` for external executor work
6. **Agent integrations** (when `.agents/skills/memroos-save/SKILL.md` is present) — `install-agent-integrations.sh`

Knowledge-repo skills (`skills/<name>/SKILL.md` under `KNOWLEDGE_ROOT`) are served dynamically via the MemRoOS MCP `skill-packs` workspace — they do not need a separate file install.

## Install Knobs

Override defaults with environment variables on the Cursor Cloud environment:

```env
CURSOR_CLOUD_GSD_PROFILE=full          # default: full (all GSD skills)
CURSOR_CLOUD_INSTALL_GSD=0               # skip GSD
CURSOR_CLOUD_INSTALL_PROJECT_SKILLS=0    # skip qwen/beastmode skills
CURSOR_CLOUD_INSTALL_QWEN=0              # skip Qwen CLI
CURSOR_CLOUD_QWEN_SMOKE=1                # live Qwen smoke after install
DASHSCOPE_API_KEY=<scoped-key>           # required for live Qwen execution
```

Use `CURSOR_CLOUD_GSD_PROFILE=standard` only when you want a smaller GSD footprint.

## Main Brain Variables

Set these as Cursor Cloud environment variables when the agent should use the live development brain:

```env
MEMROOS_AGENT_ID=cursor-cloud-memroos
MEM0_URL=https://your-mem0-service.example.com
MEMROOS_APP_URL=https://your-memroos-app.example.com
MEMROOS_AGENT_API_KEY=<scoped-dev-agent-key>
MEMROOS_REQUIRE_SERVER_MEMORY=1
```

`MEM0_URL` enables `memory_search` and `memory_save`. `MEMROOS_APP_URL` plus `MEMROOS_AGENT_API_KEY` enables audited agent-memory writes and agent-context messages through the MemRoOS app.

## What Not To Run In Cloud

Do not use `./setup.sh` as the Cursor Cloud setup script. That script is for local or server installs and may validate Docker, Qdrant, launchd monitors, and local service startup.

For cloud code work, prefer:

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

## Verification

After creating or changing the Cursor Cloud environment:

1. Reset the environment cache (or start a fresh agent on a branch with `.cursor/environment.json`).
2. Start a small cloud task on `lac5q/memroos`.
3. Ask the agent to run `npm run typecheck` and inspect MCP tools.
4. Ask it to call `knowledge_workspace_call("skill-packs", "catalog", {"filter": "auto-load"})` if MCP tools are available.
5. Ask it to invoke `$gsd-help` to confirm GSD skills are present under `~/.cursor/skills`.
6. Ask it to invoke `$qwen-cloud` or `$beastmode-qwen-cloud`, then run the Qwen smoke check if `DASHSCOPE_API_KEY` is configured:

```bash
~/.local/bin/qwen-agent --dangerously-skip-permissions -p "Reply with exactly: QWEN OK"
```

The setup is healthy when dependencies install, the MemRoOS MCP starts, Cursor skills are visible, and cloud tasks can run normal TypeScript/test commands without invoking the Docker-based local installer.

## See Also

- [Codex Cloud Development](codex-cloud-development.md) — parallel setup for Codex Cloud (`scripts/setup-codex-cloud.sh`)
- [Skills](skills.md) — skill-packs catalog and auto-load guidance
- [Production deployment](production-deployment.md) — operator vs marketing deploy targets
