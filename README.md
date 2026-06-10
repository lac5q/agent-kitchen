# MemroOS

<p align="center">
  <strong>Shared memory and governed orchestration for agent workflows.</strong>
</p>

<p align="center">
  MemroOS retains what product, sales, and engineering agents learn, retrieves the right context at runtime, and gives operators one NOC-style surface for memory, orchestration, skills, dispatch, evals, and trust.
</p>

<p align="center">
  <a href="https://memroos.com">memroos.com</a> ·
  <a href="#launch-quickstart">Launch Quickstart</a> ·
  <a href="#who-this-is-for">Who This Is For</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#video-demo">Video Demo</a> ·
  <a href="#competitive-benchmark">Benchmark</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#security-model">Security</a> ·
  <a href="#docs">Docs</a>
</p>

<p align="center">
  <a href="https://github.com/lac5q/memroos/blob/main/LICENSE"><img alt="License: PolyForm Small Business 1.0.0" src="https://img.shields.io/badge/license-PolyForm%20Small%20Business-a8392c.svg"></a>
  <img alt="Release: v1.0.0-beta.2" src="https://img.shields.io/badge/release-v1.0.0--beta.2-a8392c.svg">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black.svg">
  <img alt="A2A ready" src="https://img.shields.io/badge/A2A-ready-7a2a1e.svg">
  <img alt="Local first" src="https://img.shields.io/badge/local--first-yes-4a4a45.svg">
  <img alt="Security" src="https://img.shields.io/badge/security-operator--gated-a8392c.svg">
  <img alt="Benchmark live beta: #1" src="https://img.shields.io/badge/live_beta-%231_agentic_memory-a8392c.svg">
</p>

---

## Launch Quickstart

**One command to get started:**

```bash
curl -fsSL https://raw.githubusercontent.com/lac5q/memroos/main/install.sh | bash
```

This detects your OS, checks prerequisites, clones MemroOS, and offers demo mode (no config needed) or full setup with guided wizard.

**Manual install:**

```bash
git clone https://github.com/lac5q/memroos.git
cd memroos
npm install
./setup.sh --demo        # local memory only, no cloud accounts
./setup.sh --wizard      # guided config for Qdrant Cloud + full setup
./setup.sh --status      # check running services
```

Then open `http://localhost:3000`, search retained memory, inspect Knowledge source health, register or dispatch an agent, and review the runtime context pack that gets assembled before work starts.

If you are evaluating the launch build, start with the v1.0.0-beta.2 release, watch the demo, then open a workflow feedback issue with the first place your agents lose context. Maintainers can process launch feedback with the [workflow feedback intake guide](docs/workflow-feedback-intake.md).

## What MemroOS Is

Most agent systems remember too little, too late. Product decisions live in docs. Sales context lives in calls and CRM notes. Engineering knowledge lives in commits, incidents, and terminal history. Every new agent starts by rediscovering the same context.

MemroOS is the operating layer that gives agents a memory and governance plane:

- **Retain:** capture decisions, files, conversations, outcomes, and workflow history.
- **Retrieve:** assemble permission-aware context packs before an agent starts work.
- **Orchestrate:** pause, inspect, edit, resume, retry, and roll back long-running agent work with audit lineage.
- **Operate:** see memory health, model utility, live agents, governance, savings, and waste in one console.
- **Dispatch:** chat with agents, run group-room standups, and send work to local, REST, or A2A agents with source-backed context.
- **Prove:** connect agent output to the memories consumed, sources used, tools run, checks passed, and residual risks.
- **Improve:** review, edit, approve, and promote repeated successful workflows into durable governed skills and playbooks.

The repository began as `memroos.dev`; some internal package names, paths, and environment variables still use `memroos` for compatibility. The public product and positioning are now MemroOS.

## Competitive Benchmark

MemroOS now has a public-evidence benchmark for enterprise agentic memory and a passing live recall gate for the local beta architecture.

Latest generated benchmark results as of June 8, 2026, using the May 24 public-evidence methodology:

