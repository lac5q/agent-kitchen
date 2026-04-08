# Agent Kitchen 🍳

> A beautiful, restaurant-themed observability dashboard for AI agent infrastructure.

Monitor your entire agent fleet — local and remote — from one place. Track token economics, memory, knowledge bases, self-learning optimization (APO), and system flow in real time.

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![Tailwind](https://img.shields.io/badge/Tailwind-4-blue) ![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-latest-slate) ![License](https://img.shields.io/badge/license-MIT-green)

---

## Views

| View | Route | What it shows |
|------|-------|--------------|
| 👨‍🍳 **Kitchen Floor** | `/` | Real-time agent grid — status, heartbeats, current tasks, lessons, memory counts |
| 🧾 **The Ledger** | `/ledger` | Token economics — RTK savings, model mix, cost calculator |
| 🧠 **Notebook Wall** | `/notebooks` | Memory explorer — Claude auto-memory, agent daily notes, activity heatmap |
| 📚 **The Library** | `/library` | Knowledge base health — collection treemap, freshness alerts, coverage gaps |
| 🔄 **The Flow** | `/flow` | Animated system architecture — live data, interactive demo mode |
| 🍲 **The Sous Vide** | `/apo` | Agent Lightning APO — self-learning proposals, cron cycle stats, log viewer |

---

## Quick Start

```bash
git clone https://github.com/lac5q/agent-kitchen
cd agent-kitchen
npm install
cp .env.example .env.local
# Edit .env.local with your paths
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Configuration

Agent Kitchen is fully config-driven. No code changes needed to adapt it to your setup.

### 1. Environment Variables (`.env.local`)

Copy `.env.example` and fill in your paths:

```env
# Path to your agent config directories
AGENT_CONFIGS_PATH=/Users/yourname/github/knowledge/agent-configs

# Path to your knowledge repository
KNOWLEDGE_BASE_PATH=/Users/yourname/github/knowledge

# Claude Code auto-memory location
CLAUDE_MEMORY_PATH=/Users/yourname/.claude/projects

# mem0 semantic memory API (if you run mem0)
MEM0_URL=http://localhost:3201

# Agent Lightning / APO (if you run OpenClaw APO)
APO_PROPOSALS_PATH=/Users/yourname/.openclaw/skills/proposals
APO_CRON_LOG_PATH=/Users/yourname/.openclaw/logs/agent-lightning-cron.log
```

### 2. Remote Agents (`agents.config.json`)

Edit `agents.config.json` to register your remote agents (Tailscale, Cloudflare tunnels, or any HTTP endpoint):

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

### 4. Agent Roles

Local agents are auto-discovered from `AGENT_CONFIGS_PATH`. Each subdirectory becomes an agent. Roles are mapped in `src/lib/parsers.ts` — edit `DEFAULT_ROLES` to match your naming conventions.

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

All data is fetched live — no database, no caching layer, read-only.

---

## Agent Directory Structure

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

## APO / Agent Lightning Support

If you run [Microsoft Agent Lightning](https://github.com/microsoft/agent-lightning) or a compatible APO system, the Sous Vide view tracks:

- **Proposal queue** — pending `.md` files awaiting human approval
- **Archived proposals** — historical improvement attempts
- **Cycle log** — last 50 lines of the cron log with error/success highlighting
- **Cycle stats** — last run time, total/pending/archived proposal counts

Expected proposal format: `APO_PROPOSAL_[skill]_[subsystem]_[timestamp].md`

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui (base-ui) |
| Charts | Recharts |
| Animation | Framer Motion |
| Data fetching | TanStack Query |
| Testing | Vitest + React Testing Library |

---

## Compatible Agentic Systems

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
npm run dev      # Start dev server
npm run build    # Production build
npm test         # Run tests (Vitest)
```

---

## License

MIT — fork it, extend it, make it yours.
