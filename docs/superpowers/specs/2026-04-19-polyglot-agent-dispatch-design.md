# Polyglot Agent Dispatch — Design Spec

**Date:** 2026-04-19
**Repo:** `agent-kitchen`
**Author:** Luis Calderon (design), Claude (drafting)
**Supersedes:** none (extends Hive coordination in `2026-04-08-agent-kitchen-design.md`)

---

## 0. Executive Summary

The Kitchen already ships a working Hive bus (`hive_actions` append-only log + `hive_delegations` mutable task queue) backed by SQLite, a GET/POST `/api/hive` route, and an `agents.config.json` registry of 5 agents across 3 distinct runtimes (Claude Code, OpenClaw/Gwen, Hermes/Alba). This spec adds a **provider-agnostic dispatch layer** on top of the existing Hive so the Kitchen can push tasks to heterogeneous agent runtimes without embedding any vendor SDK.

**Design pillars:**

1. **Zero LLM tokens in the orchestration path.** Routing, adapter selection, lineage tracing, and status transitions are deterministic TypeScript. Tokens are spent only inside the agent runtimes when they actually work the task.
2. **Hive-as-queue.** `hive_delegations` IS the authoritative task queue. The Kitchen writes a row; agents poll `/api/hive?type=delegation&to_agent=X&status=pending`. No Redis, no BullMQ, no separate broker.
3. **Adapter pattern at the edges.** `AgentAdapter` isolates per-runtime push mechanics (HTTP post, file drop, hive-only) so adding a new runtime is one file.
4. **A2A compatibility layer.** Adopt Google's A2A (`@a2a-js/sdk`) field names — `task_id`, `context_id`, Agent Card — as the external contract over the existing Hive schema, without changing internal tables beyond two additive columns.
5. **Lineage on the existing audit log.** `hive_actions.artifacts` already stores JSON; we require a `task_id` field to stitch checkpoints/results into a chain with no new table.

Two execution phases follow (see §7): Plan 01 delivers the backend contract (schema, adapters, `/api/dispatch`, `~/.hive/poll.sh`, tests). Plan 02 delivers the UI (DispatchPanel, lineage feed, Agent Card endpoints).

---

## 1. Schema Additions

### 1.1 Columns added to `hive_delegations`

Two additive `ALTER TABLE` migrations inside `initSchema()` in `src/lib/db-schema.ts`, each wrapped in `try/catch` in the same style as the existing `messages.consolidated` migration:

```sql
ALTER TABLE hive_delegations ADD COLUMN context_id TEXT;
ALTER TABLE hive_delegations ADD COLUMN result     TEXT;
```

Semantics:

| Column       | Type | Nullable | Purpose |
|--------------|------|----------|---------|
| `context_id` | TEXT | yes      | A2A "context" identifier. Groups related tasks into one logical conversation/work unit. When a task chains (agent A delegates to B, B sub-delegates to C), all three rows share the same `context_id`. Distinct from `task_id` (per-task UUID). |
| `result`     | TEXT | yes      | JSON-serialized terminal result payload written by the agent when status transitions to `completed` or `failed`. Mirrors A2A `Task.artifacts[]` / `Task.status.message`. NULL until the task finishes. |

### 1.2 Status enum extension

The current `CHECK(status IN ('pending','active','paused','completed','failed'))` constraint is extended to add `'canceled'`. Because SQLite cannot modify a CHECK constraint in place, the migration uses the standard rebuild pattern, guarded by a one-shot `meta` flag so it runs at most once:

```sql
-- Only run if meta.hive_delegations_v2_migrated != '1'
CREATE TABLE hive_delegations_new (
  id            INTEGER PRIMARY KEY,
  task_id       TEXT    NOT NULL UNIQUE,
  from_agent    TEXT    NOT NULL,
  to_agent      TEXT    NOT NULL,
  task_summary  TEXT    NOT NULL,
  priority      INTEGER NOT NULL DEFAULT 5,
  status        TEXT    NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','active','paused','completed','failed','canceled')),
  checkpoint    TEXT,
  context_id    TEXT,
  result        TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
INSERT INTO hive_delegations_new SELECT id, task_id, from_agent, to_agent,
  task_summary, priority, status, checkpoint, NULL, NULL, created_at, updated_at
  FROM hive_delegations;
DROP TABLE hive_delegations;
ALTER TABLE hive_delegations_new RENAME TO hive_delegations;
-- Then set meta key
INSERT OR REPLACE INTO meta(key,value) VALUES('hive_delegations_v2_migrated','1');
```

Status machine after migration:

```
pending ─► active ─► completed
   │         │   └─► failed
   │         └─► paused ─► active (resume)
   │
   └─► canceled   (allowed from any non-terminal state)
```

Terminal states: `completed`, `failed`, `canceled`. A canceled task MUST NOT be transitioned back.

### 1.3 Indexes

Add two indexes alongside the existing `hive_delegations_to_agent`:

```sql
CREATE INDEX IF NOT EXISTS hive_delegations_context
  ON hive_delegations(context_id);
CREATE INDEX IF NOT EXISTS hive_delegations_status_priority
  ON hive_delegations(status, priority DESC, created_at ASC);
```

`hive_delegations_context` powers the lineage query. `hive_delegations_status_priority` powers the "next pending task for agent X" lookup that `poll.sh` issues every second.

### 1.4 No changes to `hive_actions`

`hive_actions.artifacts` is already `TEXT` (JSON). Lineage tracing (§6) is implemented by requiring dispatchers and agents to put `task_id` (and optionally `context_id`) inside that JSON blob. No DDL change.

---

## 2. Adapter Interface

### 2.1 Shared types

New file: `src/lib/dispatch/types.ts`

