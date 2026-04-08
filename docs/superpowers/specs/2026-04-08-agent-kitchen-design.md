# Agent Kitchen Dashboard — Design Spec

**Date:** 2026-04-08
**Repo:** `agent-kitchen`
**Stack:** Next.js 15 + Tailwind CSS + shadcn/ui + Recharts + Framer Motion

## Overview

A beautiful, restaurant-themed observability dashboard for Luis's AI agent infrastructure. Tracks agent usage, token economics, memory content, knowledge base health, and system flow — all with live data from local services.

**Audience:** Luis (daily ops), team/agents (reference), external (demos/investors).

**Metaphor:** "The Knowledge Restaurant" — agents are chefs, knowledge repo is the library, mem0 is notebooks, QMD is the librarian, Paperclip is the kitchen manager, OpenClaw gateways are kitchen doors.

---

## Architecture

### App Shell
- **Theme:** Dark (slate-950 base), warm restaurant aesthetic
- **Sidebar nav** with restaurant icons per view
- **Top bar:** System health pulse — green/amber/red dot per service (RTK, mem0, QMD, Paperclip)
- **Color palette:** Dark base (slate-950), warm accent (amber-500), success (emerald-500), danger (rose-500), info (sky-500)

### Data Layer
Next.js API routes under `/api/` polling local services:

| Endpoint | Source | Interval |
|----------|--------|----------|
| `/api/agents` | Filesystem: `~/github/knowledge/agent-configs/` | 5s |
| `/api/tokens` | `rtk gain --json` | 30s |
| `/api/memory` | mem0 HTTP `localhost:3201` | 15s |
| `/api/knowledge` | QMD MCP tool / filesystem | 60s |
| `/api/health` | All services ping | 10s |

Client-side: React Query (TanStack Query) with configurable intervals.

### Navigation

| Icon | View | Route |
|------|------|-------|
| ChefHat | The Kitchen Floor | `/` |
| Receipt | The Ledger | `/ledger` |
| Brain | The Notebook Wall | `/notebooks` |
| Library | The Library | `/library` |
| Workflow | The Flow | `/flow` |

---

## View 1: The Kitchen Floor (`/`)

Real-time agent grid — each agent as a "chef station" card.

### Top Summary Bar
- Total agents (51), Active now, Tasks in flight, Failures today

### Agent Cards (responsive grid: 3-4 cols desktop, 1 mobile)
Each card:
- Agent name + role (e.g., "Alba — Head Chef")
- Avatar/icon with colored ring: green (active <5min), amber (active today), gray (dormant)
- Last heartbeat timestamp
- Current task/status from `HEARTBEAT_STATE.md`
- Miniature sparkline (activity last 24h)
- Platform badge (Claude, Codex, Qwen, Gemini)

### Agent Detail Drawer (click card)
- Full heartbeat history (7 days)
- Recent lessons (`LESSONS.md`)
- Today's memory entries
- Current blockers/escalations

### Data Sources
- Agent list: `~/github/knowledge/agent-configs/` directories
- Heartbeat: `HEARTBEAT_STATE.md` per agent
- Status: `HEARTBEAT.md` last entry
- Lessons: `LESSONS.md`
- Daily memory: `memory/YYYY-MM-DD.md`
- Task counts: PMO memory + Paperclip API

---

## View 2: The Ledger (`/ledger`)

Token economics command center.

### Top KPI Cards (4)
| Card | Source |
|------|--------|
| Total Tokens Processed (input/output) | `rtk gain` |
| Tokens Saved (count + %) | `rtk gain` |
| Total Commands | `rtk gain` |
| Avg Execution Time | `rtk gain` |

### Tabbed Charts
1. **Savings Breakdown** — horizontal bar chart, each command type, two-tone (used vs saved), sorted by biggest savings
2. **Cost Over Time** — area chart, daily consumption stacked by model (Opus/Sonnet/Haiku), RTK savings overlay line. Source: `rtk gain --history`
3. **Model Mix** — donut chart, proportion by model tier, click segment to drill into agent-level usage

### Command Log Table
- Sortable/filterable: timestamp, command, model, tokens in/out, saved, duration
- Search bar for filtering

### Estimated Cost Calculator
- Widget: enter API pricing per model → see estimated $ spend and $ saved

---

## View 3: The Notebook Wall (`/notebooks`)

Visual memory explorer.

### Layout
Split view — left panel (browser/filter), right panel (content viewer).

### Left Panel Tabs
1. **mem0 (Semantic)** — entries from Qdrant via localhost:3201. Shows snippet, agent_id, timestamp, relevance. Memory Growth sparkline.
2. **Agent Daily Notes** — calendar heatmap (GitHub-contribution style). Agents as rows, dates as columns. Click date → shows all agent entries.
3. **Claude Auto-Memory** — browse `~/.claude/projects/*/memory/` by type (user/feedback/project/reference). Shows MEMORY.md index.

### Right Panel — Content Viewer
- Rendered markdown
- Metadata header: agent, date, type, source path
- "Related memories" via mem0 semantic similarity