| Rank | Provider | Score | Note |
| ---: | --- | ---: | --- |
| 1 | MemRoOS beta live | 84.06 | Governed multi-agent memory with hot-path recall, proof surfaces, and public evals. |
| 2 | MemRoOS prior baseline | 74.36 | Source-available memory/control plane with strong governance and workflow fit. |
| 3 | Letta | 70.58 | Strong stateful-agent memory platform. |
| 4 | Mem0 Platform | 70.44 | Strong memory engine baseline. |
| 5 | Zep | 68.64 | Strong temporal knowledge-graph memory. |
| 6 | Midbrain | 65.21 | Strongest retrieval-substrate competitor. SmartSearch multi-step entity expansion and continual-learning architecture. Score reflects public-evidence architecture scoring; Midbrain's SmartSearch retrieval metrics are third-party paper results (arXiv 2504.00553), not independently rerun here. |

The benchmark compares public architecture evidence, governance depth, multi-agent workflow fit, retrieval design, interop, and proof surfaces. It does not claim private latency or accuracy for closed products without API access. Midbrain's SmartSearch retrieval metrics are cited as external paper results pending a direct rerun — see the [comparative benchmark plan](evals/comparative-retrieval/README.md) for the retrieval lane methodology. See [the benchmark methodology and results](docs/marketplace/agentic-memory-benchmark-2026-05-24.md).

Live recall gate after beta hardening:

- Full suite: `8/8` cases passed.
- Pass rate: `1.0`.
- p95 recall latency: `469 ms`.
- Tier failures: none.

## Video Demo

<p align="center">
  <video src="docs/demo/memroos-demo.mp4" controls muted playsinline width="900"></video>
</p>

<p align="center">
  <a href="docs/demo/memroos-demo.mp4">Watch the MemroOS demo video</a>
</p>

## Screenshots

<p align="center">
  <img src="docs/screenshots/readme-landing.png" alt="MemroOS public landing page with shared agent memory, governed dispatch, and source-backed proof" width="900">
</p>

<p align="center">
  <em>The public landing page now leads with the shorter MemroOS story: shared agent memory, governed dispatch, and proof that shows what context moved the work forward.</em>
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/readme-memory.png" alt="MemroOS memory page with multi-memory search, retained context, and activity heatmap"></td>
    <td width="50%"><img src="docs/screenshots/readme-knowledge.png" alt="MemroOS knowledge page showing source corpus health and knowledge collections"></td>
  </tr>
  <tr>
    <td><strong>Memory</strong><br>Search retained context across vector, graph, and episodic memory before handing work to an agent.</td>
    <td><strong>Knowledge</strong><br>Track source files, freshness, collections, and knowledge health for agent consumption.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/readme-dispatch.png" alt="MemroOS dispatch page with A2A cards and live delegations"></td>
    <td width="50%"><img src="docs/screenshots/readme-skills.png" alt="MemroOS skills page showing procedural playbooks and skill analytics"></td>
  </tr>
  <tr>
    <td><strong>Engage</strong><br>Dispatch tasks, chat with agent runtimes, run standups, and inspect live delegation state.</td>
    <td><strong>Skills</strong><br>Review, edit, approve, and promote reusable procedures from agent-local playbooks into enterprise-ready workflows.</td>
  </tr>
</table>

## Why This Exists

Native AI companies are moving from one-off prompt demos to agent workflows that touch roadmap, revenue, code, support, operations, and internal tools. The hard problem is no longer "can an agent answer?" It is:

- What does the agent already know?
- Where did that knowledge come from?
- Which memory did it consume before acting?
- Which framework, agent card, MCP server, or local worker is actually doing the work?
- Who can pause, edit, resume, retry, or roll back a run?
- What should be retained from the outcome?
- When should repeated work become a skill?
- What proof shows the work was checked?
- Which agent is allowed to do what?

MemroOS is built for that layer.

## Who This Is For

- **AI-native founders and operators** who run agents across product, sales, engineering, support, and internal operations.
- **Agent framework users** working with Claude Code, Codex, Google ADK, LangGraph, CrewAI, AutoGen, Hermes, OpenClaw, or custom runtimes that need retained context beside the framework.
- **Product and engineering leaders** who want source-backed runtime context packs before dispatch and proof trails after execution.
- **Self-hosted and local-first builders** who want memory, knowledge, orchestration, skills, agents, usage, and governance in one inspectable repo.

MemroOS is not another agent framework. It is the context plane before dispatch and the proof trail after execution.

## Primary Use Cases

### Product

Retain customer interviews, launch notes, roadmap decisions, objections, and beta learnings. Retrieve them into PRDs, prioritization work, release notes, and follow-up workflows.

### Sales

