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
4. **MemRoOS cloud skills** — `$goal`, `$beastmode-cloud`, `$qwen-cloud`, and `$beastmode-qwen-cloud` from `docs/codex-cloud/skills`
5. **MiniMax API worker lane** — preferred Beastmode worker when `MINIMAX_API_KEY` is set (`MiniMax-M3`)
6. **Qwen executor lane** — `~/.local/bin/qwen-agent` as MiniMax fallback
7. **Factory Droid CLI** — `~/.local/bin/droid` installed from npm without global npm permissions (Droid MiniMax fallback)
8. **Agent integrations** (when `.agents/skills/memroos-save/SKILL.md` is present) — `install-agent-integrations.sh`

Knowledge-repo skills (`skills/<name>/SKILL.md` under `KNOWLEDGE_ROOT`) are served dynamically via the MemRoOS MCP `skill-packs` workspace — they do not need a separate file install.

## Install Knobs

Override defaults with environment variables on the Cursor Cloud environment:

```env
CURSOR_CLOUD_GSD_PROFILE=full          # default: full (all GSD skills)
CURSOR_CLOUD_INSTALL_GSD=0               # skip GSD
CURSOR_CLOUD_INSTALL_PROJECT_SKILLS=0    # skip qwen/beastmode skills
CURSOR_CLOUD_INSTALL_QWEN=0              # skip Qwen CLI
CURSOR_CLOUD_QWEN_SMOKE=1                # live Qwen smoke after install
CURSOR_CLOUD_INSTALL_DROID=0             # skip Factory Droid CLI
CURSOR_CLOUD_DROID_VERSION=latest        # Droid npm version/spec to install
DASHSCOPE_API_KEY=<scoped-key>           # required for live Qwen execution
MINIMAX_API_KEY=<scoped-key>             # required for direct MiniMax API Beastmode workers
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
5. Ask it to invoke `$goal` to confirm the MemRoOS goal workflow is present.
6. Ask it to invoke `$gsd-help` to confirm GSD skills are present under `~/.cursor/skills`.
7. Ask it to invoke `$beastmode-cloud` for multi-model Beastmode support. Prefer the MiniMax API worker lane; use `$beastmode-qwen-cloud` only for the legacy Qwen-specific path.
8. Verify direct MiniMax API workers when `MINIMAX_API_KEY` is configured (preferred worker smoke):

```bash
curl -sS https://api.minimax.io/v1/chat/completions \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"MiniMax-M3","thinking":{"type":"disabled"},"messages":[{"role":"user","content":"Reply with exactly: MINIMAX OK"}],"max_completion_tokens":20,"temperature":0}'
```

9. Verify Droid and the Droid MiniMax lane when using Factory/Droid workers as MiniMax fallback:

```bash
~/.local/bin/droid --version
~/.local/bin/droid exec --model minimax-m3 "Reply with exactly: MINIMAX OK"
```

10. Run the Qwen smoke check if `DASHSCOPE_API_KEY` is configured (last-resort fallback):

```bash
~/.local/bin/qwen-agent --dangerously-skip-permissions -p "Reply with exactly: QWEN OK"
```

11. Run the fleet verifier on persistent remotes such as `maeve-u1` and `oracle-1` after maintenance:

```bash
npm run check:cursor-coding-env
```

The setup is healthy when dependencies install, the MemRoOS MCP starts, Cursor skills are visible, GitNexus is registered, Qwen/Droid CLIs are present, and cloud tasks can run normal TypeScript/test commands without invoking the Docker-based local installer.

## See Also

- [Codex Cloud Development](codex-cloud-development.md) — parallel setup for Codex Cloud (`scripts/setup-codex-cloud.sh`)
- [Skills](skills.md) — skill-packs catalog and auto-load guidance
- [Production deployment](production-deployment.md) — operator vs marketing deploy targets