```ts
import type { AgentPlatform } from "@/types";

/**
 * DispatchTask is the provider-agnostic payload the Kitchen hands to an adapter.
 * It is derived from — not equal to — a hive_delegations row. Adapters translate
 * it into whatever on-wire format their target runtime expects.
 */
export interface DispatchTask {
  /** UUID generated by dispatch route. Equal to hive_delegations.task_id. */
  task_id: string;
  /** A2A context identifier. Groups related tasks. Equal to hive_delegations.context_id. */
  context_id: string;
  /** Originating agent id (may be "kitchen" for human-initiated dispatches). */
  from_agent: string;
  /** Target agent id from agents.config.json. */
  to_agent: string;
  /** Plain-text task description. Already passed through scanContent(). */
  task_summary: string;
  /** Optional structured input. Adapter decides how to serialize. */
  input?: Record<string, unknown>;
  /** 1 (highest) .. 9 (lowest). Default 5. */
  priority: number;
  /** ISO-8601 instant the dispatch row was written. */
  dispatched_at: string;
}

/**
 * DispatchResult is what an adapter returns AFTER it has made its best effort
 * to deliver the task. It does NOT reflect task completion — only delivery.
 */
export interface DispatchResult {
  /** True if the adapter accepted the task for delivery. */
  accepted: boolean;
  /** "pushed" — adapter delivered out-of-band (HTTP/file).
   *  "queued" — adapter wrote only to hive; agent will poll.
   *  "rejected" — adapter refused (e.g., unreachable, misconfigured). */
  mode: "pushed" | "queued" | "rejected";
  /** Human-readable diagnostic written into hive_actions.summary. */
  detail: string;
  /** Optional transport-level evidence (filesystem path, HTTP status, etc.). */
  evidence?: Record<string, unknown>;
}

export interface AgentAdapter {
  /** Platform value(s) this adapter handles. Used by the factory. */
  readonly platform: AgentPlatform | AgentPlatform[];
  /** Stable adapter name for logs: "openclaw", "hive-poll", etc. */
  readonly name: string;
  /** Deliver the task. MUST be idempotent on task_id. */
  dispatch(task: DispatchTask): Promise<DispatchResult>;
}
```

### 2.2 `openclaw-adapter.ts`

New file: `src/lib/dispatch/openclaw-adapter.ts`

**Responsibility:** Drop a JSON envelope into `~/.openclaw/delivery-queue/` so the OpenClaw runtime picks it up on its next sweep. Gwen currently runs under this model.

**Selection rule:** `platform === "opencode"` OR (future) `platform === "openclaw"`. For now `agents.config.json` uses `"opencode"` for Alba/Gwen-style runtimes.

```ts
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { AgentAdapter, DispatchTask, DispatchResult } from "./types";

const QUEUE_DIR =
  process.env.OPENCLAW_QUEUE_DIR ??
  path.join(os.homedir(), ".openclaw", "delivery-queue");

interface OpenClawEnvelope {
  version: "1";
  task_id: string;
  context_id: string;
  from_agent: string;
  to_agent: string;
  task_summary: string;
  input?: Record<string, unknown>;
  priority: number;
  dispatched_at: string;
  /** Where the agent should POST checkpoints/results. */
  hive_endpoint: string;
}

export const openclawAdapter: AgentAdapter = {
  platform: "opencode",
  name: "openclaw",
  async dispatch(task: DispatchTask): Promise<DispatchResult> {
    const envelope: OpenClawEnvelope = {
      version: "1",
      task_id: task.task_id,
      context_id: task.context_id,
      from_agent: task.from_agent,
      to_agent: task.to_agent,
      task_summary: task.task_summary,
      input: task.input,
      priority: task.priority,
      dispatched_at: task.dispatched_at,
      hive_endpoint:
        process.env.HIVE_PUBLIC_URL ??
        "https://kitchen.epiloguecapital.com/api/hive",
    };
    const file = path.join(QUEUE_DIR, `${task.task_id}.json`);
    try {
      await fs.mkdir(QUEUE_DIR, { recursive: true });
      // Write-then-rename for atomicity — OpenClaw may be watching the dir.
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(envelope, null, 2), "utf-8");
      await fs.rename(tmp, file);
      return {
        accepted: true,
        mode: "pushed",
        detail: `Dropped task ${task.task_id} in OpenClaw queue for ${task.to_agent}`,
        evidence: { path: file },
      };
    } catch (err) {
      return {
        accepted: false,
        mode: "rejected",
        detail: `OpenClaw queue write failed: ${(err as Error).message}`,
        evidence: { path: file },
      };
    }
  },
};
```

**Idempotency:** Writing the same `task_id.json` twice overwrites the same file — OpenClaw consumes the envelope and deletes the file on pickup, so a replay is harmless. If the file still exists from a prior attempt, the write-then-rename simply refreshes it.

### 2.3 `hive-poll-adapter.ts`

New file: `src/lib/dispatch/hive-poll-adapter.ts`

**Responsibility:** The null adapter. Returns `mode: "queued"` and relies entirely on the agent polling `/api/hive?type=delegation&to_agent=X&status=pending`. Used for Claude Code instances (local and Tailscale) and any agent whose runtime can't accept a push.

**Selection rule:** default for any platform not claimed by another adapter (`claude`, `codex`, `qwen`, `gemini`).

```ts
import type { AgentAdapter, DispatchTask, DispatchResult } from "./types";

export const hivePollAdapter: AgentAdapter = {
  platform: ["claude", "codex", "qwen", "gemini"],
  name: "hive-poll",
  async dispatch(task: DispatchTask): Promise<DispatchResult> {
    // The dispatch route has already written the hive_delegations row.
    // There is nothing to push — the agent's poll.sh loop will see it
    // within its polling interval (default 2s).
    return {
      accepted: true,
      mode: "queued",
      detail: `Task ${task.task_id} queued in hive for ${task.to_agent}; awaits poll.`,
    };
  },
};
```

### 2.4 Adapter factory

New file: `src/lib/dispatch/adapter-factory.ts`