Retain CRM notes, call takeaways, buyer preferences, competitor mentions, and account history. Retrieve them into account briefs, talk tracks, follow-up, and expansion plans.

### Engineering

Retain architecture decisions, incidents, deploy fixes, repo patterns, and code review outcomes. Retrieve them into debug plans, migrations, reviews, onboarding, and runbooks.

## What To Try First

After setup, you can:

1. Open the MemroOS workspace.
2. Search retained memory across product, sales, engineering, and operational context.
3. Inspect source corpus health in the Knowledge view.
4. Register a local, REST, or A2A-compatible agent.
5. Dispatch work and inspect live delegation state.
6. Run a 15-minute group-room standup or direct agent chat from the Engage surface.
7. Review skill proposals before they modify instructions or playbooks.
8. Keep memory, knowledge, orchestration, skills, agents, usage, and governance in one operator surface.

## Release 1.0 Beta

`v1.0.0-beta.2` is the current public beta release for MemroOS's memory-plus-governance positioning.

The current release includes:

- A NOC-style operator console with grouped navigation, dense operational metrics, and a consistent public-to-product visual system.
- A Next.js workspace with Memory, Knowledge, Skills, Agents, Workflow Map, Engage, Improvements, Usage, and Governance surfaces.
- A Skills workflow for reviewing, editing, approving, and promoting procedures from agent-local playbooks into enterprise-ready workflows.
- A task-first Dispatch room with direct chat, group-room standups, voice prompt controls, and inspectable participant context.
- A canonical SQLite-backed agent registry for REST, UI, and A2A-visible agents.
- A2A card ingestion, task routes, streaming subscription endpoints, and Google ADK compatibility fixtures.
- Agent Context Bus routes and MCP tools for durable inbox/reply flows, acknowledgements, bounded waits, and memory-save receipts.
- Local-footprint inventory for permanent state, rebuildable caches, cloud targets, prune safety, and NOC/API visibility.
- SkillForge production hardening with deterministic sandbox-backed held-out scoring, typed bounded edits, and audit-ready baseline/treatment receipts.
- REST reporting endpoints for heartbeats, memory writes, skill reports, and tool outcomes.
- Memory and knowledge visibility across configured file collections, mem0/Qdrant, graph memory, and local SQLite.
- Client-ready security and architecture audit closeout with full-suite Node/Python validation and documented accepted-risk dependency notes.
- Human-gated Agent Lightning/APO approvals so self-learning proposals queue before mutating agent instructions.

## Completed Roadmap

- **v2.0-v2.4: A2A hub, security, LLM optimization, agent runtime, and performance** - universal REST/A2A registration, LangGraph orchestration, trust layer, model-routing telemetry, and cache/performance work.
- **v2.5-v4.0: Eval engine, compliance, context reliability, and orchestration depth** - composite W, SEAL substrate, RBAC/auth hardening, HIL edit-and-continue, rollback, semantic recall, evidence bundles, and governed skill contracts.
- **v5.0-v5.2: Memory Trust + Operational Intelligence** - raw vault, security labels, classification cascade, retrieval authorization, NOC telemetry, cron health, evidence bundles, auth hardening, memory inventory clarity, and public benchmark architecture.
- **v6.0-v6.3: SkillForge + Agent Lifecycle** - governed skill optimization, Dream Cycle, marketplace, multi-agent skill orchestration, agent memory continuity, skill distribution, private config, Circleback ingestion, checkpoint/resume, memory-trace observability, and agent CI/CD gates.
- **v6.4: SkillForge Production SkillOpt Hardening** - deterministic sandbox-backed held-out eval, one proposal path, traceability fields, typed edit operations, and accepted/rejected evidence.
- **v6.5: Agent Context Bus + Synchronous Agent Communication** - durable agent inbox/reply bus, REST/MCP access, acknowledgements, bounded replies, memory-save receipts, and fail-closed denial of self-declared OAuth/data-access claims.
- **v6.6: Cloud Offload + Local Footprint Reduction** - local store inventory, cloud target mapping, prune-safety classification, cache/log caps, and NOC/API local-footprint status.
- **v7.0: Client-Ready Security + Architecture Audit** - four-domain audit, critical/high remediation, accepted-risk medium CVE notes, architecture cleanup, production build, typecheck, and full-suite validation.

## Current Roadmap Focus

The active product focus after v7.0 is to keep the public beta evidence current and make the newly shipped control-plane work visible:

