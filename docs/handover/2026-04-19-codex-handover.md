# Agent Kitchen — Codex Handover Report

**Date:** 2026-04-19  
**Repo:** `agent-kitchen` — Next.js 16 (App Router), TypeScript, better-sqlite3, Tailwind, Vitest  
**Branch:** `main`  
**Test status:** 324/324 passing  
**Production:** `https://kitchen.example.com` (port 3002, `npm start`)  
**Dev server:** `http://localhost:3000` (`next dev`)

---

## 1. What This Project Is

Agent Kitchen is a **multi-agent coordination dashboard** for a fleet of heterogeneous AI agents (OpenClaw, Hermes, Claude Code CLI, Codex CLI). It provides:

- **Kitchen Floor** (`/`) — live agent status grid
- **The Ledger** (`/ledger`) — memory, conversation history, skill heatmap, model usage
- **The Dispatch** (`/dispatch`) — send tasks to remote agents, view delegation status, lineage timeline
- **The Flow** (`/flow`) — conversation flow diagram + voice/chat panel
- **SQLite-backed persistence** (`data/conversations.db`) — agent heartbeats, hive_actions, hive_delegations, messages

---

## 2. Agent Fleet

Registered in `agents.config.json`:

| ID | Name | Runtime | Location | Host:Port |
|----|------|---------|----------|-----------|
| `sophia` | Sophia | openclaw | tailscale | 100.x.x.x:18889 |
| `maria` | Maria | hermes | tailscale | 100.x.x.x:8644 |
| `lucia` | Lucia | openclaw | local VPS | localhost:3001 |
| `alba` | Alba | hermes | local Mac | localhost:18793 |
| `gwen` | Gwen | openclaw | cloudflare | gwen.example.com |

All dropdowns and UI labels show `Runtime → Name` (e.g. `OpenClaw → Sophia`, `Hermes → Alba`).

---

## 3. Dispatch System — What's Built (Plans 01 + 02 ✅)

### 3.1 Database Schema (`src/lib/db-schema.ts`)

```sql
-- Task queue (append + mutable)
hive_delegations (
  id, task_id TEXT UNIQUE, from_agent, to_agent,
  task_summary, priority INT DEFAULT 5,
  status TEXT CHECK(status IN ('pending','active','paused','completed','failed','canceled')),
  checkpoint TEXT,          -- JSON, optional progress snapshot
  context_id TEXT,          -- conversation grouping key (A2A-compatible)
  result TEXT,              -- JSON terminal payload
  created_at, updated_at
)

-- Append-only audit log
hive_actions (
  id, agent_id, action_type TEXT CHECK(... IN ('continue','loop','checkpoint','trigger','stop','error')),
  summary TEXT, artifacts TEXT,  -- JSON: must include task_id for dispatch rows
  timestamp
)
```

### 3.2 API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/dispatch` | Dispatch task to any registered agent |
| `GET` | `/api/hive` | Poll delegations/actions; supports `?task_id=X`, `?context_id=X`, `?to_agent=X&status=pending` |
| `POST` | `/api/hive` | Agent reports checkpoint/result/status transition |
| `GET` | `/api/agents/cards` | All A2A agent cards |
| `GET` | `/api/agents/[id]/card` | Single agent's A2A card |

### 3.3 `POST /api/dispatch` Contract

**Request:**
```json
{
  "to_agent": "sophia",
  "task_summary": "Write a blog post about ...",
  "from_agent": "kitchen",
  "priority": 5,
  "context_id": "<optional-uuid>",
  "task_id": "<optional-uuid>"
}
```

**Response (200):**
```json
{
  "ok": true,
  "task_id": "<uuid>",
  "context_id": "<uuid>",
  "to_agent": "sophia",
  "adapter": "openclaw",
  "mode": "pushed",
  "dispatched_at": "2026-04-19T..."
}
```