```ts
import type { AgentPlatform, RemoteAgentConfig } from "@/types";
import type { AgentAdapter } from "./types";
import { openclawAdapter } from "./openclaw-adapter";
import { hivePollAdapter } from "./hive-poll-adapter";

const ADAPTERS: AgentAdapter[] = [openclawAdapter, hivePollAdapter];

/**
 * Selects the adapter for a given agent. Resolution rules:
 *   1. First adapter whose `platform` matches agent.platform (string or array).
 *   2. Fallback: hivePollAdapter.
 * Selection is O(adapters); adapters array is fixed at build time.
 */
export function selectAdapter(agent: RemoteAgentConfig): AgentAdapter {
  const want: AgentPlatform = agent.platform;
  for (const a of ADAPTERS) {
    const p = a.platform;
    if (Array.isArray(p) ? p.includes(want) : p === want) return a;
  }
  return hivePollAdapter;
}
```

**Platform → adapter map (current agent roster):**

| Agent  | `platform`   | Adapter          | Mode     |
|--------|--------------|------------------|----------|
| sophia | `claude`     | `hive-poll`      | queued   |
| maria  | `claude`     | `hive-poll`      | queued   |
| lucia  | `claude`     | `hive-poll`      | queued   |
| alba   | `opencode`   | `openclaw`       | pushed   |
| gwen   | `claude`     | `hive-poll`      | queued   |

Note: Gwen's config says `platform: "claude"` because the *model* is Claude; her *runtime* is OpenClaw. If/when Luis wants Gwen pushed via file-queue, flip her `platform` to `"opencode"` in `agents.config.json`. No code change required.

---

## 3. `/api/dispatch` Route

New file: `src/app/api/dispatch/route.ts`.

### 3.1 Request body

```ts
interface DispatchRequest {
  /** Target agent id. Must exist in agents.config.json. */
  to_agent: string;
  /** Originating agent id. Defaults to "kitchen" if omitted. */
  from_agent?: string;
  /** Plain-text task description. Required. Scanned by scanContent(). */
  task_summary: string;
  /** Optional structured input handed to the adapter. */
  input?: Record<string, unknown>;
  /** 1..9, default 5. */
  priority?: number;
  /**
   * Existing context_id to chain onto. If omitted, the route generates a new
   * UUIDv4 and treats this as a new conversation.
   */
  context_id?: string;
  /**
   * Optional pre-generated task_id (for deterministic replay/testing).
   * If omitted, route generates UUIDv4.
   */
  task_id?: string;
}
```

### 3.2 Response body

```ts
interface DispatchResponse {
  ok: true;
  task_id: string;
  context_id: string;
  to_agent: string;
  adapter: string;            // e.g., "openclaw" | "hive-poll"
  mode: "pushed" | "queued";  // "rejected" is surfaced as 4xx/5xx, not ok:true
  dispatched_at: string;      // ISO-8601
}
// Error shape (4xx/5xx):
interface DispatchError {
  ok: false;
  error: string;
  code:
    | "UNKNOWN_AGENT"
    | "INVALID_BODY"
    | "CONTENT_BLOCKED"
    | "ADAPTER_REJECTED"
    | "HEALTH_UNREACHABLE";
  detail?: Record<string, unknown>;
}
```

### 3.3 Routing logic (pseudocode)

```
POST /api/dispatch:
  1. Parse JSON body → DispatchRequest.
     Reject 400 INVALID_BODY if task_summary missing, priority out of range,
     or to_agent missing.

  2. Look up target agent via getRemoteAgents().find(a => a.id === to_agent).
     Reject 404 UNKNOWN_AGENT if not found.

  3. Run scanContent(task_summary) (same pattern as /api/hive POST).
     On scan.blocked → writeAuditLog(severity='high'), return 403 CONTENT_BLOCKED.
     On matches → writeAuditLog(severity='medium'), continue with cleaned content.

  4. Generate task_id = body.task_id ?? crypto.randomUUID().
     Generate context_id = body.context_id ?? crypto.randomUUID().
     dispatched_at = new Date().toISOString().
     priority = body.priority ?? 5. Clamp to [1,9].

  5. BEGIN TRANSACTION:
       INSERT INTO hive_delegations(task_id, from_agent, to_agent,
         task_summary, priority, status, checkpoint, context_id, result)
         VALUES (..., 'pending', NULL, context_id, NULL)
         ON CONFLICT(task_id) DO NOTHING;
       -- If the ON CONFLICT path fires, we treat this as idempotent replay
       -- and re-invoke the adapter without a second write.

       INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
         VALUES (from_agent, 'trigger',
                 'Dispatch: ' || task_summary_preview,
                 json_object('task_id', task_id,
                             'context_id', context_id,
                             'to_agent', to_agent,
                             'adapter', adapter.name,
                             'direction', 'outbound'));
     COMMIT.

  6. adapter = selectAdapter(agent).
     result = await adapter.dispatch({task_id, context_id, from_agent, to_agent,
                                      task_summary, input, priority, dispatched_at}).

  7. If !result.accepted:
        INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
          VALUES (from_agent, 'error', result.detail,
                  json_object('task_id', task_id, 'adapter', adapter.name));
        UPDATE hive_delegations SET status='failed', result=result.detail
          WHERE task_id=task_id;
        Return 502 ADAPTER_REJECTED with detail=result.evidence.

  8. Return 200 DispatchResponse { ok:true, task_id, context_id, to_agent,
                                   adapter: adapter.name, mode: result.mode,
                                   dispatched_at }.
```

### 3.4 Error cases — full table

| Condition                                  | HTTP | `code`               | Side effects |
|--------------------------------------------|------|----------------------|--------------|
| `to_agent` missing or `task_summary` missing | 400  | `INVALID_BODY`       | none |
| `priority` < 1 or > 9                      | 400  | `INVALID_BODY`       | none |
| Agent id not in registry                   | 404  | `UNKNOWN_AGENT`      | none |
| `scanContent().blocked === true`           | 403  | `CONTENT_BLOCKED`    | audit_log high |
| Adapter throws or returns `accepted:false` | 502  | `ADAPTER_REJECTED`   | hive_action error + delegation status=failed |
| (Optional, Phase 2) agent `/health` unreachable when `require_health=true` | 503 | `HEALTH_UNREACHABLE` | audit_log info |

