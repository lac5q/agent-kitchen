<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **memroos** (17502 symbols, 32152 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/memroos/context` | Codebase overview, check index freshness |
| `gitnexus://repo/memroos/clusters` | All functional areas |
| `gitnexus://repo/memroos/processes` | All execution flows |
| `gitnexus://repo/memroos/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Agent Bootstrap Convention

At session start, every agent should call the skill catalog to load auto-loading skills:

```
knowledge_workspace_call("skill-packs", "catalog", {"filter": "auto-load"})
```

For each skill returned, inline its content into your working context by calling:

```
knowledge_workspace_call("skill-packs", "read", {"name": "<skill-name>"})
```

Skills with `auto-load: true` in their frontmatter are intended to be loaded
automatically. Skills without this field default to `auto-load: false` and are
available on demand via the `catalog` and `read` actions.

Private skills in `~/.memroos/skills/` are merged into catalog results and never
committed to the repo. They take precedence over public skills with the same name.

## Production deployment

Read `docs/production-deployment.md` before any deploy or onboarding task.

- **Operator production** is `https://memroos.epiloguecapital.com` on **Heroku** (`memroos-agent-onboarding`).
- **Marketing site** is `https://memroos.com` on **Vercel** — not the operator app.
- Never treat Vercel PR checks as operator production deploy.
- After deploy, run `bash scripts/verify-onboarding-deploy.sh`. Onboarding script with a bad token must return **403**, not **401**.
- Onboarding token signatures use `MEMROOS_ONBOARDING_SECRET` (or `MEMROOS_OPERATOR_API_KEY`). If invites fail with **Invalid onboarding token signature**, regenerate the invite after aligning Heroku config vars.

## Cursor Cloud Development

For Cursor Cloud environments on `lac5q/memroos`, commit `.cursor/environment.json` so
new environments run `bash scripts/setup-cursor-cloud.sh` automatically before each
agent session. This wires the MemRoOS MCP "main brain" without running the
Docker-oriented local installer. It installs the full GSD Cursor skill catalog
(`CURSOR_CLOUD_GSD_PROFILE=full` by default), MemRoOS cloud skills (`$qwen-cloud`,
`$beastmode-qwen-cloud`), and the Qwen executor lane unless disabled via
`CURSOR_CLOUD_INSTALL_GSD=0` or `CURSOR_CLOUD_INSTALL_QWEN=0`.

See `docs/cursor-cloud-development.md` for verification steps and environment knobs.

## Codex Cloud Development

For Codex Cloud environments on `lac5q/memroos`, use `bash scripts/setup-codex-cloud.sh`
as the environment setup script and `bash scripts/setup-codex-cloud.sh --maintenance`
as the maintenance script. This wires the MemRoOS MCP "main brain" without running
the Docker-oriented local installer. It also installs the GSD Codex skills with
the `standard` profile unless `CODEX_CLOUD_INSTALL_GSD=0` is set, and installs
the Qwen executor lane plus `$qwen-cloud` / `$beastmode-qwen-cloud` skills unless
`CODEX_CLOUD_INSTALL_QWEN=0` is set.

Do not use `./setup.sh` as the default cloud setup path. It is intended for local
or server installs and may require Docker, Qdrant validation, launchd jobs, or
service startup that cloud code tasks do not need.

If MCP tools are unavailable, continue with repo-local files and state clearly
that the main brain is not connected for that run. When MCP is available, load
auto-loading skills through `knowledge_workspace_call("skill-packs", "catalog", {"filter": "auto-load"})`.
Use `/skills`, `$gsd-help`, `$qwen-cloud`, or `$beastmode-qwen-cloud` to access
cloud workflows in Codex. Qwen is an external executor in cloud; do not claim it
is operational until `~/.local/bin/qwen-agent --dangerously-skip-permissions -p "Reply with exactly: QWEN OK"`
returns `QWEN OK`.
