<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **memroos** (17923 symbols, 40961 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

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

- **Operator production** is `https://memroos.epiloguecapital.com` on **oracle-1** (Cloudflare Tunnel `memroos-oracle` → `:3000`).
- **Marketing site** is `https://memroos.com` on **Vercel** — not the operator app.
- **Heroku** (`memroos-agent-onboarding`) is decommissioned as operator (`web=0`); do not treat it as the brain.
- Never treat Vercel PR checks as operator production deploy.
- After deploy, run `bash scripts/verify-onboarding-deploy.sh`. Onboarding script with a bad token must return **403**, not **401**.
- Onboarding token signatures use `MEMROOS_ONBOARDING_SECRET` (or `MEMROOS_OPERATOR_API_KEY`) on oracle-1 `/etc/memroos/web.env`. If invites fail with **Invalid onboarding token signature**, regenerate the invite after aligning that secret.

## Cursor Cloud Development

For Cursor Cloud environments on `lac5q/memroos`, commit `.cursor/environment.json` so
new environments run `bash scripts/setup-cursor-cloud.sh` automatically before each
agent session. This wires the MemRoOS MCP "main brain" without running the
Docker-oriented local installer. It installs the full GSD Cursor skill catalog
(`CURSOR_CLOUD_GSD_PROFILE=full` by default), MemRoOS cloud skills (`$goal`, `$qwen-cloud`,
`$beastmode-cloud`, `$beastmode-qwen-cloud`), the MiniMax API worker lane (when
`MINIMAX_API_KEY` is set), and the Qwen executor lane unless disabled via
`CURSOR_CLOUD_INSTALL_GSD=0` or `CURSOR_CLOUD_INSTALL_QWEN=0`.

For Beastmode / cheap-worker execution, prefer MiniMax-M3 first (`$beastmode-cloud`
with `MINIMAX_API_KEY`), then Droid MiniMax, then Qwen. Do not skip a live MiniMax
worker lane and do the implementation yourself as director-only.

See `docs/cursor-cloud-development.md` for verification steps and environment knobs.

## Codex Cloud Development

For Codex Cloud environments on `lac5q/memroos`, use `bash scripts/setup-codex-cloud.sh`
as the environment setup script and `bash scripts/setup-codex-cloud.sh --maintenance`
as the maintenance script. This wires the MemRoOS MCP "main brain" without running
the Docker-oriented local installer. It also installs the GSD Codex skills with
the `standard` profile unless `CODEX_CLOUD_INSTALL_GSD=0` is set, and installs
the Qwen executor lane plus `$goal` / `$qwen-cloud` / `$beastmode-cloud` / `$beastmode-qwen-cloud` skills unless
`CODEX_CLOUD_INSTALL_QWEN=0` is set.

Do not use `./setup.sh` as the default cloud setup path. It is intended for local
or server installs and may require Docker, Qdrant validation, launchd jobs, or
service startup that cloud code tasks do not need.

If MCP tools are unavailable, continue with repo-local files and state clearly
that the main brain is not connected for that run. When MCP is available, load
auto-loading skills through `knowledge_workspace_call("skill-packs", "catalog", {"filter": "auto-load"})`.
Use `/skills`, `$goal`, `$gsd-help`, `$beastmode-cloud`, `$qwen-cloud`, or `$beastmode-qwen-cloud` to access
cloud workflows in Codex. Prefer MiniMax-M3 as the Beastmode worker when
`MINIMAX_API_KEY` is live (`MINIMAX OK` smoke). Qwen remains a fallback external
executor; do not claim it is operational until
`~/.local/bin/qwen-agent --dangerously-skip-permissions -p "Reply with exactly: QWEN OK"`
returns `QWEN OK`.

## Cursor Cloud specific instructions

The primary dev target is the Next.js 16 app `apps/memroos` (operator console + API).
Standard commands are in the root `package.json`: `npm run dev` (port 3000),
`npm run lint`, `npm run typecheck`, `npm test -- --run`, `npm run build`.

- **Native binding gotcha (required for `npm test` and `npm run build`):** on Linux,
  npm's optional-dependency bug means `npm ci`/`npm install` alone can miss
  `@rolldown/binding-linux-x64-gnu`, `@tailwindcss/oxide-linux-x64-gnu`, and
  `@unrs/resolver-binding-linux-x64-gnu`. Without them, Vitest fails at startup with
  "Cannot find native binding". The startup update script installs them with
  `--no-save` (mirroring the `heroku-postbuild` step). If you re-run `npm ci` manually,
  reinstall those three packages afterward.
- **Auth / login:** the app degrades gracefully without downstream services, but login
  needs `apps/memroos/.env.local` with `MEMROOS_JWT_SECRET` plus `MEMROOS_ADMIN_EMAIL`
  and `MEMROOS_ADMIN_PASSWORD`. The admin is seeded on first startup only when the
  `users` table is empty (SQLite DB under `apps/memroos/data/`); to re-seed, delete that
  DB. `.env.local` is gitignored.
- **Degraded services are expected in cloud:** the header showing "N services degraded"
  (mem0, orchestration, Ollama, Neo4j, Qdrant, voice) is normal — those are optional and
  not run here. SQLite is embedded, so core console flows (auth, API keys, settings) work
  without them.
- `src/lib/__tests__/efficiency-telemetry.test.ts` was updated on 2026-07-07 to assert the
 current schema version rather than a stale hard-coded value.

## Test suite split (fast vs slow)

`npm test -- --run` is the milestone gate and intentionally excludes a small
set of tests tagged `slow`. Those cover the bcrypt cost-12 password hashing
in `src/lib/auth/__tests__/auth.test.ts` and the onboarding route suite at
`src/app/api/onboarding/__tests__/route.test.ts`, both of which can take a
second or more per case. Keeping them out of the default gate lets local
runs and CI stay deterministic; coverage is preserved by CI mirroring with
`npm run test:slow -- --run` after the fast step. To exercise the slow split
locally, run `npm run test:slow -- --run` from the repo root. The two
configs live at `apps/memroos/vitest.config.ts` (fast) and
`apps/memroos/vitest.slow.config.ts` (slow). When you add a new test that
takes more than a few hundred milliseconds, tag its `describe`/`it` with
`{ tags: ['slow'] }` and re-run both suites to confirm parity.
