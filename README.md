# Agent Kitchen

**The Knowledge Restaurant** - A beautiful, restaurant-themed observability dashboard for AI agent infrastructure.

## Views

- **The Kitchen Floor** - Real-time agent grid with status, heartbeats, and task tracking
- **The Ledger** - Token economics: spend, savings (via RTK), cost calculator
- **The Notebook Wall** - Memory explorer: agent daily notes, calendar heatmap, content viewer
- **The Library** - Knowledge base health: collection treemap, coverage gaps, freshness alerts
- **The Flow** - Animated system architecture with live data and interactive demo mode

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data Sources

| Service | Endpoint | What it provides |
|---------|----------|-----------------|
| Filesystem | /api/agents | Agent configs, heartbeats, memory |
| RTK | /api/tokens | Token usage and savings analytics |
| mem0 | /api/memory | Semantic memory entries |
| QMD / Files | /api/knowledge | Knowledge base collections and stats |
| All | /api/health | Service health status |

## Tech Stack

Next.js 15 + Tailwind CSS + shadcn/ui + Recharts + Framer Motion + TanStack Query

## Testing

```bash
npx vitest run
```

## License

MIT
