# Polyglot Agent Dispatch — Plan 03 (Cancellation + Context View + Polish)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the three deferred-but-spec'd features from the original dispatch design (§8): task cancellation endpoint + UI, full context view (multi-task conversation timeline), and production polish (health-gated dispatch, agent status badges on cards).

**Spec:** `docs/superpowers/specs/2026-04-19-polyglot-agent-dispatch-design.md` — see §8 (Out of Scope) for items this plan now promotes.

**Depends on:** Plan 01 (schema: `canceled` status ✅, `context_id` ✅) and Plan 02 (DispatchPanel ✅, LineageDrawer ✅).

**Tech Stack:** Next.js App Router, better-sqlite3, React Query, Tailwind, Vitest/RTL

---

## What Gets Built

| Feature | Files | Spec §ref |
|---------|-------|-----------|
| `POST /api/dispatch/cancel` endpoint | `src/app/api/dispatch/cancel/route.ts` + test | §8 deferred |
| Cancel button in LineageDrawer | `src/components/dispatch/lineage-drawer.tsx` edit | §6.3 stretch |
| Context view (`?context_id=X`) | `src/components/dispatch/context-view.tsx` + hook | §6.3 stretch |
| "View whole context" link in LineageDrawer | `src/components/dispatch/lineage-drawer.tsx` edit | §6.3 |
| Health-gated dispatch (optional, `require_health`) | `src/app/api/dispatch/route.ts` edit | §3.4 HEALTH_UNREACHABLE |
| Agent status badges on AgentCardsPanel | `src/components/dispatch/agent-cards-panel.tsx` edit | §5.2 `reachable` field |

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/app/api/dispatch/cancel/route.ts` | POST cancel — transitions `pending\|active` → `canceled` |
| Create | `src/app/api/dispatch/cancel/__tests__/route.test.ts` | 5 test cases |
| Create | `src/components/dispatch/context-view.tsx` | Full conversation timeline for a `context_id` |
| Create | `src/components/dispatch/__tests__/context-view.test.tsx` | RTL: renders merged timeline |
| Modify | `src/components/dispatch/lineage-drawer.tsx` | Add cancel button + "View whole context" link |
| Modify | `src/components/dispatch/agent-cards-panel.tsx` | Add reachable/latency badge per card |
| Modify | `src/app/api/dispatch/route.ts` | Add `require_health` guard (optional param, default false) |

---

## Task 1: `POST /api/dispatch/cancel` Endpoint

**Files:**
- Create: `src/app/api/dispatch/cancel/route.ts`

### Request body

```ts
interface CancelRequest {
  /** Cancel a single task. */
  task_id?: string;
  /** Cancel all tasks for a conversation. */
  context_id?: string;
  /** Reason stored in result JSON. Optional. */
  reason?: string;
}
// At least one of task_id or context_id is required (400 if both absent).
```

### Response body

```ts
interface CancelResponse {
  ok: true;
  canceled: number;   // rows transitioned
  task_ids: string[]; // which task_ids were canceled
}
// Error: { ok: false, error: string, code: "INVALID_BODY"|"NOT_FOUND"|"ALREADY_TERMINAL" }
```

### Logic

```
POST /api/dispatch/cancel:
  1. Parse body → require task_id OR context_id (400 INVALID_BODY if both absent).
  2. Build UPDATE:
       UPDATE hive_delegations
       SET status = 'canceled',
           result = json_object('reason', ?, 'canceled_at', ?)
       WHERE status IN ('pending', 'active')
         AND (task_id = ? OR context_id = ?);
     Collect affected task_ids from a preceding SELECT for the response.
  3. If 0 rows matched: return 404 NOT_FOUND.
  4. Write hive_action: agent_id='kitchen', action_type='stop',
       summary='Task canceled: ' || reason,
       artifacts=json_object('task_id', task_id, 'context_id', context_id, 'reason', reason).
  5. Return 200 { ok:true, canceled: N, task_ids: [...] }.
