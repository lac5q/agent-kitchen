# Install Profiles

MemroOS supports multiple operating profiles so teams can start locally and grow into multi-machine or cloud deployments without rewriting code.

Profiles live in `config/operating-profiles.json` and are selected with `MEMROOS_A2A_PROFILE`.

**Related package options** (embeddings off / local Ollama / Voyage planned; Hermes dual-mode memory):
[`docs/package-options-embeddings-hermes-memory.md`](./package-options-embeddings-hermes-memory.md).

## Quick Profile Table

| Profile | Best for | Network | Auth expectation |
| --- | --- | --- | --- |
| `local-dev` | One developer laptop | `localhost` | Loopback writes allowed if no operator key is set |
| `single-host` | One server or VM | Host-local/private | Operator key required |
| `private-network` | Startup multi-machine default | Tailscale or LAN | Operator key required |
| `cloud-https` | Internet-reachable Memroos | HTTPS | Operator key required |
| `custom` | Non-standard topology | Operator-defined | Operator-defined |

## Recommended Startup Setup

Use `private-network` when agents run on different machines.

```env
MEMROOS_A2A_PROFILE=private-network
MEMROOS_PUBLIC_BASE_URL=http://memroos.tailnet:3000
MEMROOS_A2A_ENDPOINT_BASE_URL=http://memroos.tailnet:3000
MEMROOS_OPERATOR_API_KEY=<strong-random-secret>
```

Run:

```bash
./setup.sh --wizard
./setup.sh
```

## Local Development

Use `local-dev` when everything is on one machine.

```env
MEMROOS_A2A_PROFILE=local-dev
MEMROOS_PUBLIC_BASE_URL=http://localhost:3000
MEMROOS_A2A_ENDPOINT_BASE_URL=http://localhost:3000
```

Local loopback can register agents without `MEMROOS_OPERATOR_API_KEY`, but setting one is still safer and closer to production.

## Cloud HTTPS

Use `cloud-https` when Memroos is reachable from the public internet.

```env
MEMROOS_A2A_PROFILE=cloud-https
MEMROOS_PUBLIC_BASE_URL=https://memroos.example.com
MEMROOS_A2A_ENDPOINT_BASE_URL=https://memroos.example.com
MEMROOS_OPERATOR_API_KEY=<strong-random-secret>
```

Put Memroos behind a reverse proxy or tunnel that terminates HTTPS. Do not expose a cloud deployment without an operator key.

## Required Services

- Memroos Next.js app
- mem0 service
- Qdrant Cloud
- Neo4j
- LangGraph orchestration service
- Optional voice service
- Optional knowledge MCP service

For cloud-first operators, run MemroOS natively or in Compose and point it at managed services. Docker is the recommended public installation path, but it is not required for operators who already supervise Node/Python services directly.

For public repo users who want a local container install, use the Docker installer:

```bash
curl -fsSL https://raw.githubusercontent.com/lac5q/memroos/main/install.sh | bash -s -- --docker
```

That path starts `docker-compose.demo.yml`, which builds the MemroOS app container plus local demo memory/orchestration services and a local Ollama container without host Node or Python. The first demo boot pulls `qwen2.5:3b` and `nomic-embed-text`, so allow a few minutes for image/model downloads. For production-style Compose, use `MEMROOS_COMPOSE_FILE=docker-compose.yml` and provide the required environment values before running the installer. Qdrant remains configured through environment variables.

## Environment Validation

```bash
npm run profiles:check
npm run first-run:check
```

`setup.sh` validates required tools, copies `.env.example` when needed, validates the selected profile, checks Qdrant unless `SKIP_QDRANT_CHECK=1`, and installs the memory-service Python requirements into `.venv`. Set `START_SERVICES=0` for cloud-first/no-Docker setup, or start the Docker profile explicitly when testing the public repo locally. Set `INSTALL_MEMORY_SERVICE_DEPS=0` only when you intentionally manage that virtualenv yourself.

On macOS, setup installs launchd-backed Memory Resilience jobs unless `INSTALL_MEMORY_RESILIENCE=0` is set:

