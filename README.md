# Agent Kitchen 🍳

> A beautiful, restaurant-themed observability dashboard for AI agent infrastructure.

Monitor your entire agent fleet — local and remote — from one place. Track agent health, memory, knowledge bases, token economics, self-learning optimization (APO), and system architecture in real time.

![Kitchen Floor](./docs/screenshots/kitchen-floor.png)

---

## What It Is

Agent Kitchen is a **Next.js dashboard** that gives you a single pane of glass for your AI agent infrastructure. Whether you're running one agent or twenty, local or across Tailscale tunnels, Agent Kitchen shows you:

- **Who's online** — live heartbeat status for every agent
- **What they're doing** — current tasks, recent lessons, memory counts
- **How much it costs** — token economics, model mix, savings calculator
- **What's in their head** — memory explorer, conversation history, activity heatmap
- **What they know** — knowledge base health, coverage gaps, freshness alerts
- **How they talk** — animated system flow diagram with live activity feed
- **How they improve** — APO proposal queue, cron cycle stats, log viewer

All data is fetched **live** from your filesystem and HTTP endpoints. No database required (except an optional SQLite store for conversations).

---

## Screenshots

| View | What You See |
|------|-------------|
| **Kitchen Floor** (`/`) | Real-time agent grid — status, heartbeats, current tasks, lessons, memory counts |
| ![Kitchen Floor](./docs/screenshots/kitchen-floor.png) | |
| **The Ledger** (`/ledger`) | Token economics — RTK savings, model mix, cost calculator |
| ![Ledger](./docs/screenshots/ledger.png) | |
| **The Flow** (`/flow`) | Animated system architecture — live data, interactive demo mode, voice & chat panel |
| ![Flow](./docs/screenshots/flow.png) | |
| **The Library** (`/library`) | Knowledge base health — collection treemap, freshness alerts, coverage gaps |
| ![Library](./docs/screenshots/library.png) | |
| **Notebook Wall** (`/notebooks`) | Memory explorer — auto-memory files, daily notes, activity heatmap |
| ![Notebooks](./docs/screenshots/notebooks.png) | |
| **The Sous Vide** (`/apo`) | Agent Lightning APO — self-learning proposals, cron cycle stats, log viewer |
| ![APO](./docs/screenshots/apo.png) | |
| **The Dispatch** (`/dispatch`) | Send tasks to remote agents, view delegation status, lineage timeline |
| ![Dispatch](./docs/screenshots/dispatch.png) | |

---

## Quick Start

```bash
git clone https://github.com/lac5q/agent-kitchen.git
cd agent-kitchen
npm install
cp .env.example .env.local
# Edit .env.local with your paths
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For production:

```bash
npm run build
npm start
```

---

## Configuration

Agent Kitchen is fully config-driven. No code changes needed to adapt it to your setup.

### 1. Environment Variables (`.env.local`)

Copy `.env.example` and fill in your paths:

```env
# Path to your agent config directories (each subfolder = one agent)
AGENT_CONFIGS_PATH=/Users/yourname/github/knowledge/agent-configs

# Path to your knowledge repository
KNOWLEDGE_BASE_PATH=/Users/yourname/github/knowledge

# Claude Code auto-memory location
CLAUDE_MEMORY_PATH=/Users/yourname/.claude/projects

# mem0 semantic memory API (optional)
MEM0_URL=http://localhost:3201

# Agent Lightning / APO (optional)
APO_PROPOSALS_PATH=/Users/yourname/.openclaw/skills/proposals
APO_CRON_LOG_PATH=/Users/yourname/.openclaw/logs/agent-lightning-cron.log