- **Public proof refresh** - keep memroos.com, README screenshots, launch assets, and LLM-readable docs aligned with the current product surfaces.
- **Agent Context Bus operator visibility** - expose inbox depth, stale messages, pending replies, and memory-save receipts in the operator UI.
- **Local-footprint visibility** - keep `npm run check:local-footprint`, `/api/operations/noc`, and NOC surfaces honest about permanent state, rebuildable caches, cloud targets, and prune safety.
- **Client-ready security follow-through** - add DAST scanning, prepare external penetration-test handoff, and map SOC 2 controls after the internal v7.0 audit baseline.
- **Memory-save quality spike** - evaluate the deferred Memento-style typed/audited save contract without adopting a backend, hosted trace upload, or dependency swap without Luis approval.

## What MemroOS Does

- **Memory search:** Search retained context before an agent starts work.
- **Governed orchestration:** Edit paused HIL state, retry and roll back multi-hop runs, and keep audit lineage for operator decisions.
- **Operations NOC:** Watch memory consumption, undigested work, agent workload, model utility, governance, savings, and waste from the first screen.
- **Knowledge corpus:** Track files, freshness, collections, and source health.
- **Evidence loop:** Connect outputs to sources, memories, tool actions, checks, assumptions, risks, and replay or rollback handles as the roadmap lands.
- **Skill workflow:** Review, edit, approve, and promote repeatable procedures into governed skills with contract fields.
- **Agent registry:** Maintain one canonical roster for local, REST, UI, and A2A agents.
- **A2A broker:** Expose agent cards, JSON-RPC endpoints, task lifecycle routes, SSE task updates, and outbound A2A delegation.
- **MCP-facing context:** Keep memory, knowledge, and skills behind a shared context surface instead of scattering direct tool access across every agent.
- **REST shim:** Let agents report heartbeats, memories, skills, and outcomes before they speak A2A.
- **Task-first dispatch:** Run direct chat, group-room standups, live delegations, and spoken prompts with inspectable context.
- **Workflow map:** Visualize agents, memory, skills, dispatch paths, and infrastructure.
- **Governance:** Gate registry writes, memory reads, destructive actions, and self-learning approvals.
- **Agent Context Bus:** Give registered agents a durable inbox/reply surface with acknowledgements, bounded waits, context-sync receipts, and fail-closed delegated-access policy.
- **Local footprint control:** Classify local stores by permanence, cloud target, size, retention, privacy label, and prune safety.

## What MemroOS Is Not

- Not a replacement for Claude Code, Codex, OpenClaw, Hermes, Google ADK, LangGraph, CrewAI, or AutoGen.
- Not a voice bot company. Voice is one ingestion path for organizational memory.
- Not a search-admin UI. qmd freshness work exists to prove context is current before agents act.
- Not a hosted SaaS control plane in this repo.
- Not an excuse to expose private agents directly to the public internet.
- Not finished. It is useful, inspectable, hackable, and moving quickly.

## Architecture

MemroOS is intentionally thin at the boundary and durable at the center.

```mermaid
flowchart TB
  subgraph Workflows["Agent Workflows"]
    Product["Product agents"]
    Sales["Sales agents"]
    Engineering["Engineering agents"]
    Ops["Operations agents"]
  end

  subgraph MemroOS["MemroOS"]
    UI["Workspace UI"]
    Registry[("Agent Registry")]
    Broker["A2A Broker"]
    REST["REST Shim"]
    Dispatch["Engage + Delegations"]
    Governance["Governance + Audit"]
  end

  subgraph Memory["Memory + Knowledge"]
    Vector["mem0 + Qdrant"]
    Graph["Graph Memory"]
    Episodic[("SQLite Episodic Memory")]
    Library["Knowledge Collections"]
    Skills["Procedural Skills"]
  end

  subgraph Runtimes["Agent Runtimes"]
    Claude["Claude Code"]
    Codex["Codex CLI"]
    ADK["Google ADK"]
    OpenClaw["OpenClaw"]
    Custom["Custom HTTP agents"]
  end

  Product --> UI
  Sales --> UI
  Engineering --> UI
  Ops --> UI

  UI --> Registry
  UI --> Dispatch
  Dispatch --> Broker
  Dispatch --> REST
  Broker --> Registry
  REST --> Registry
  REST --> Governance
  Broker --> Governance

  REST --> Vector
  REST --> Graph
  REST --> Episodic
  UI --> Library
  UI --> Skills
  Skills --> Dispatch

  Broker --> ADK
  REST --> Claude
  REST --> Codex
  REST --> OpenClaw
  REST --> Custom
```