- `com.memroos.memory-healthcheck` runs every 5 minutes and alerts when memory infrastructure degrades, including when recent knowledge artifacts exist on disk but are missing from QMD.
- `com.memroos.memory-degradation-evals` runs daily at 9:15 AM and verifies the degradation scenarios stay covered by tests.
- `com.memroos.graph-catchup` runs every 30 minutes and triggers incremental Neo4j projection (`POST /api/memory-lifecycle/graph-catchup`) when the MemRoOS app is up. The in-app scheduler also starts the same `graph-catchup` cron-health job on Node boot when Neo4j is configured.
- `wiki-digest` (in-app every 6 hours + `npm run wiki:digest:cron`) clusters recent memories into `llm-wiki/wiki/` for the authenticated `/wiki` reader. See `docs/wiki-surface.md`.

Manage them directly with:

```bash
npm run install:memory-resilience
node scripts/install-memory-resilience.mjs status
node scripts/install-memory-resilience.mjs uninstall
```

One-shot Qdrant→Neo4j catchup (ops / backfill) is separate:

```bash
npm run graph:catchup
```

Verify scheduled catchup health via cron registry (`graph-catchup` job) or:

```bash
curl -s http://127.0.0.1:3000/api/memory-lifecycle/graph-catchup
curl -s http://127.0.0.1:3000/api/cron-health | jq '.jobs[] | select(.id=="graph-catchup")'
```

The healthcheck reads `services/memory/.env` when present. Configure `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` or `DISCORD_KNOWLEDGE_WEBHOOK` for remote notifications; otherwise macOS local notifications are used.

The app-owned `/api/health` route also reports the source-to-QMD contract as `Knowledge Index`, so the Memroos UI can show when files exist on disk but are not agent-searchable yet. Mem0 health is degraded when the runtime package, vector store, or queued-write path is unavailable; a live process alone is not treated as healthy.

Run the source-to-QMD contract check manually with:

```bash
npm run check:knowledge-indexing -- --days=2
```

The check covers recent Google Drive exports, meeting recordings, Spark notes, emails, Slack source files, project meetings, journals, and analysis content.

Memroos also supports client-specific recall contracts for "must not forget" memories. The public repo ships a synthetic example; private deployments should copy it to `evals/memory-recall/critical-anchors.local.json` or set `MEMROOS_RECALL_ANCHORS_PATH`.

```bash
npm run check:recall-anchors
npm run check:recall-anchors:live
```

Use `check:recall-anchors` for public/example verification and `check:recall-anchors:live` after a client has seeded real anchors into mem0. See `docs/client/recall-contracts.md`.

## Optional Progressive Capabilities

Memroos can also check bundled-but-optional capabilities during setup:

```env
MEMROOS_OPTIONAL_CAPABILITIES=gitnexus,agent-lightning
```

Supported v1 values are `gitnexus` and `agent-lightning`. These checks only warn; they do not make setup fail. GitNexus stays discoverable through `.mcp.json` as `mcp-server:gitnexus`, and Agent Lightning/APO is surfaced as `capability:agent-lightning` in the progressive tool catalog.

The setup check intentionally does not install GitNexus, run GitNexus reindexing, install APO cron jobs, or apply APO proposals. It only reports whether the local machine is ready to use the optional capability and gives actionable warnings when paths, scripts, registries, or logs are missing.

Keep generated GitNexus indexes and APO proposal bodies out of memory. Use memory only for compact preferences and outcome lessons, such as which capability helped for a task type.

### GitNexus Boundary

Keep GitNexus as its own MCP server:

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "gitnexus",
      "args": ["mcp"]
    }
  }
}
```

MemroOS reads that registration and advertises `mcp-server:gitnexus` through tool-attention. This keeps code graph indexing, stale-index checks, and repo intelligence in GitNexus while Memroos stays the progressive discovery and operator-control layer.

### Agent Lightning Boundary

Agent Lightning/APO remains a human-gated proposal workflow. Memroos surfaces it as `capability:agent-lightning`, reads proposal/log paths from the existing APO environment variables, and uses the existing worker command:

```bash
npm --prefix apps/memroos run apo:worker -- --executor qwen
```

Approving proposals and processing the approved queue remain explicit operator actions.

## Common Confusion: Registry Has Fewer Agents Than Expected

The `/agents` page shows canonical registry agents only. Older `agents.config.json` entries are legacy remote poll targets. To make those agents first-class in Memroos, register them through `/api/agents/register` or ingest their A2A card through `/api/a2a/agents/register`.