### Filters
- Search bar (semantic via mem0/QMD)
- Filter chips: by agent, date range, memory type

### Summary Stats
- Total mem0 entries, Agent notes today, Auto-memory files, Most active rememberer

---

## View 4: The Library (`/library`)

Knowledge base health dashboard.

### Collection Overview Cards
- One card per QMD collection (15 total)
- Shows: name, doc count, icon
- Sorted by size, color intensity scales with count
- Click → filters detail view

### Two-Column Main Area

**Left: Collection Treemap**
- Interactive Recharts treemap
- Area proportional to doc count
- Color-coded by category (business, agents, marketing, product)
- Hover: name, count, last updated

**Right: Search Playground**
- Live search input → QMD
- Toggle: lex / vec / hyde
- Results: title, collection, score, snippet

### Bottom: Health & Coverage
- **Freshness timeline** — per collection, last modified. Stale = amber/red glow
- **Coverage gaps** — collections <10 docs flagged, empty skill categories
- **Doc type breakdown** — pie chart (skills vs configs vs memory vs business)
- **Top collections table** — sortable: name, count, avg size, last updated

### Stats
- Total docs (3,445), Collections (15), Skills (405+), Stalest collection

---

## View 5: The Flow (`/flow`)

Animated restaurant flow diagram with live data.

### Visual Layout (left to right)
```
[Request In] → [Gateway Doors] → [Kitchen Manager] → [Chef Stations] → [Output]
                 (OpenClaw)        (Paperclip)         (Agents)
                    |                  |                  |
              [Phone Lines]      [Task Board]      [Cookbooks]  [Notebooks]  [Librarian]
              (CF Tunnels)       (Orchestration)   (skillshare)   (mem0)       (QMD)
```

### Animated Nodes
- Restaurant-style illustrated icons (warm, not sterile)
- Particles flow along edges: amber=request, emerald=knowledge, sky=memory, rose=error
- Nodes pulse/glow when active (real heartbeat data)

### Interactive
- Hover node → tooltip with live stats
- Click node → slide-out panel linking to relevant dashboard page
- Click edge → recent data on that path

### Live Data Per Node
| Node | Data |
|------|------|
| Gateways (Alba/Gwen/Sophia) | Port reachability |
| Paperclip | Active task count |
| Chef stations | Agent heartbeat status |
| Cookbooks | Skill count (405+) |
| Notebooks (mem0) | Entry count, last write |
| Librarian (QMD) | Collection count, health |

### Demo Mode
- Toggle button triggers walkthrough animation
- Simulates "Write a Facebook ad for TurnedYellow" flow
- Lights up nodes sequentially with explanatory captions

### Tech
- Framer Motion for node transitions
- SVG particle system for flowing data (lightweight, no game engine)

---

## Tech Stack Summary

| Layer | Tech |
|-------|------|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui |
| Charts | Recharts |
| Animation | Framer Motion |
| Data fetching | TanStack Query (React Query) |
| Flow diagram | Custom SVG + Framer Motion |
| Testing | Vitest + React Testing Library + Playwright |

---

## Project Structure

```
agent-kitchen/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # App shell, sidebar, top bar
│   │   ├── page.tsx            # Kitchen Floor (home)
│   │   ├── ledger/page.tsx
│   │   ├── notebooks/page.tsx
│   │   ├── library/page.tsx
│   │   ├── flow/page.tsx
│   │   └── api/
│   │       ├── agents/route.ts
│   │       ├── tokens/route.ts
│   │       ├── memory/route.ts
│   │       ├── knowledge/route.ts
│   │       └── health/route.ts
│   ├── components/
│   │   ├── layout/             # Sidebar, TopBar, Shell
│   │   ├── kitchen/            # AgentCard, AgentGrid, AgentDrawer
│   │   ├── ledger/             # KPICard, SavingsChart, CostChart, ModelMix, CommandLog
│   │   ├── notebooks/          # MemoryBrowser, CalendarHeatmap, ContentViewer
│   │   ├── library/            # CollectionCard, Treemap, SearchPlayground, HealthPanel
│   │   └── flow/               # FlowCanvas, AnimatedNode, ParticleSystem, DemoMode
│   ├── lib/
│   │   ├── api-client.ts       # React Query hooks
│   │   ├── parsers.ts          # Markdown/file parsers
│   │   └── constants.ts        # Colors, intervals, agent metadata
│   └── types/
│       └── index.ts            # TypeScript types
├── public/
│   └── icons/                  # Restaurant-themed SVG icons
├── docs/
│   └── superpowers/specs/
├── package.json
├── tailwind.config.ts
├── next.config.ts
└── vitest.config.ts
```

---

## Non-Goals (YAGNI)

- No auth — local dashboard only
- No database — all data from live services and filesystem
- No write operations — read-only dashboard
- No mobile-first — desktop-first, responsive is nice-to-have
- No SSR for data — all client-side fetching with React Query