### Memory Loop

```mermaid
sequenceDiagram
  participant Agent
  participant MemroOS
  participant Registry
  participant Memory
  participant Operator

  Agent->>MemroOS: Register or present A2A card
  MemroOS->>Registry: Store identity, protocol, capabilities
  Agent->>MemroOS: Heartbeat / skill report / memory write
  MemroOS->>Memory: Route memory to vector, graph, or episodic tier
  Operator->>MemroOS: Search retained context
  Operator->>MemroOS: Dispatch task with context
  MemroOS->>Registry: Resolve target agent
  MemroOS->>Agent: REST or A2A task request
  Agent->>MemroOS: Outcome, result, skill signal
  MemroOS->>Memory: Retain what changed
```

## Quickstart

### Prerequisites

- Node.js and npm
- Python 3
- Docker with Docker Compose
- Optional: Qdrant Cloud URL and API key for vector memory
- Optional: Tailscale for multi-machine private networking

```bash
git clone https://github.com/lac5q/memroos.git
cd memroos
npm install
./setup.sh --wizard
./setup.sh
```

On macOS, `setup.sh` also installs the Memory Resilience monitors by default:

- `com.memroos.memory-healthcheck`: every 5 minutes, checks mem0, QMD, queued writes, Gmail context freshness, source-to-QMD indexing for recent knowledge artifacts, and embedding round-trip health.
- `com.memroos.memory-degradation-evals`: daily at 9:15 AM, runs the degradation regression suite.

Set `INSTALL_MEMORY_RESILIENCE=0` before `./setup.sh` to skip launchd monitor installation, or run `npm run install:memory-resilience` later.

To verify that Google Drive exports, meeting recordings, Spark notes, emails, Slack source files, and analysis files are actually agent-searchable, not merely present on disk:

```bash
npm run check:knowledge-indexing -- --days=2
```

Open MemroOS:

```text
http://localhost:3000
```

For a local production-style server:

```bash
npm --prefix apps/memroos run build
MEMROOS_PUBLIC_BASE_URL=http://localhost:3002 \
MEMROOS_A2A_ENDPOINT_BASE_URL=http://localhost:3002 \
npm --prefix apps/memroos run start -- --port 3002
```

The environment variable prefix is still `MEMROOS_*` for compatibility with existing installs.

## Recommended Deployment

MemroOS is designed to start private and become public only when you mean it.

```mermaid
flowchart LR
  Founder["Founder laptop"] <--> Tailnet["Tailscale / private LAN"]
  Server["MemroOS server"] <--> Tailnet
  Agents["Agent machines"] <--> Tailnet
  Tailnet --> Auth["Operator key + per-agent bearer keys"]
  Auth --> MemroOS["MemroOS"]
```

Operating profiles:

- `local-dev`: one developer machine; loopback registry writes can work without an operator key.
- `single-host`: all services on one server or VM; operator key required.
- `private-network`: recommended startup deployment for multiple machines on Tailscale or LAN.
- `cloud-https`: internet-reachable deployment behind HTTPS reverse proxy or tunnel.
- `custom`: operator-defined topology with explicit environment values.

See [Install profiles](docs/install-profiles.md).

## Agent Registry

MemroOS has one canonical registry. The `/agents` page shows the DB-backed roster, not ad hoc files.

### Register a REST agent

```bash
curl -X POST http://localhost:3000/api/agents/register \
  -H 'Content-Type: application/json' \
  -H 'x-memroos-operator-key: <operator-key>' \
  -d '{
    "id": "worker-1",
    "name": "Worker 1",
    "role": "Research and implementation agent",
    "platform": "codex",
    "protocol": "rest",
    "location": "tailscale",
    "host": "agent.tailnet",
    "port": 8787,
    "healthEndpoint": "/health"
  }'
```

### Register an A2A agent by card URL

```bash
curl -X POST http://localhost:3000/api/a2a/agents/register \
  -H 'Content-Type: application/json' \
  -H 'x-memroos-operator-key: <operator-key>' \
  -d '{
    "cardUrl": "http://agent.tailnet:8000/.well-known/agent-card.json",
    "source": "a2a"
  }'
```