**Error codes:** `INVALID_BODY` (400), `UNKNOWN_AGENT` (404), `CONTENT_BLOCKED` (403), `ADAPTER_REJECTED` (502)

### 3.4 Adapter Pattern (`src/lib/dispatch/`)

```
adapter-factory.ts     selectAdapter(agent) → AgentAdapter
openclaw-adapter.ts    file-drop to ~/.openclaw/delivery-queue/<task_id>.json
hive-poll-adapter.ts   no-op; agent polls /api/hive (for hermes, claude-code, codex)
types.ts               DispatchTask, DispatchResult, AgentAdapter interfaces
build-agent-card.ts    buildAgentCard(agent) → A2A-spec AgentCard shape
derive-skills.ts       deriveSkills(role) → skills[] heuristic
```

Platform → adapter mapping:
- `openclaw` → `openclaw-adapter` (pushes file to `~/.openclaw/delivery-queue/`)
- `hermes | claude | codex | qwen | gemini` → `hive-poll-adapter` (agent polls)

### 3.5 Agent Polling Contract

Agents find their pending tasks via:
```
GET /api/hive?type=delegation&to_agent=<id>&status=pending&limit=1
```

Shell helper: `~/.hive/poll.sh <agent_id> [--once] [--interval N]`

Claim a task by POSTing back with `status: "active"`.

### 3.6 UI Components (`src/components/dispatch/`)

| Component | What it does |
|-----------|-------------|
| `dispatch-panel.tsx` | Form (agent selector, textarea, priority) + live delegation list (5s poll) |
| `lineage-drawer.tsx` | Slide-in sheet showing action timeline for a task_id |
| `agent-cards-panel.tsx` | Grid of A2A agent cards with runtime badge |

---

## 4. What Was Done in This Session

All commits to `main` today (newest first):

| Commit | Description |
|--------|-------------|
| `b018ba0` | **Fix agent platforms** — Alba=hermes, Sophia/Lucia/Gwen=openclaw, Maria=hermes. Runtime → Name display in all dropdowns + cards |
| `d4aa512` | **Plan 03 doc** — cancellation, context view, health-gated dispatch |
| `ac7229f` | Playwright e2e tests + `/api/tts` endpoint |
| `a6422c5` | Dispatch spec + plan-01/02 docs |
| `8e1b9c4` | Phase 20 planning docs updated |
| `2690541` | vitest e2e exclude, start.sh voice servers |
| `7f1972a` | AgentGrid sections, agent peers panel, model usage fix |
| `335c1db` | Memory Intelligence panel — consolidation model + InfoTooltip |
| `77a8267` | **VoicePanel rewrite** — streaming chat + voice tabs, agent selector, tests |
| `2ed6b97` | **Multi-agent ingestion** — Hermes, Qwen, Codex parsers; fix test isolation |
| `0012713` | `/dispatch` page + sidebar nav + AgentCardsPanel on Kitchen Floor |
| `15049d6` | DispatchPanel + AgentCardsPanel components + tests |
| `836a51f` | LineageDrawer sheet component + tests |
| `b3f6cb1` | useDelegations, useLineage, useAgentCards hooks |
| `ec6d422` | A2A agent card endpoints + buildAgentCard helper |
| `158a538` | AgentCardSkill type + deriveSkills heuristic |
| `7425691` | Extend /api/hive — canceled status, result field, lineage GET |
| `2857527` | POST /api/dispatch route + 9 E2E tests |
| `ecec353` | selectAdapter factory |
| `78e18c3` | openclaw file-drop adapter + tests |

---

## 5. What's Next — Plan 03

**File:** `docs/superpowers/plans/2026-04-19-polyglot-dispatch-plan-03.md`

Six tasks in priority order:

### Task 1 — `POST /api/dispatch/cancel` endpoint
Create `src/app/api/dispatch/cancel/route.ts`:

```typescript
// Request: { task_id?: string, context_id?: string, reason?: string }
// At least one of task_id/context_id required
// Response: { ok: true, canceled: N, task_ids: string[] }
// Logic: UPDATE hive_delegations SET status='canceled' WHERE status IN ('pending','active') AND ...
//        Write hive_action: action_type='stop', artifacts includes task_id + reason
```

Test file: `src/app/api/dispatch/cancel/__tests__/route.test.ts` (5 cases: by task_id, by context_id, already-terminal → 404, missing both → 400, unknown → 404)

### Task 2 — Cancel button in LineageDrawer
Modify `src/components/dispatch/lineage-drawer.tsx`:
- Add `useMutation` that calls `POST /api/dispatch/cancel`
- Show button only when `delegation.status === 'pending' | 'active'`
- Invalidate `["delegations"]` and `["lineage"]` queries on success

### Task 3 — Context view component
Create `src/components/dispatch/context-view.tsx`:
- Props: `{ contextId: string; onClose: () => void }`
- Calls `GET /api/hive?context_id=X&limit=200`
- Renders merged time-sorted timeline grouped by task_id
- Add `useContextLineage(contextId)` hook to `src/lib/api-client.ts`
- Tests: `src/components/dispatch/__tests__/context-view.test.tsx` (3 cases)

### Task 4 — "View whole context" link in LineageDrawer
Modify `src/components/dispatch/lineage-drawer.tsx`:
- Toggle `showContext` state
- When `lineage.context_id` exists, show "View whole context →" button
- Renders `<ContextView>` inline when toggled

### Task 5 — Health-gated dispatch
Modify `src/app/api/dispatch/route.ts`:
- Add optional `require_health?: boolean` to request body (default `false`)
- When `true`: call `pollRemoteAgent(agent)` before INSERT; return 503 `HEALTH_UNREACHABLE` if unreachable
- Add 2 test cases to existing dispatch test file

### Task 6 — Agent status badges on AgentCardsPanel
Modify `src/components/dispatch/agent-cards-panel.tsx`:
- Add colored dot (emerald=reachable, rose=unreachable, slate=unknown) next to agent name
- Source: `card.extensions.kitchen.reachable` (boolean | null)
- Title: "Online · Xms" / "Unreachable" / "Status unknown"

---

## 6. Key File Map

```
agents.config.json                  — Agent registry (id, name, platform, host, port)
src/lib/
  db-schema.ts                      — SQLite schema + migrations (initSchema)
  db.ts                             — getDb() singleton
  agent-registry.ts                 — getRemoteAgents(), pollRemoteAgent()
  dispatch/
    types.ts                        — DispatchTask, DispatchResult, AgentAdapter
    adapter-factory.ts              — selectAdapter(agent)
    openclaw-adapter.ts             — file-drop to ~/.openclaw/delivery-queue/
    hive-poll-adapter.ts            — no-op, mode:"queued"
    build-agent-card.ts             — buildAgentCard(agent) → A2A card
    derive-skills.ts                — role-string → skills[] heuristic
  constants.ts                      — POLL_INTERVALS, PLATFORM_LABELS, memory paths
  api-client.ts                     — all React Query hooks (useAgents, useDelegations, useLineage, useAgentCards, useHiveFeed, ...)
  content-scanner.ts                — scanContent(text) — content safety
  audit.ts                          — writeAuditLog(severity, action, detail)
src/app/
  page.tsx                          — Kitchen Floor (AgentGrid + HiveFeed)
  api/dispatch/route.ts             — POST /api/dispatch
  api/hive/route.ts                 — GET + POST /api/hive
  api/agents/cards/route.ts         — GET /api/agents/cards
  api/agents/[id]/card/route.ts     — GET /api/agents/:id/card
  dispatch/page.tsx                 — /dispatch page
src/components/
  dispatch/
    dispatch-panel.tsx              — form + live delegation list
    lineage-drawer.tsx              — task timeline sheet
    agent-cards-panel.tsx           — A2A card grid
  kitchen/
    agent-grid.tsx                  — Kitchen Floor grid (supports sections prop)
    hive-feed.tsx                   — color-coded action chip feed (5s poll)
  layout/sidebar.tsx                — nav items incl. "The Dispatch 📡"
src/types/index.ts                  — Agent, RemoteAgentConfig, AgentPlatform, AgentCard types
```