`HEALTH_UNREACHABLE` is deferred to Plan 02 — by default, Plan 01 does NOT gate dispatch on health. The queue-first model means a dead agent just gets a backlog.

### 3.5 No LLM calls in this path

The entire route is deterministic TS: UUID, DB insert, adapter call. No provider SDK is imported. Violating this constraint is a blocking review issue.

---

## 4. Agent Polling Contract

### 4.1 How agents find their pending tasks

`GET /api/hive?type=delegation&to_agent={id}&status={status}&limit={n}`

The existing route already supports `type=delegation&agent=X`. Plan 01 extends it with two additional query params:

| Param      | Type    | Default  | Effect |
|------------|---------|----------|--------|
| `to_agent` | string  | null     | Filter by `hive_delegations.to_agent`. (Alias: `agent`.) |
| `status`   | string  | null     | Filter by `hive_delegations.status`. Must be a valid enum value or 400. |
| `limit`    | integer | 20       | As today. |
| `priority` | int     | null     | Optional `priority <= N` filter for fair queuing. |

Ordering: `ORDER BY priority ASC, created_at ASC` when `status=pending`, else `created_at DESC`.

Response (unchanged shape):

```json
{
  "delegations": [
    {
      "id": 42,
      "task_id": "7b7f...",
      "from_agent": "kitchen",
      "to_agent": "sophia",
      "task_summary": "Draft blog post on ...",
      "priority": 5,
      "status": "pending",
      "checkpoint": null,
      "context_id": "a1a2...",
      "result": null,
      "created_at": "2026-04-19T14:32:10Z",
      "updated_at": "2026-04-19T14:32:10Z"
    }
  ],
  "timestamp": "2026-04-19T14:32:11Z"
}
```

### 4.2 How an agent claims a task

The agent transitions a task from `pending` → `active` by POSTing to `/api/hive` with the delegation body shape (already supported — the route upserts `status` and `checkpoint` on conflict):

```http
POST /api/hive
Content-Type: application/json

{
  "type": "delegation",
  "task_id": "7b7f-...",
  "from_agent": "kitchen",
  "to_agent": "sophia",
  "task_summary": "<same as before>",
  "priority": 5,
  "status": "active",
  "checkpoint": { "step": "claim", "ts": "2026-04-19T14:32:12Z" }
}
```

The existing `ON CONFLICT(task_id) DO UPDATE SET status, checkpoint, updated_at` clause makes the claim idempotent. **Race window:** the GET/POST pair is not transactional, so two agents *could* both claim the same task. Mitigation: only the `to_agent` field's agent should ever poll for its own tasks, and `to_agent` is unique per delegation. Cross-agent claim collisions are not a supported failure mode.

### 4.3 How an agent posts checkpoints

Any time during execution, the agent POSTs a `checkpoint` action to `/api/hive` with `task_id` in `artifacts`:

```http
POST /api/hive
{
  "agent_id": "sophia",
  "action_type": "checkpoint",
  "summary": "Fetched 12 sources, composing outline",
  "artifacts": {
    "task_id": "7b7f-...",
    "context_id": "a1a2-...",
    "progress": 0.4,
    "step": "outline"
  },
  "session_id": "claude-sess-..."
}
```

The `task_id` inside `artifacts` is what §6 uses to reconstruct lineage.

### 4.4 How an agent posts results

On terminal state the agent performs **two** requests in order:

1. POST a `stop` action (for the audit log and lineage):

```http
POST /api/hive
{
  "agent_id": "sophia",
  "action_type": "stop",
  "summary": "Draft complete; 1,240 words, 12 sources cited",
  "artifacts": {
    "task_id": "7b7f-...",
    "context_id": "a1a2-...",
    "outcome": "completed",
    "result_url": "https://..."
  }
}
```

2. PATCH the delegation row by POSTing to `/api/hive` with `status=completed` (or `failed`, `canceled`) and the `result` payload. The existing route's upsert already accepts a `status` change; Plan 01 extends the `type: 'delegation'` branch to accept an optional `result` field (JSON, stringified to TEXT before storage):

```http
POST /api/hive
{
  "type": "delegation",
  "task_id": "7b7f-...",
  "from_agent": "kitchen",
  "to_agent": "sophia",
  "task_summary": "<unchanged>",
  "status": "completed",
  "result": {
    "artifacts": [{ "type": "markdown", "url": "https://..." }],
    "metrics": { "tokens_in": 12400, "tokens_out": 3200, "duration_ms": 84200 }
  }
}
```

Terminal-state invariants:

- `status=completed` → `result.artifacts` SHOULD be non-empty.
- `status=failed` → `result.error` (string) is REQUIRED.
- `status=canceled` → `result.reason` (string) is RECOMMENDED.

### 4.5 `~/.hive/poll.sh` — exact contract

New script: `~/.hive/poll.sh`. Installed alongside `~/.hive/post.sh`.

**Purpose:** A bash poll loop that lets any shell-level agent runtime (Claude Code, Codex, plain cron) discover and claim its next task.

**Usage:**

```
poll.sh <agent_id> [--once] [--interval SECONDS] [--status STATUS] [--limit N]
```

| Flag                | Default       | Meaning |
|---------------------|---------------|---------|
| `<agent_id>`        | required      | Which agent's queue to watch. Maps to `to_agent`. |
| `--once`            | off           | Perform a single GET and exit 0 (task available) / 1 (none). |
| `--interval SECONDS`| 2             | Sleep seconds between polls in loop mode. |
| `--status STATUS`   | `pending`     | Which status to watch for. |
| `--limit N`         | 1             | Max rows returned per poll. |

**Output contract:**

- On finding a task, `poll.sh` prints a single line of JSON on stdout containing the full delegation row, then exits 0:
  `{"task_id":"...","to_agent":"sophia","task_summary":"...","priority":5,"context_id":"...","checkpoint":null}`