# LLM for memory consolidation (optional)
ANTHROPIC_API_KEY=your_key_here
CONSOLIDATION_MODEL=claude-haiku-4-5-20251001
```

### 2. Remote Agents (`agents.config.json`)

Edit `agents.config.json` to register your remote agents:

```json
{
  "remoteAgents": [
    {
      "id": "my-agent",
      "name": "My Agent",
      "role": "Line Cook (Engineering)",
      "platform": "claude",
      "location": "tailscale",
      "host": "100.x.x.x",
      "port": 18789,
      "healthEndpoint": "/health"
    }
  ]
}
```

Supported locations:
- `"local"` — same machine, accessed via `localhost`
- `"tailscale"` — Tailscale mesh network (100.x.x.x IPs)
- `"cloudflare"` — Cloudflare tunnel (`tunnelUrl` required)

### 3. Knowledge Collections (`collections.config.json`)

Edit `collections.config.json` to list your knowledge base directories:

```json
{
  "collections": [
    { "name": "my-docs", "category": "business" },
    { "name": "agent-configs", "category": "agents" },
    { "name": "skills", "category": "product" }
  ]
}
```

Categories: `business` | `agents` | `marketing` | `product` | `other`

### 4. Agent Directory Structure

For local agents, Agent Kitchen reads these files from each agent's config directory:

```
agent-configs/
└── my-agent/
    ├── HEARTBEAT.md         # Latest heartbeat content
    ├── HEARTBEAT_STATE.md   # Current task (first line shown on card)
    ├── LESSONS.md           # Lessons learned (count displayed)
    └── memory/
        └── YYYY-MM-DD.md   # Daily memory entries
```

Any directory under `AGENT_CONFIGS_PATH` becomes an agent card on the Kitchen Floor.

---

## Data Sources & API Routes

| Route | Source | Refresh |
|-------|--------|---------|
| `/api/agents` | Filesystem: agent config dirs | 5s |
| `/api/remote-agents` | HTTP poll: all entries in `agents.config.json` | 10s |
| `/api/tokens` | `rtk gain` CLI ([RTK](https://github.com/lac5q/rtk)) | 30s |
| `/api/memory` | `~/.claude/projects/*/memory/` + mem0 | 15s |
| `/api/knowledge` | Filesystem: knowledge base collections | 60s |
| `/api/apo` | `~/.openclaw/skills/proposals/` + cron log | 30s |
| `/api/health` | Ping all services | 10s |

All data is fetched live — no caching layer, read-only.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui (base-ui) |
| Charts | Recharts |
| Animation | Framer Motion |
| Data fetching | TanStack Query |
| Database | better-sqlite3 (optional, for conversations) |
| Testing | Vitest + React Testing Library + Playwright |

---

## Compatible Agent Systems

Agent Kitchen works with any agent system that:
- Stores agent configs as directories with markdown files
- Exposes a `/health` HTTP endpoint on each agent node
- Optionally: runs [RTK](https://github.com/lac5q/rtk), [mem0](https://github.com/mem0ai/mem0), or an APO loop

Known compatible setups:
- **OpenClaw** — full support (local + remote agents, APO)
- **Claude Code** — auto-memory files read from `~/.claude/projects/`
- **Any HTTP agent** — add to `agents.config.json` with a health endpoint

---

## Development

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Production build
npm start        # Start production server (port 3002)
npm test         # Run tests (Vitest)
```

---

## Project Structure

```
agent-kitchen/
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # React components (kitchen, ledger, flow, etc.)
│   ├── lib/              # Utilities, API clients, parsers
│   └── types/            # TypeScript types
├── data/                 # SQLite database (gitignored)
├── docs/
│   ├── screenshots/      # Dashboard screenshots for README
│   ├── handover/         # Developer handover docs
│   └── superpowers/      # Design specs and plans
├── voice-server/         # Optional Python voice server
├── agents.config.json    # Remote agent registry
├── collections.config.json # Knowledge base collections
├── .env.example          # Environment variable template
└── start.sh              # Production startup script (Next.js + voice servers)
```

---

## Security

This repository includes automated secret scanning. See [`.github/workflows/secret-guard.yml`](./.github/workflows/secret-guard.yml) for the full configuration.

The following patterns are blocked from ever entering the codebase:
- API keys (`sk-...`, `AIza...`, `ghp_...`)
- AWS credentials (`AKIA...`)
- Private keys (`-----BEGIN PRIVATE KEY-----`)
- IP addresses (`100.x.x.x`, `10.x.x.x` — Tailscale/internal ranges)
- Domains with known internal patterns
- Email addresses and phone numbers
- Generic password assignments

If you fork this repo, the same checks will run on your PRs.

---

## License

MIT — fork it, extend it, make it yours.