---

## 7. How to Run

```bash
# Dev (hot-reload, port 3000)
npm run dev

# Production (built, port 3002, all services)
npm run build && ./start.sh

# Tests
npx vitest run

# TypeScript check
npx tsc --noEmit

# E2E (Playwright, requires prod server on :3002)
npx playwright test
```

---

## 8. Architecture Constraints (Do Not Violate)

1. **Zero LLM calls in the dispatch path.** `/api/dispatch`, adapters, `selectAdapter`, lineage handlers are pure deterministic TypeScript. No Anthropic/OpenAI SDK in these files.
2. **Hive-as-queue.** `hive_delegations` IS the task queue. No Redis/BullMQ.
3. **No vendor lock-in.** The adapter pattern isolates per-runtime mechanics. Adding a new runtime = one new adapter file.
4. **Content scanning on all user input.** Any route accepting free text must run `scanContent()`.
5. **Idempotent schema migrations.** All `ALTER TABLE` calls wrapped in try/catch.

---

## 9. Codex Task Prompt (copy-paste ready)

```
You are working on the `agent-kitchen` Next.js project (branch: main, all 324 tests passing).

The project is a multi-agent coordination dashboard. You are implementing Plan 03 of the polyglot dispatch feature. The full plan is at: docs/superpowers/plans/2026-04-19-polyglot-dispatch-plan-03.md

Implement the following tasks in order. Run `npx vitest run` after each task and confirm green before moving to the next.

Task 1: POST /api/dispatch/cancel endpoint
- File to create: src/app/api/dispatch/cancel/route.ts
- Request: { task_id?: string, context_id?: string, reason?: string } — at least one required (400 if both absent)
- Logic: SELECT cancellable rows (status IN pending,active), return 404 if none found. Then UPDATE status='canceled', result=JSON(reason,canceled_at). Write hive_action(action_type='stop') per canceled task.
- Response: { ok:true, canceled:N, task_ids:string[] }
- Test file: src/app/api/dispatch/cancel/__tests__/route.test.ts (5 tests: by task_id, by context_id, terminal→404, missing both→400, unknown→404)

Task 2: Cancel button in src/components/dispatch/lineage-drawer.tsx
- Add useMutation calling POST /api/dispatch/cancel
- Show "Cancel task" button only when delegation.status is 'pending' or 'active'
- On success: invalidate ["delegations"] and ["lineage"] React Query keys

Task 3: Context view
- Create src/lib/api-client.ts export: useContextLineage(contextId) — queries GET /api/hive?context_id=X&limit=200
- Create src/components/dispatch/context-view.tsx — props {contextId, onClose} — renders merged timeline grouped by task_id using ACTION_COLORS from hive-feed.tsx
- Create src/components/dispatch/__tests__/context-view.test.tsx (3 tests)

Task 4: "View whole context" in lineage-drawer.tsx
- Toggle showContext state; show link when lineage.context_id exists; render <ContextView> when toggled

Task 5: Health-gated dispatch in src/app/api/dispatch/route.ts
- Add optional require_health boolean to body (default false)
- When true: call pollRemoteAgent(agent) first; return 503 HEALTH_UNREACHABLE if !reachable
- Add 2 test cases to src/app/api/dispatch/__tests__/route.test.ts

Task 6: Agent status badges in src/components/dispatch/agent-cards-panel.tsx
- Add colored dot beside agent name: emerald(reachable=true), rose(reachable=false), slate(null)
- Source: card.extensions.kitchen.reachable (boolean | null)

After all tasks: run npx vitest run (expect 324+ tests passing) and npx tsc --noEmit (expect no errors).
```

---

**End of handover report.**