- On no task (loop mode never returns this; `--once` exits 1 with no stdout).
- On HTTP/network error, prints `ERR: <message>` to stderr and exits 2.

**Behavior in loop mode (default):**

Loops until it finds one task, prints it to stdout, and exits 0. The *caller* decides what to do next (typically: feed the JSON into the agent runtime, then loop back). `poll.sh` does NOT claim the task — claiming is an explicit second step so the caller can reject it (e.g., if the CLI is busy).

**Environment variables:**

| Var             | Default                                            |
|-----------------|----------------------------------------------------|
| `HIVE_URL`      | `https://kitchen.epiloguecapital.com/api/hive`     |
| `HIVE_TIMEOUT`  | `5` (curl `--max-time`)                            |

**Reference implementation (MUST match spec; line count ~40):**

```bash
#!/bin/bash
# ~/.hive/poll.sh — poll the hive for a pending task for one agent
set -eu
AGENT_ID="${1:-}"
shift || true
[ -z "$AGENT_ID" ] && { echo "Usage: poll.sh <agent_id> [flags]" >&2; exit 64; }

ONCE=0 ; INTERVAL=2 ; STATUS="pending" ; LIMIT=1
while [ $# -gt 0 ]; do
  case "$1" in
    --once)      ONCE=1 ; shift ;;
    --interval)  INTERVAL="$2" ; shift 2 ;;
    --status)    STATUS="$2"  ; shift 2 ;;
    --limit)     LIMIT="$2"   ; shift 2 ;;
    *) echo "Unknown flag: $1" >&2 ; exit 64 ;;
  esac
done

HIVE_URL="${HIVE_URL:-https://kitchen.epiloguecapital.com/api/hive}"
HIVE_TIMEOUT="${HIVE_TIMEOUT:-5}"
URL="${HIVE_URL}?type=delegation&to_agent=${AGENT_ID}&status=${STATUS}&limit=${LIMIT}"

poll_once() {
  local body
  body="$(curl -s --max-time "$HIVE_TIMEOUT" "$URL")" || { echo "ERR: curl failed" >&2; return 2; }
  # Extract first delegation, or empty string. Requires python3 (already req'd by post.sh).
  python3 -c "
import json,sys
d=json.loads(sys.stdin.read() or '{}')
rows=d.get('delegations',[])
sys.exit(1) if not rows else print(json.dumps(rows[0]))
" <<<"$body"
}

if [ "$ONCE" -eq 1 ]; then poll_once ; exit $?; fi
while true; do
  out="$(poll_once)" && { echo "$out"; exit 0; } || true
  sleep "$INTERVAL"
done
```

The script is installed into `~/.hive/poll.sh` with `chmod 755` by Plan 01's install step (added to `src/scripts/install-hive.sh` or equivalent — see Plan 01 tasks).

---

## 5. A2A Integration (Phase 2 foundation)

### 5.1 What `context_id` enables

`context_id` is the A2A-compatible "conversation" key. It enables three things:

1. **Multi-turn tasks.** A subsequent dispatch can pass `context_id: <existing>` to link a new task to an existing conversation. The handler agent sees the same context across tasks and can load prior artifacts.
2. **Sub-delegation chains.** When agent A accepts task T1 and creates task T2 for agent B, A SHOULD set T2's `context_id = T1.context_id`. The UI (§6) renders the chain as a tree.
3. **Cancellation scope.** A future `POST /api/dispatch/cancel` accepts either `task_id` (cancel one) or `context_id` (cancel the whole conversation). Not in Plan 01, but the schema permits it.

### 5.2 Agent Card endpoint

New route: `src/app/api/agents/[id]/card/route.ts`. Delivers the Google A2A Agent Card JSON per the A2A spec, constructed from `agents.config.json` plus dynamic `/health` data.

**Endpoint:** `GET /api/agents/{id}/card`

**Response (A2A-spec-aligned):**

```ts
interface AgentCard {
  /** A2A required. */
  name: string;                    // from agents.config.json "name"
  description: string;             // from "role"
  version: "1";                    // schema version
  /** Where an external A2A client sends tasks. */
  url: string;                     // e.g., "https://kitchen.epiloguecapital.com/api/dispatch"
  /** Capabilities. */
  capabilities: {
    streaming: false;              // Plan 01; enable when SSE lands
    pushNotifications: true;       // via hive_actions
    stateTransitionHistory: true;  // via hive_actions filtered by task_id
  };
  /** Auth config. */
  authentication: { schemes: ["none"] };  // internal-only for now
  /** Skills the agent claims. Derived from agents.config.json "role" + "platform".
   *  Plan 02 can extend this with an explicit `skills[]` array in config. */
  skills: Array<{
    id: string;           // e.g., "marketing-copy"
    name: string;
    description: string;
    tags: string[];       // e.g., ["marketing", "claude"]
    inputModes: ["text"];
    outputModes: ["text"];
  }>;
  /** Non-standard, agent-kitchen extension. */
  extensions: {
    kitchen: {
      id: string;                                   // agent id
      platform: "claude"|"codex"|"qwen"|"gemini"|"opencode";
      location: "local"|"tailscale"|"cloudflare";
      dispatchEndpoint: string;                     // same as url above
      pollEndpoint: string;                         // "/api/hive?type=delegation&to_agent=<id>"
      healthEndpoint: string;                       // from config
      reachable: boolean | null;                    // from live pollRemoteAgent
      latencyMs: number | null;
      lastCheck: string;                            // ISO-8601
    };
  };
}
```

**Construction:**