```

### Steps

- [ ] **Step 1: Create `src/app/api/dispatch/cancel/route.ts`**

  ```typescript
  import { NextRequest, NextResponse } from "next/server";
  import { getDb } from "@/lib/db-schema";

  export async function POST(req: NextRequest) {
    const body = await req.json() as { task_id?: string; context_id?: string; reason?: string };

    if (!body.task_id && !body.context_id) {
      return NextResponse.json({ ok: false, error: "task_id or context_id required", code: "INVALID_BODY" }, { status: 400 });
    }

    const db = getDb();
    const reason = body.reason ?? "canceled by kitchen";
    const canceledAt = new Date().toISOString();

    // Find cancellable rows first
    const rows = db.prepare(`
      SELECT task_id FROM hive_delegations
      WHERE status IN ('pending', 'active')
        AND (task_id = ? OR context_id = ?)
    `).all(body.task_id ?? null, body.context_id ?? null) as { task_id: string }[];

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "no cancellable tasks found", code: "NOT_FOUND" }, { status: 404 });
    }

    const resultJson = JSON.stringify({ reason, canceled_at: canceledAt });

    db.transaction(() => {
      db.prepare(`
        UPDATE hive_delegations
        SET status = 'canceled', result = ?
        WHERE status IN ('pending', 'active')
          AND (task_id = ? OR context_id = ?)
      `).run(resultJson, body.task_id ?? null, body.context_id ?? null);

      for (const row of rows) {
        db.prepare(`
          INSERT INTO hive_actions (agent_id, action_type, summary, artifacts)
          VALUES ('kitchen', 'stop', ?, ?)
        `).run(
          `Task canceled: ${reason}`,
          JSON.stringify({ task_id: row.task_id, context_id: body.context_id ?? null, reason })
        );
      }
    })();

    return NextResponse.json({ ok: true, canceled: rows.length, task_ids: rows.map(r => r.task_id) });
  }
  ```

- [ ] **Step 2: Write tests** — Create `src/app/api/dispatch/cancel/__tests__/route.test.ts`

  Test cases (5):
  1. Cancel by `task_id` — returns `{ ok:true, canceled:1, task_ids:[...] }`, row status=canceled
  2. Cancel by `context_id` — cancels all matching pending/active rows
  3. Already `completed` task — returns 404 NOT_FOUND (terminal states not touched)
  4. Missing both `task_id` and `context_id` — returns 400 INVALID_BODY
  5. Unknown `task_id` (no rows) — returns 404 NOT_FOUND

---

## Task 2: Cancel Button in LineageDrawer

**File:** Modify `src/components/dispatch/lineage-drawer.tsx`

- [ ] **Step 1: Add `useCancel` mutation**

  In the drawer, add a React Query mutation:

  ```typescript
  const cancelMutation = useMutation({
    mutationFn: (taskId: string) =>
      fetch("/api/dispatch/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, reason: "canceled from UI" }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delegations"] });
      queryClient.invalidateQueries({ queryKey: ["lineage"] });
    },
  });
  ```

- [ ] **Step 2: Render cancel button** — Only show when delegation status is `pending` or `active`.

  ```tsx
  {(lineage.delegation?.status === "pending" || lineage.delegation?.status === "active") && (
    <button
      onClick={() => cancelMutation.mutate(taskId)}
      disabled={cancelMutation.isPending}
      className="text-xs text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded px-2 py-1 hover:bg-rose-500/10 disabled:opacity-50 transition-colors"
    >
      {cancelMutation.isPending ? "Canceling…" : "Cancel task"}
    </button>
  )}
  ```

---

## Task 3: Context View Component

**Files:**
- Create: `src/components/dispatch/context-view.tsx`
- Create: `src/components/dispatch/__tests__/context-view.test.tsx`

The context view renders a merged, time-sorted timeline of all tasks and actions sharing a `context_id`.

- [ ] **Step 1: Add `useContextLineage(contextId)` hook**

  Add to `src/lib/api-client.ts`:

  ```typescript
  export function useContextLineage(contextId: string | null) {
    return useQuery({
      queryKey: ["context-lineage", contextId],
      queryFn: () =>
        fetch(`/api/hive?context_id=${contextId}&limit=200`)
          .then(r => r.json()),
      enabled: !!contextId,
    });
  }
  ```

- [ ] **Step 2: Create `src/components/dispatch/context-view.tsx`**

  Props: `{ contextId: string; onClose: () => void }`

  Renders:
  - Header: "Conversation: {contextId short}" + close button
  - Grouped by `task_id`: each group shows delegation summary row + actions timeline
  - Actions use same color chips as HiveFeed (`ACTION_COLORS`)
  - "No actions" empty state

- [ ] **Step 3: Write tests** (3 cases)
  1. Renders grouped tasks when data loaded
  2. Shows empty state when no actions
  3. Calls onClose when close button clicked

---

## Task 4: "View Whole Context" Link in LineageDrawer

**File:** Modify `src/components/dispatch/lineage-drawer.tsx`

- [ ] **Step 1: Add context view state**

  ```typescript
  const [showContext, setShowContext] = useState(false);
  ```

- [ ] **Step 2: Render link + context panel**

  Below the lineage header, if `lineage.context_id` is set:

  ```tsx
  {lineage.context_id && (
    <button
      onClick={() => setShowContext(v => !v)}
      className="text-xs text-sky-400 hover:underline"
    >
      {showContext ? "Hide context" : "View whole context →"}
    </button>
  )}
  {showContext && lineage.context_id && (
    <ContextView contextId={lineage.context_id} onClose={() => setShowContext(false)} />
  )}
  ```

---

## Task 5: Health-Gated Dispatch (optional param)

**File:** Modify `src/app/api/dispatch/route.ts`

Add optional `require_health?: boolean` to the request body. When `true`, probe the agent's `/health` endpoint before inserting the delegation row. On unreachable: return 503 HEALTH_UNREACHABLE. Default: `false` (existing behavior unchanged).

- [ ] **Step 1: Read `require_health` from request body**

  After step 2 in the existing routing logic (agent lookup), add:

  ```typescript
  if (body.require_health === true) {
    const health = await pollRemoteAgent(agent);
    if (!health.reachable) {
      return NextResponse.json({
        ok: false, error: "agent health endpoint unreachable", code: "HEALTH_UNREACHABLE"
      }, { status: 503 });
    }
  }
  ```

- [ ] **Step 2: Add test case** — Add to `src/app/api/dispatch/__tests__/route.test.ts`:

  - `require_health: true` + mock `pollRemoteAgent` returning `reachable:false` → 503 HEALTH_UNREACHABLE
  - `require_health: true` + `reachable:true` → 200 (passes through)

---

## Task 6: Agent Status Badges on AgentCardsPanel

**File:** Modify `src/components/dispatch/agent-cards-panel.tsx`

Each card already shows `reachable` from the A2A card. Polish the display:

- [ ] **Step 1: Add reachability badge**

  In the card render, add a status dot next to the agent name:

  ```tsx
  <span className={`inline-block h-2 w-2 rounded-full ${
    card.extensions.kitchen.reachable === true
      ? "bg-emerald-400"
      : card.extensions.kitchen.reachable === false
      ? "bg-rose-400"
      : "bg-slate-500"  // null = unknown
  }`} title={
    card.extensions.kitchen.reachable === true
      ? `Online · ${card.extensions.kitchen.latencyMs}ms`
      : card.extensions.kitchen.reachable === false
      ? "Unreachable"
      : "Status unknown"
  } />
  ```

---

## Verification Checklist

After all tasks complete:

- [ ] `POST /api/dispatch/cancel` with `task_id` transitions row to `canceled` and writes a `stop` action
- [ ] Cancel button appears in LineageDrawer for pending/active tasks and disappears after success
- [ ] "View whole context" link renders ContextView with all tasks sharing the context_id
- [ ] `POST /api/dispatch` with `require_health: true` returns 503 when agent is unreachable
- [ ] AgentCardsPanel shows green/red/grey dot per agent reachability
- [ ] `npx vitest run` — all tests pass
- [ ] `npx tsc --noEmit` — no TS errors

---

## Out of Scope for Plan 03

| Item | Reason |
|------|--------|
| Inbound A2A JSON-RPC server | Requires auth design first |
| Streaming / SSE on dispatch | Separate spec needed |
| Webhook fan-out | Separate phase |
| Explicit `parent_task_id` column | Context_id grouping sufficient |

---

**End of Plan 03.**
