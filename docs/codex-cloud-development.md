# Codex Cloud Development

This repo can run in Codex Cloud without starting the full local MemRoOS service stack. Use this path for `lac5q/memroos` cloud development when the goal is code work plus access to the MemRoOS MCP "main brain".

## Codex Environment Settings

In Codex settings for the cloud environment:

Setup script:

```bash
bash scripts/setup-codex-cloud.sh
```

Maintenance script:

```bash
bash scripts/setup-codex-cloud.sh --maintenance
```

Use the default universal image unless a task needs a pinned runtime. The bootstrap uses native `npm ci`, installs the lightweight knowledge MCP Python dependencies, installs the GSD Codex skill set, and installs a Qwen executor lane for Codex-led Beastmode work.

GSD is installed with the supported Codex installer:

```bash
npx --yes get-shit-done-cc@latest --codex --global --profile=standard --portable-hooks
```

The default profile is `standard` so cloud sessions get the main `/gsd` workflow skills without forcing the full 60+ skill catalog into every run. Override it only when needed:

```env
CODEX_CLOUD_GSD_PROFILE=full
```

Set `CODEX_CLOUD_INSTALL_GSD=0` to skip GSD installation for a minimal environment.

## Qwen And Beastmode

Codex Cloud cannot make Qwen the native Codex model for a task. The supported pattern is:

- Codex is the director/reviewer in the current session.
- Qwen runs as an external executor through `~/.local/bin/qwen-agent`.
- Codex reviews Qwen output, applies acceptable patches, and runs verification.

The setup script installs `@qwen-code/qwen-code` into `CODEX_HOME/qwen-node`, links `qwen` into `~/.local/bin`, and creates `~/.local/bin/qwen-agent`. It also copies these cloud skills into `CODEX_HOME/skills`:

- `$qwen-cloud`
- `$beastmode-qwen-cloud`

Codex skills are invoked with `$skill-name` or through `/skills`. Native custom slash prompts such as `/qwen` or `/beastmode` are not the reliable path in Codex Cloud.

Set these variables when the cloud agent should use the live Qwen worker:

```env
DASHSCOPE_API_KEY=<scoped-dashscope-standard-key>
QWEN_MODEL=qwen3.7-plus
```

`DASHSCOPE_API_KEY` must be available during the agent phase, not only setup, unless you intentionally pre-create `~/.qwen/settings.json` in the cloud environment. Use a narrowly scoped development key.

Optional install knobs:

```env
CODEX_CLOUD_INSTALL_QWEN=0
CODEX_CLOUD_QWEN_VERSION=latest
CODEX_CLOUD_QWEN_SMOKE=1
```

The live smoke check is intentionally opt-in. A cloud environment can have the Qwen lane installed without being authenticated. To prove live execution, run:

```bash
~/.local/bin/qwen-agent --dangerously-skip-permissions -p "Reply with exactly: QWEN OK"
```

Do not report the Qwen/Beastmode worker as operational until that smoke check returns `QWEN OK`.

## Main Brain Variables

Set these as Codex environment variables when the cloud agent should use the live development brain:

```env
MEMROOS_AGENT_ID=codex-cloud-dev
MEM0_URL=https://your-mem0-service.example.com
MEMROOS_APP_URL=https://your-memroos-app.example.com
MEMROOS_AGENT_API_KEY=<scoped-dev-agent-key>
```

`MEM0_URL` enables `memory_search` and `memory_save`. `MEMROOS_APP_URL` plus `MEMROOS_AGENT_API_KEY` enables audited agent-memory writes and agent-context messages through the MemRoOS app.

Codex Cloud secrets are available to setup scripts, then removed before the agent phase. If the MCP server needs `MEMROOS_AGENT_API_KEY` during the agent phase, use a narrowly scoped development agent key as an environment variable, not a broad personal/admin secret.

If those variables are omitted, the MCP still serves repo-local knowledge, tool discovery, and skill-pack catalog actions from the checked-out repository.

## What Not To Run In Cloud

Do not use `./setup.sh` as the Codex Cloud setup script. That script is for local or server installs and may validate Docker, Qdrant, launchd monitors, and local service startup.

For cloud code work, prefer:

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

Run Docker/Compose smoke checks only when the cloud environment explicitly supports Docker and the task requires it.

## Verification

After creating or changing the Codex environment:

1. Reset the Codex environment cache.
2. Start a small cloud task on `lac5q/memroos`.
3. Ask Codex to run `npm run typecheck` and inspect `/mcp` or the configured MCP list.
4. Ask it to call `knowledge_workspace_call("skill-packs", "catalog", {"filter": "auto-load"})` if MCP tools are available.
5. Ask it to open `/skills` or invoke `$gsd-help` to confirm the GSD Codex skills are present.
6. Ask it to invoke `$qwen-cloud` or `$beastmode-qwen-cloud`, then run the Qwen smoke check if `DASHSCOPE_API_KEY` is configured.

The setup is healthy when the repo dependencies install, the MemRoOS MCP starts, Codex skills are visible, and cloud tasks can run normal TypeScript/test commands without invoking the Docker-based local installer. The Qwen lane is only live-verified after the smoke check succeeds.