```ts
const agent = getRemoteAgents().find(a => a.id === params.id);
if (!agent) return 404;
const health = await pollRemoteAgent(agent);    // existing helper
const base = process.env.KITCHEN_PUBLIC_URL ?? "https://kitchen.epiloguecapital.com";
return Response.json({
  name: agent.name,
  description: agent.role,
  version: "1",
  url: `${base}/api/dispatch`,
  capabilities: { streaming:false, pushNotifications:true, stateTransitionHistory:true },
  authentication: { schemes: ["none"] },
  skills: deriveSkills(agent),         // see §5.3
  extensions: {
    kitchen: {
      id: agent.id,
      platform: agent.platform,
      location: agent.location,
      dispatchEndpoint: `${base}/api/dispatch`,
      pollEndpoint: `${base}/api/hive?type=delegation&to_agent=${agent.id}`,
      healthEndpoint: agent.healthEndpoint,
      reachable: health.reachable,
      latencyMs: health.latencyMs,
      lastCheck: new Date().toISOString(),
    },
  },
});
```

**Index endpoint** (Plan 02): `GET /api/agents/cards` returns an array of all cards (one per registered agent).

### 5.3 `deriveSkills()` — Plan 02 helper

Initial heuristic (role-string based), superseded when an explicit `skills[]` is added to `agents.config.json`:

| Role substring       | Synthesized skill                           |
|----------------------|---------------------------------------------|
| "Marketing"          | `{id:"marketing-copy", name:"Marketing copywriting", tags:["marketing"]}` |
| "Content"            | `{id:"content-writing", name:"Long-form content", tags:["content"]}` |
| "Ops"                | `{id:"ops", name:"Operational tasks", tags:["ops"]}` |
| "Coordinator"/"Head" | `{id:"delegation", name:"Task routing", tags:["coordination"]}` |
| "Social"             | `{id:"social-posts", name:"Short-form social", tags:["social"]}` |

Plan 02 adds `skills?: Skill[]` to `RemoteAgentConfig` and `agents.config.json`; when present it overrides the heuristic.

### 5.4 How this maps to A2A without breaking internals

- **External surface**: `/api/dispatch` (POST-to-send) and `/api/agents/{id}/card` (discovery) speak A2A field names (`task_id`, `context_id`, `skills[]`, `capabilities`).
- **Internal surface**: `hive_actions`, `hive_delegations`, `/api/hive` unchanged except for the two additive columns. Nothing internal depends on `@a2a-js/sdk`.
- **SDK usage**: Plan 02 MAY import `@a2a-js/sdk` inside `/api/agents/[id]/card/route.ts` purely for type checking the emitted card shape. If the SDK's types drift from our extension, we keep our own `AgentCard` type (shown in §5.2) and do not force a dependency.
- **No inbound A2A server in Plan 01 or 02**: We do not expose an A2A JSON-RPC endpoint that accepts third-party tasks. That is a separate future phase (requires auth design first).

---

## 6. Task Lineage Tracing

### 6.1 How `task_id` chains through `hive_actions.artifacts`

Every dispatch-related `hive_actions` row MUST carry a JSON `artifacts` field containing at minimum:

```json
{ "task_id": "<uuid>", "context_id": "<uuid>" }
```

Plus optionally: `direction` (`"outbound"|"inbound"`), `adapter`, `progress`, `outcome`, `step`.

Callers responsible:

- `/api/dispatch` writes the initial `action_type=trigger` row.
- Agent (via `post.sh`) writes `action_type=checkpoint` rows during work.
- Agent (via `post.sh`) writes the terminal `action_type=stop` or `action_type=error` row.
- (Optional) Sub-delegations: when agent A dispatches to B mid-task, `/api/dispatch` naturally writes a new `trigger` action with the same `context_id` and a new `task_id`, making parent/child relationships queryable via `context_id`.

**Parent/child linkage:** At Plan 01 level there is NO explicit `parent_task_id` column. Hierarchy is flat-via-shared-`context_id`. Plan 02 MAY add `parent_task_id` to `hive_delegations` if the UI demands a true tree; for now the "tree" is rendered as a time-ordered list grouped by context.

### 6.2 New GET filter: `/api/hive?task_id=X`

Extends the existing GET handler in `src/app/api/hive/route.ts`. New query params:

| Param        | Effect |
|--------------|--------|
| `task_id`    | Return full lineage: one `hive_delegations` row + all `hive_actions` rows whose `json_extract(artifacts,'$.task_id') = ?`, ordered by timestamp ASC. |
| `context_id` | Return all delegations and actions for a conversation. Same JOIN approach, grouped by `task_id`. |

**Response shape** (new):

```ts
interface LineageResponse {
  task_id: string;
  context_id: string | null;
  delegation: {
    task_id: string;
    from_agent: string;
    to_agent: string;
    task_summary: string;
    status: "pending"|"active"|"paused"|"completed"|"failed"|"canceled";
    priority: number;
    checkpoint: unknown | null;
    result: unknown | null;
    created_at: string;
    updated_at: string;
    context_id: string | null;
  } | null;
  actions: Array<{
    id: number;
    agent_id: string;
    action_type: "continue"|"loop"|"checkpoint"|"trigger"|"stop"|"error";
    summary: string;
    artifacts: Record<string, unknown> | null;  // already JSON.parsed
    timestamp: string;
  }>;
  timestamp: string;
}
```