The response may include an API key unless `issueApiKey` is false. Store it securely. MemroOS never displays stored bearer tokens after creation.

### One-command agent onboarding

For agents that can run shell commands, create a short-lived invite and hand the returned command to the agent. The invite registers the agent, mints its per-agent API key, and returns a MemroOS MCP config.

```bash
curl -X POST http://localhost:3000/api/onboarding/invite \
  -H 'Content-Type: application/json' \
  -H 'x-memroos-operator-key: <operator-key>' \
  -d '{
    "agentId": "maria",
    "name": "Maria",
    "role": "Research and implementation partner",
    "platform": "openclaw",
    "ttlMinutes": 15
  }'
```

Give the `command` from the response to the agent. The command looks like:

```bash
curl -fsSL 'https://memroos.example/api/onboarding/script?token=...' | bash -s -- --id 'maria' --name 'Maria' --role 'Research and implementation partner' --platform 'openclaw' --mcp-target 'auto'
```

The default `--mcp-target auto` selects the right installer from the platform: `hermes`, `openclaw`, `claude`, `gemini`, `qwen`, `codex`, or `stdout` for ChatGPT. ChatGPT cannot run the shell command directly; for ChatGPT, use the returned `mcpUrl` as the custom connector URL in ChatGPT Apps & Connectors.

## Add MemroOS To Agent Clients

### ChatGPT

ChatGPT uses remote MCP over HTTP. Start the MCP facade and expose it through a trusted HTTPS URL such as Tailscale Funnel, Cloudflare Tunnel, or your own private gateway:

```bash
cd /path/to/memroos
MEMROOS_MCP_PUBLIC_BASE_URL=https://memroos.example npm run install:mcp:chatgpt
```

The connector URL is:

```text
https://memroos.example/mcp
```

In ChatGPT, open **Settings -> Connectors -> Advanced -> Developer mode**, add a remote MCP server, name it `MemroOS`, and use the `/mcp` URL above.

### Claude Desktop

Claude Desktop can run MemroOS locally over stdio. Edit:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Add or merge this server entry:

```json
{
  "mcpServers": {
    "memroos": {
      "command": "/bin/bash",
      "args": [
        "-lc",
        "exec \"${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh\""
      ]
    }
  }
}
```

Fully quit and reopen Claude Desktop after saving the file. If your local clone is somewhere else, either set `MEMROOS_ROOT` or replace `$HOME/github/memroos` with the absolute path to this repo.

## Protocol Strategy

```mermaid
flowchart TD
  Start["New agent"] --> Card{"Can expose A2A card?"}
  Card -->|Yes| A2A["Register via /api/a2a/agents/register"]
  Card -->|No| Rest["Register via /api/agents/register"]
  A2A --> Tasks["Use task lifecycle, streaming, card metadata"]
  Rest --> Shim["Use heartbeat, memory, skills, outcomes"]
  Shim --> Later["Upgrade to A2A when framework supports it"]
```

Use **A2A** when the framework can expose or consume an agent card and task lifecycle. Use the **REST shim** when the framework does not speak A2A yet or when you only need reporting: heartbeat, memory writes, skill outcomes, and registry visibility.

## Memory And Knowledge

MemroOS keeps source knowledge and retained memory separate on purpose.

```mermaid
flowchart LR
  subgraph Knowledge["Knowledge files"]
    Skills["skills"]
    Projects["projects"]
    Emails["emails"]
    Meetings["meetings"]
    Runtime["skill runtimes"]
  end

  subgraph Memory["Memory entries"]
    Vector["Vector memory"]
    Graph["Graph memory"]
    Episodic["SQLite episodic memory"]
  end

  Knowledge --> Library["Knowledge UI"]
  Memory --> Search["Memory search"]
  Search --> Context["Runtime context packs"]
  Context --> Agents["Agent workflows"]
```

Knowledge files are counted from configured collections. Memory entries live in separate memory services and SQLite tables, so a collection file count is not the same thing as total memories.

## Progressive Capabilities

MemroOS treats specialized systems as optional progressive capabilities. They can be checked during setup, shown in tool-attention, and recommended from outcome history without becoming required dependencies for every install.

Enable the current optional bundle with:

```env
MEMROOS_OPTIONAL_CAPABILITIES=gitnexus,agent-lightning
```

Current bundled capabilities:

- **GitNexus:** Code graph and impact analysis capability. MemroOS catalogs the capability, reports status, and helps agents decide when to load it.
- **Agent Lightning/APO:** Human-gated self-learning proposal workflow. MemroOS owns the operator UI/API approval queue while worker CLIs apply approved proposals.

## Security Model

MemroOS is built for private-network production first.

- Registry writes require `MEMROOS_OPERATOR_API_KEY` outside local loopback.
- Agent write/reporting endpoints require per-agent bearer credentials minted by the registry.
- Memory read endpoints require operator authorization because they can expose sensitive context.
- Prefer Tailscale or a private LAN for multi-machine startup deployments.
- Use HTTPS and explicit operator keys for public or tunnel exposure.
- Treat agent cards as untrusted input. MemroOS validates URL policy, payload size, required fields, and registration authorization.

## Local URLs

- Landing page: `http://localhost:3000`
- Production-style local server: `http://localhost:3002`
- Memory UI: `/notebooks`
- Knowledge UI: `/library`
- Skills UI: `/cookbooks`
- Agent registry: `/agents`
- Engage / Dispatch UI: `/dispatch`
- Workflow Map UI: `/flow`
- A2A card: `/.well-known/agent-card.json`

## Development

```bash
npm run dev
npm run test
npm run lint
npm run build
npm run profiles:check
npm run first-run:check
npm run eval:memory-degradation
```

## Project Structure

```text
memroos/
├── apps/memroos/              # Next.js UI and API routes
├── services/orchestration/    # Python LangGraph orchestration service
├── services/memory/           # mem0 service wrapper
├── services/knowledge-mcp/    # Knowledge/tool-attention MCP facade
├── services/voice-server/     # Optional voice service
├── config/                    # Operating profiles
├── docker/                    # Service Dockerfiles
├── docs/                      # User and architecture docs
├── scripts/                   # Setup and validation scripts
└── data/                      # Local SQLite state, gitignored
```

## Docs

- [Architecture](docs/architecture.md)
- [Install profiles](docs/install-profiles.md)
- [REST API reference](docs/rest-api.md)
- [Memory architecture](docs/memory-architecture.md)
- [Agentic memory benchmark](docs/marketplace/agentic-memory-benchmark-2026-05-24.md)
- [Claude Code integration](docs/integrations/claude-code.md)
- [Google ADK integration](docs/integrations/google-adk.md)
- [LangGraph integration](docs/integrations/langgraph.md)
- [MemroOS MCP server](docs/integrations/mcp.md)
- [CrewAI and AutoGen integration](docs/integrations/crewai-autogen.md)
- [Workflow feedback intake](docs/workflow-feedback-intake.md)

## Roadmap

Near-term focus after v7.0:

- Keep public docs, screenshots, metadata, and launch assets synchronized with the current beta.
- Add an operator UI for Agent Context Bus inbox depth, pending replies, stale messages, and memory-save receipts.
- Continue local-footprint reduction through managed persistence targets, qmd/search worker offload, cache caps, and encrypted raw-vault object-storage proof.
- Add DAST scanning, external penetration-test preparation, and SOC 2 control mapping on top of the internal v7.0 audit baseline.
- Run the deferred Memento-style memory-save quality spike as a bounded comparison only; no dependency adoption, backend swap, hosted/private trace upload, or replacement of mem0/Qdrant/Neo4j/SQLite without Luis approval.

## Contributing

This project is early, but useful contributions are welcome.

Start with [CONTRIBUTING.md](CONTRIBUTING.md) for setup, branch, pull request, and verification expectations. Please also read [SECURITY.md](SECURITY.md) before reporting security issues or sharing logs from agent runs.

Good first contribution areas:

- Add an adapter for an agent framework you use.
- Improve setup docs for your deployment shape.
- Add A2A compatibility fixtures.
- Improve memory search and source attribution.
- Improve security tests around registry writes and memory reads.

If MemroOS helps you stop making every agent start from zero, please star the repo. It helps the project find people building the same useful future.

## License

MemroOS is distributed under the [PolyForm Small Business License 1.0.0](LICENSE). Small businesses that meet the license thresholds may use it under those terms. Larger commercial use requires a separate commercial license. See [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

Memroos versions up to the `memroos-mit-final` tag were distributed under the MIT License. Those earlier MIT rights remain governed by those earlier terms. The current license applies to MemroOS copies and contributions after the license-change commit.