**SQL** (uses SQLite's built-in `json_extract`):

```sql
-- Delegation lookup
SELECT * FROM hive_delegations WHERE task_id = ?;

-- Action chain
SELECT id, agent_id, action_type, summary, artifacts, timestamp
FROM hive_actions
WHERE json_extract(artifacts, '$.task_id') = ?
ORDER BY timestamp ASC, id ASC;

-- Context-wide chain
SELECT id, agent_id, action_type, summary, artifacts, timestamp
FROM hive_actions
WHERE json_extract(artifacts, '$.context_id') = ?
ORDER BY timestamp ASC, id ASC;
```

Existing `q` and `agent` params are ignored when `task_id` or `context_id` is present (explicit, precedence-based routing in the handler).

### 6.3 DispatchPanel UI component (Plan 02)

New component: `src/components/dispatch/dispatch-panel.tsx`. Mounted on the existing `/flow` page next to `VoicePanel`, or on a dedicated `/dispatch` route — Plan 02 decides UX placement.

**Responsibilities, in priority order:**

1. **Dispatch form.** Fields: target agent (dropdown, pulls from `/api/agents` or inline from registry), task summary (textarea), priority (slider 1-9), optional JSON input (collapsible). Submit button POSTs to `/api/dispatch`. On success, toast with `task_id`; on failure, toast with `error.code` + `detail`.
2. **Live delegation list.** Pulls `GET /api/hive?type=delegation&limit=50` every 5 s via React Query. Groups rows by `to_agent`. Each row renders: task_id (short), summary preview, status badge (color-coded), priority, age.
3. **Lineage drawer.** Clicking a row opens a drawer calling `GET /api/hive?task_id=X`. Renders:
    - Delegation header (status, priority, from → to, timestamps)
    - Timeline of actions (icons per action_type; summary; artifacts JSON collapsible)
    - Result panel (if `result` non-null): pretty-printed JSON
    - "Cancel" button (Plan 02 stretch — wires to future cancel endpoint)
4. **Context view** (Plan 02 stretch). When a lineage includes sub-delegations (multiple `task_id`s share a `context_id`), a "View whole context" link calls `GET /api/hive?context_id=X` and renders a time-sorted merged timeline.

Polling and render cost: all queries are FTS-indexed or PK-indexed; panel should stay under 200 ms round-trip for typical loads (<1000 open delegations).

---

## 7. Execution Phases

This spec maps to exactly two GSD plans. Each plan is atomic, independently verifiable, and leaves `main` green.

### 7.1 Plan 01 — Backend: Schema + Adapters + Dispatch + Poll + Tests

**Deliverables:**

1. `src/lib/db-schema.ts` — `ALTER TABLE` migrations for `context_id`, `result`, status CHECK rebuild, two new indexes (`hive_delegations_context`, `hive_delegations_status_priority`), `meta.hive_delegations_v2_migrated` gate.
2. `src/lib/dispatch/types.ts` — `DispatchTask`, `DispatchResult`, `AgentAdapter`.
3. `src/lib/dispatch/openclaw-adapter.ts` — file-queue adapter for `opencode` platform.
4. `src/lib/dispatch/hive-poll-adapter.ts` — null adapter for `claude|codex|qwen|gemini`.
5. `src/lib/dispatch/adapter-factory.ts` — `selectAdapter(agent)` resolver.
6. `src/app/api/dispatch/route.ts` — POST handler per §3.
7. `src/app/api/hive/route.ts` — GET handler extended with `task_id`, `context_id`, `status` filters and the lineage response shape (§6.2); POST handler extended to accept `result` on delegation upserts; POST handler adds `canceled` to `VALID_STATUSES`.
8. `~/.hive/poll.sh` — installed via `src/scripts/install-hive.sh` (or the existing `onboard-remote.sh` amended). Contract per §4.5.
9. **Tests** (Vitest, mirroring existing `src/app/api/skills/__tests__/route.test.ts` pattern):
    - `src/lib/dispatch/__tests__/adapter-factory.test.ts` — every agent in the fixture registry resolves to a known adapter; fallback verified.
    - `src/lib/dispatch/__tests__/openclaw-adapter.test.ts` — writes to a tempdir, asserts atomic rename, asserts idempotency on repeated `task_id`.
    - `src/lib/dispatch/__tests__/hive-poll-adapter.test.ts` — returns `mode:"queued"` unconditionally.
    - `src/app/api/dispatch/__tests__/route.test.ts` — end-to-end: POST → 200 + hive_delegations row + hive_actions trigger row + adapter called. Plus error cases: UNKNOWN_AGENT (404), INVALID_BODY (400), CONTENT_BLOCKED (403), ADAPTER_REJECTED (502 with rollback to failed status).
    - `src/app/api/hive/__tests__/lineage.test.ts` — seed delegation + actions with shared task_id → GET `?task_id=X` returns full chain in timestamp order.
10. **Impact analysis artifacts** per CLAUDE.md: `gitnexus_impact` run on `initSchema`, `POST /api/hive`, `GET /api/hive` before edits; result pasted in the phase's VALIDATION.md.

**Exit criteria:**

- `npm test` green.
- `npm run build` green (no TS errors).
- Manual smoke: `curl -X POST /api/dispatch` with `to_agent=alba` produces a file in `~/.openclaw/delivery-queue/`. `curl` with `to_agent=sophia` produces a `hive_delegations` row and `bash ~/.hive/poll.sh sophia --once` returns it.
- DB migration is idempotent: fresh DB + existing DB both end up with `hive_delegations_v2_migrated=1` and the extended CHECK constraint.

**Out of scope for Plan 01:** Agent Cards, DispatchPanel UI, cancellation endpoint, skills config, A2A SDK import.

### 7.2 Plan 02 — Frontend: DispatchPanel + Lineage Feed + Agent Card Endpoints

**Deliverables:**

1. `src/app/api/agents/[id]/card/route.ts` — A2A-shaped card per §5.2 + live health merge.
2. `src/app/api/agents/cards/route.ts` — index route returning all cards.
3. `src/components/dispatch/dispatch-panel.tsx` — §6.3 responsibilities 1–3.
4. Mount `DispatchPanel` on `/flow` (or introduce `/dispatch` — decide during `gsd-plan-phase`).
5. `src/components/dispatch/lineage-drawer.tsx` — timeline + result viewer.
6. `src/components/dispatch/__tests__/dispatch-panel.test.tsx` — RTL: renders rows, opens drawer on click, fires dispatch, shows toast on error.
7. `src/app/api/agents/__tests__/card.test.ts` — card shape matches §5.2 exactly for each fixture agent; unknown id → 404.
8. Optional schema extension: add `skills?: Skill[]` to `RemoteAgentConfig`; fixtures updated; `deriveSkills()` used as fallback.
9. Wire the nav: add a "Dispatch" icon + route to the sidebar shell (or a tab on `/flow`).

**Exit criteria:**

- All Plan 01 tests still green.
- New UI renders on a local dev build; Luis can dispatch a task to `sophia` end-to-end in browser.
- Lineage drawer correctly shows `trigger → checkpoint* → stop` sequence.
- `GET /api/agents/sophia/card` validates against the inline `AgentCard` type; `extensions.kitchen.reachable` matches the live `/health` probe.

### 7.3 Dependencies

Plan 02 depends on Plan 01's `context_id`/`result` columns, `/api/dispatch`, lineage GET. Plan 01 has no dependencies on existing feature branches beyond the current `main`.

---

## 8. Out of Scope (Explicit)

These items are NOT part of this spec and MUST NOT be imported, added as dependencies, or implemented in either plan:

| Technology / Pattern          | Why out of scope |
|-------------------------------|------------------|
| **Claude Agent SDK**          | Vendor-locked orchestration; violates provider-agnostic pillar #3. |
| **OpenAI Agents SDK** (Python or JS) | Vendor-locked; same reason. |
| **Redis / BullMQ**            | SQLite is already the queue; adding a broker contradicts Hive-as-queue pillar #2. |
| **Temporal (workflow engine)**| Over-engineered for our volume and couples us to a long-running service. |
| **LLM calls in `/api/dispatch`, adapters, `selectAdapter`, `poll.sh`, lineage handlers** | Violates zero-LLM-tokens pillar #1. Any contributor tempted to add "AI routing" must instead extend `selectAdapter` with deterministic rules or propose a new spec. |
| **An inbound A2A JSON-RPC server** (third parties POST'ing tasks to us) | Requires an auth model (API keys, OAuth). Deferred to a dedicated security phase. |
| **Streaming / SSE on dispatch** | `capabilities.streaming: false` in the Agent Card. Planned for a future spec; not implemented here. |
| **Push notifications via webhooks to external systems** | Hive itself is the notification bus; webhook fan-out is a separate phase. |
| **Cancellation UI + endpoint** | Schema supports `canceled` status (§1.2). Endpoint and UI land in a future phase after Plan 02. |
| **Explicit `parent_task_id` column**    | Flat context_id grouping is sufficient for Plan 02 UI. Add only when a use case demands true tree semantics. |
| **Changing `platform` enum in `AgentPlatform`**   | No new platforms added. If a future runtime (e.g., `openclaw`) wants its own value, that's a separate migration. |

---

## 9. Self-Review — Contradictions and Ambiguity Check

Performed one pass against the spec; findings resolved inline below.

1. **Adapter selection for Gwen** — §2.4 table shows Gwen mapping to `hive-poll` because her config says `platform: "claude"`, yet context says "Gwen is OpenClaw." Resolved: spec makes the mapping mechanism explicit (platform field drives adapter) and calls out the flip path. Not a contradiction; it's a config choice Luis owns.

2. **Race on task claim** (§4.2) — two agents could theoretically both claim. Resolved: spec states `to_agent` is the unique intended consumer and documents cross-agent collision as unsupported.

3. **`result` storage format** — §1.1 says TEXT; §4.4 shows JSON object. Resolved: §4.4 body is JSON sent over the wire; the POST handler MUST `JSON.stringify` before INSERT. Plan 01 test list covers both directions.

4. **GET `/api/hive` precedence when multiple filters present** — §6.2 now states: `task_id` > `context_id` > `agent|q` > default. Single rule, unambiguous.

5. **Where DispatchPanel lives** — §6.3 and §7.2 both defer to `gsd-plan-phase`. Marked as a Plan 02 decision explicitly.

6. **`poll.sh` dependency on python3** — same as existing `post.sh`. Consistent.

7. **Status migration idempotency** — §1.2 uses a `meta` flag. Plan 01 exit criteria explicitly tests both fresh-DB and existing-DB paths.

8. **A2A SDK usage** — §5.4 says MAY import for types but not required. No false dependency claim.

No remaining contradictions or TBDs.

---

## 10. Files Touched Summary

**New files:**
- `src/lib/dispatch/types.ts`
- `src/lib/dispatch/openclaw-adapter.ts`
- `src/lib/dispatch/hive-poll-adapter.ts`
- `src/lib/dispatch/adapter-factory.ts`
- `src/lib/dispatch/__tests__/adapter-factory.test.ts`
- `src/lib/dispatch/__tests__/openclaw-adapter.test.ts`
- `src/lib/dispatch/__tests__/hive-poll-adapter.test.ts`
- `src/app/api/dispatch/route.ts`
- `src/app/api/dispatch/__tests__/route.test.ts`
- `src/app/api/hive/__tests__/lineage.test.ts`
- `src/app/api/agents/[id]/card/route.ts` (Plan 02)
- `src/app/api/agents/cards/route.ts` (Plan 02)
- `src/app/api/agents/__tests__/card.test.ts` (Plan 02)
- `src/components/dispatch/dispatch-panel.tsx` (Plan 02)
- `src/components/dispatch/lineage-drawer.tsx` (Plan 02)
- `src/components/dispatch/__tests__/dispatch-panel.test.tsx` (Plan 02)
- `~/.hive/poll.sh` (installed, not in repo — or mirrored in `src/scripts/`)

**Modified files:**
- `src/lib/db-schema.ts` — column + index adds, status CHECK rebuild
- `src/app/api/hive/route.ts` — new GET filters (`task_id`, `context_id`, `status`); `VALID_STATUSES` += `canceled`; POST accepts `result` on delegation branch
- `src/types/index.ts` — (Plan 02) optional `skills?: Skill[]` on `RemoteAgentConfig`
- `agents.config.schema.json` — (Plan 02) optional `skills[]` support

**Unchanged — must stay unchanged:**
- `agents.config.json` (no config edits required to ship Plan 01)
- `~/.hive/post.sh` (the existing POST script remains the shell contract for checkpoints/results)
- `src/lib/agent-registry.ts` (consumed as-is)

---

**End of spec.**
