# LangGraph Peer Contract

> **Phase 144 — FLEET-09..12.** This document is the formal peer contract between
> MemroOS (the agent fleet plane) and the LangGraph orchestration service (a peer
> runtime). It replaces the earlier usage notes with explicit input/output schemas,
> checkpoint store layout, HIL interrupt protocol, failure modes, and durability path.

MemroOS supports LangGraph in two ways:

1. LangGraph agents can register as A2A agents and receive tasks through MemroOS.
2. MemroOS can delegate routed tasks to the Python LangGraph orchestration service.

## Ownership Split

The boundary is an HTTP orchestration contract. Each layer owns specific concerns
and must not re-implement the other's responsibilities.

| Concern | Owner | Where |
| --- | --- | --- |
| Agent identity (registry, API keys, capabilities) | MemroOS | `apps/memroos/src/lib/agent-registry.ts`, SQLite `data/conversations.db` |
| Memory routing (vector, graph, episodic) | MemroOS | `apps/memroos/src/lib/memory` |
| Audit, governance, policy receipts, classification | MemroOS | `apps/memroos/src/lib/audit`, `lib/compliance`, `lib/classification` |
| Operator UI, HIL list/resolve proxy, auth gate | MemroOS | `apps/memroos/src/app/api/orchestration/` |
| Registry candidate list for orchestration | MemroOS | `apps/memroos/src/lib/orchestration/client.ts` |
| StateGraph routing (route_policy, approval, dispatch) | LangGraph | `services/orchestration/graph.py` |
| SqliteSaver checkpointing | LangGraph | `services/orchestration/graph.py`, `data/orchestration.db` |
| Retry metadata (RetryPolicy on dispatch node) | LangGraph | `services/orchestration/graph.py` |
| HIL interrupt/resume protocol (interrupt, Command(resume=...)) | LangGraph | `services/orchestration/graph.py` |
| Orchestration run/lineage/HIL decision records | LangGraph service (engine) | `services/orchestration/engine.py`, `data/orchestration.db` |

**Boundary rule:** Do not move MemroOS UI concerns into LangGraph. Do not move
LangGraph checkpoint semantics into MemroOS. The boundary is an HTTP orchestration
contract — MemroOS proxies requests to `ORCHESTRATION_SERVICE_URL`; the Python
service owns graph execution and checkpoint state.

## Input Schema — `POST /tasks/route`

Sent by MemroOS's TypeScript orchestration client
(`apps/memroos/src/lib/orchestration/client.ts` → `postOrchestrationTask`) to the
Python service at `ORCHESTRATION_SERVICE_URL/tasks/route`. Pydantic model:
`RouteTaskRequest` in `services/orchestration/app.py`.

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `taskSummary` | `string` | yes | — | Human-readable task description (min_length=1) |
| `requiredCapability` | `string` | no | `null` | Capability tag to filter candidate agents (e.g. `"research"`, `"deploy"`) |
| `correlationId` | `string` | no | `corr_<uuid>` | Caller-supplied correlation id for cross-system tracing |
| `runId` | `string` | no | `run_<uuid>` | Caller-supplied run id; auto-generated if absent |
| `requiresApproval` | `boolean` | no | `false` | If `true`, graph enters the approval node and raises `interrupt()` |
| `requestedBy` | `string` | no | `"operator"` | Actor identity for HIL decision audit |
| `agents` | `list[object]` | no | `[]` | Candidate agent list from the MemroOS registry; each object has `id`, `name`, `role`, `status`, `protocol`, `platform`, `capabilities`, `metadata` |

**Routing logic:** If `requiresApproval` is `true` **or** no agent matches the
`requiredCapability`, the engine forces HIL (creates a HIL decision row, starts
the graph with `requiresApproval=True`). Otherwise, the graph dispatches directly.

## Output Schema — `POST /tasks/route` Response

```json
{
  "ok": true,
  "runId": "run_abc123",
  "correlationId": "corr_def456",
  "status": "waiting_for_approval",
  "selectedAgentId": "agent-1",
  "hilDecisionId": "hil_ghi789",
  "retryLimit": 2,
  "boundary": "LangGraph chooses policy; Memroos/A2A owns transport",
  "graphState": {
    "runId": "run_abc123",
    "taskSummary": "Approve graph task",
    "requiredCapability": "research",
    "selectedAgentId": "agent-1",
    "status": "waiting_for_approval",
    "approvalDecision": null,
    "interrupts": [{"id": "...", "value": {"kind": "operator_approval", ...}}],
    "checkpointed": true
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `ok` | `boolean` | Always `true` on success |
| `runId` | `string` | Unique run identifier |
| `correlationId` | `string` | Cross-system correlation id |
| `status` | `string` | `waiting_for_approval` \| `dispatched` \| `routing` |
| `selectedAgentId` | `string` \| `null` | Chosen agent id (null if HIL forced due to no match) |
| `hilDecisionId` | `string` \| `null` | HIL decision row id (present when HIL is triggered) |
| `retryLimit` | `integer` | Configured retry limit from `ORCHESTRATION_RETRY_LIMIT` |
| `boundary` | `string` | Static contract marker: `"LangGraph chooses policy; Memroos/A2A owns transport"` |
| `graphState` | `object` | Public graph state from `_public_state()`: `runId`, `taskSummary`, `requiredCapability`, `selectedAgentId`, `status`, `approvalDecision`, `interrupts`, `checkpointed` |

## Output Schema — `POST /hil/{id}/resolve` Response

```json
{
  "ok": true,
  "id": "hil_ghi789",
  "runId": "run_abc123",
  "correlationId": "corr_def456",
  "taskSummary": "Approve graph task",
  "selectedAgentId": "agent-1",
  "status": "approved",
  "requestedBy": "operator",
  "resolvedBy": "operator-1",
  "decision": "approve",
  "createdAt": "2026-07-09T12:00:00Z",
  "resolvedAt": "2026-07-09T12:01:00Z",
  "resumed": true,
  "graphState": {
    "runId": "run_abc123",
    "status": "approved",
    "approvalDecision": "approve",
    "checkpointed": true,
    "interrupts": []
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `ok` | `boolean` | Always `true` on success |
| `id` | `string` | HIL decision row id |
| `runId` | `string` | Associated run id |
| `correlationId` | `string` | Cross-system correlation id |
| `status` | `string` | `approved` \| `rejected` |
| `decision` | `string` | `approve` \| `reject` |
| `resumed` | `boolean` | `true` when decision was `approve` (graph resumed) |
| `resolvedBy` | `string` \| `null` | Actor who resolved the decision |
| `graphState` | `object` \| `null` | Post-resume graph state (null if graph runtime not configured) |

## Output Schema — `GET /hil` Response

```json
{
  "ok": true,
  "decisions": [
    {
      "id": "hil_ghi789",
      "runId": "run_abc123",
      "correlationId": "corr_def456",
      "taskSummary": "Approve graph task",
      "selectedAgentId": "agent-1",
      "status": "pending",
      "requestedBy": "operator",
      "resolvedBy": null,
      "decision": null,
      "createdAt": "2026-07-09T12:00:00Z",
      "resolvedAt": null
    }
  ]
}
```

## Checkpoint Store Layout

The orchestration service uses a single SQLite database file at the path
specified by `ORCHESTRATION_DB_PATH` (default: `data/orchestration.db`).

### Tables in the shared file

| Table | Owner layer | Managed by | Purpose |
| --- | --- | --- | --- |
| `checkpoints` | LangGraph | `SqliteSaver` (langgraph-checkpoint-sqlite) | Serialized graph state per thread_id |
| `writes` | LangGraph | `SqliteSaver` | Per-step write log for checkpoint replay |
| `orchestration_runs` | MemroOS engine | `OrchestrationStore._init_schema()` | Run lifecycle: status, selected agent, retry count, rollback |
| `orchestration_lineage` | MemroOS engine | `OrchestrationStore._init_schema()` | Per-hop audit trail: ingress, route, dispatch, HIL, compensation |
| `orchestration_hil_decisions` | MemroOS engine | `OrchestrationStore._init_schema()` | HIL decision queue: pending/approved/rejected with actor audit |

### Why they share a file but are owned by different layers

1. **Operational simplicity:** a single file is easy to back up, copy, and reason
   about in a single-host deployment. No cross-database joins are needed.
2. **Ownership discipline:** `checkpoints` and `writes` are created and managed
   exclusively by LangGraph's `SqliteSaver`. The MemroOS engine never reads or
   writes those tables directly. The engine tables are created by
   `OrchestrationStore._init_schema()` and LangGraph never touches them.
3. **WAL mode:** the engine sets `PRAGMA journal_mode=WAL` so that concurrent
   checkpoint writes (from the graph) and engine reads/writes do not stall each
   other under the default rollback journal.
4. **Durability boundary:** litestream replicates the entire file (see
   [Checkpoint Durability](#checkpoint-durability)), so both layers' state is
   covered by one replication stream.

### SQLite ownership split (cross-DB)

Beyond the orchestration DB, MemroOS and LangGraph each own separate SQLite files:

| SQLite file | Owner | Path | Contents |
| --- | --- | --- | --- |
| MemroOS canonical registry | MemroOS kernel | `apps/memroos/data/conversations.db` (or `SQLITE_DB_PATH`) | Registry, A2A tasks, audit, episodic memory, agent bus, telemetry |
| LangGraph checkpoints | LangGraph service | `data/orchestration.db` (or `ORCHESTRATION_DB_PATH`) | `checkpoints`, `writes`, `orchestration_runs`, `orchestration_lineage`, `orchestration_hil_decisions` |

MemroOS's canonical registry/audit SQLite and LangGraph's checkpoint SQLite are
**separate files owned by separate layers**. The kernel never opens
`data/orchestration.db` directly; the Python service never opens
`apps/memroos/data/conversations.db`. Communication is always over HTTP.

## HIL Interrupt Protocol

### How `interrupt()` is raised

1. MemroOS sends `POST /tasks/route` with `requiresApproval: true` (or no agent
   match forces HIL).
2. The engine (`OrchestrationEngine.route_task`) starts the LangGraph runtime
   with `requiresApproval=True`.
3. In `graph.py`, the `route_policy` node runs, then the conditional edge
   `needs_approval` routes to the `approval` node.
4. The `approval` node calls `interrupt({...})`, which suspends graph execution
   and writes a checkpoint to the `checkpoints` table via `SqliteSaver`.
5. `_public_state()` detects the interrupt in the result and sets
   `status = "waiting_for_approval"`.
6. The engine creates a row in `orchestration_hil_decisions` with `status='pending'`
   and returns the `hilDecisionId` to MemroOS.

### How `/hil/{id}/resolve` resumes

1. The operator views pending decisions via MemroOS's TS proxy:
   `GET /api/orchestration/hil` → `GET /hil` on the Python service.
2. The operator submits a decision via MemroOS's TS proxy:
   `POST /api/orchestration/hil/{id}` with `{"decision":"approve"}`.
3. The TS proxy (`apps/memroos/src/app/api/orchestration/hil/[id]/route.ts`)
   checks `authorizeRegistryWrite(request)` for auth, then calls
   `resolveOrchestrationHil(id, decision)` in the TS client.
4. The TS client sends `POST /hil/{id}/resolve` to the Python service.
5. The Python service's `resolve_hil` endpoint calls
   `OrchestrationEngine.resolve_hil()`, which:
   - Resolves the HIL decision row (`status` → `approved`/`rejected`).
   - Updates the run status.
   - Appends a `hil_approved` or `hil_rejected` lineage row.
   - Calls `graph_runtime.resume(runId, decision)`.
6. `LangGraphRuntime.resume()` re-invokes the graph with
   `Command(resume=decision)` using the same `thread_id` (run_id) as the
   checkpoint config. LangGraph loads the checkpoint from `SqliteSaver`,
   injects the resume value into the `approval` node's `interrupt()` return,
   and continues execution.
7. The `approval` node sets `approvalDecision` and `status` based on the
   decision, then routes to `END`.
8. The resolved graph state (including `approvalDecision`) is returned to the
   operator as `graphState` in the resolve response.

### State edit before resume (`edit_and_checkpoint`)

An operator can edit a paused HIL thread's checkpoint state before resuming via
`PATCH /hil/{id}/edit`. This calls `LangGraphRuntime.edit_and_checkpoint()`,
which uses `graph.update_state(config, patch, as_node="route_policy")` to patch
the checkpoint **without resuming**. The `as_node` is hardcoded to
`"route_policy"` (never caller-supplied) so that a subsequent `resume()` re-enters
the `needs_approval` conditional and routes to dispatch if `requiresApproval` is
patched to `false`. A `state_edit` lineage row records the actor, before, and
after values.

## Failure Modes

### LangGraph host lost (in-flight graph state)

If the Python orchestration service crashes or the host is lost:

- **In-flight graph state is lost** for any run that was mid-execution (between
  `start()` and `resume()` or between hops). The `SqliteSaver` checkpoint
  persists to disk, but if the disk is gone, the checkpoint is gone.
- **HIL decisions remain visible** in `orchestration_hil_decisions` if the DB
  file survives (e.g., on a persistent volume). The operator can see pending
  decisions but cannot resume the graph until the service is restored and the
  checkpoint file is available.
- **Mitigation:** litestream replication (see
  [Checkpoint Durability](#checkpoint-durability)) ensures the checkpoint DB
  can be restored from remote storage after host loss.

### `edit_and_checkpoint` behavior

- The edit patches the checkpoint state **in place** using
  `graph.update_state()` with `as_node="route_policy"`. It does **not** resume
  the graph.
- The caller must invoke `resume()` separately to continue execution.
- If the run is not in `waiting_for_approval` status, the edit endpoint returns
  HTTP 409 (status CAS check in `app.py`).
- Unknown fields in the edit payload are rejected with HTTP 422
  (`HilEditRequest` uses `extra="forbid"`).

### Retry policy behavior

- The `dispatch` node has a `RetryPolicy(max_attempts=N, retry_on=[Exception])`
  where `N` comes from `ORCHESTRATION_RETRY_LIMIT` (default: 3 in `graph.py`,
  default: 2 in the engine).
- When a dispatch failure is recorded via `POST /tasks/{run_id}/failures`, the
  engine increments `attempts`. If `attempts < retry_limit`, status is
  `retrying` and a `retry_scheduled` lineage row is written.
- If `attempts >= retry_limit`, the engine sets status to
  `waiting_for_approval`, creates a new HIL decision for operator review, and
  runs declarative rollback compensation (resolving `compensation_pending`
  lineage rows in reverse order).
- After rollback, the run status is set to `rolled_back` with a granular
  `rollback_reason` (e.g., "failed at hop 2, compensated hops 1..1").

### Desync / timeout

- If the MemroOS proxy times out waiting for the Python service, it returns
  HTTP 502 to the operator. The graph may still be running on the Python side.
- The operator can check run status via the lineage/HIL endpoints.
- There is no automatic desync reconciliation in v8.5; this is an explicit
  follow-up for a future HA phase.

## Checkpoint Durability

### Option A — Litestream replication (primary, recommended for v8.5)

[Litestream](https://litestream.io/) runs as a sidecar process alongside the
orchestration service and continuously replicates the SQLite file to S3-compatible
storage (MinIO, Cloudflare R2, AWS S3). It is the cheapest durability path
because it works with the existing SQLite store without any code changes.

**Configuration example:** see
[`services/orchestration/litestream.yml.example`](../../services/orchestration/litestream.yml.example).

**Restore drill steps:**

1. Stop the orchestration service.
2. Remove or rename the corrupted/missing DB file:
   ```bash
   mv data/orchestration.db data/orchestration.db.corrupt  # or rm if unrecoverable
   ```
3. Run litestream restore:
   ```bash
   litestream restore -config services/orchestration/litestream.yml \
     -o data/orchestration.db
   ```
4. Verify the restored DB has the expected tables:
   ```bash
   sqlite3 data/orchestration.db \
     "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
   # Expected: checkpoints, writes, orchestration_runs, orchestration_lineage, orchestration_hil_decisions
   ```
5. Restart the orchestration service.
6. Verify health:
   ```bash
   curl http://localhost:3210/health
   # Expected: {"ok":"true","service":"orchestration"}
   ```
7. Verify pending HIL decisions are visible:
   ```bash
   curl http://localhost:3210/hil
   ```

**Docker Compose integration:** litestream can run as a sidecar service in
`docker-compose.yml` sharing the `orchestration-data` volume. The litestream
container monitors `/data/orchestration.db` and replicates to the configured
endpoint. See the example file for env var references.

### Option B — Postgres checkpointer (future flag)

A future option is to use LangGraph's `PostgresSaver` instead of `SqliteSaver`,
controlled by an env var:

```
ORCHESTRATION_CHECKPOINTER=sqlite|postgres
```

- `sqlite` (default): uses `SqliteSaver` with `ORCHESTRATION_DB_PATH`.
- `postgres`: uses `PostgresSaver` with a `ORCHESTRATION_POSTGRES_DSN` connection
  string (not yet implemented).

**Migration path (documented, not implemented in v8.5):**

1. Set `ORCHESTRATION_CHECKPOINTER=postgres` and `ORCHESTRATION_POSTGRES_DSN`.
2. The service initializes `PostgresSaver` and calls `setup()` to create the
   `checkpoints` and `writes` tables in Postgres.
3. The MemroOS engine tables (`orchestration_runs`, `orchestration_lineage`,
   `orchestration_hil_decisions`) would also move to Postgres or remain in
   SQLite (dual-store mode).
4. Existing SQLite checkpoints would need a one-time migration script to copy
   `checkpoints` and `writes` rows into Postgres.

This option is **not implemented** in Phase 144. The env var is reserved in
`.env.example` so future phases can implement it without a schema-breaking
change. Litestream (Option A) is the recommended durability path for v8.5
because it requires zero code changes and works with the existing SQLite store.

## LangGraph Agent as A2A Peer

Expose an A2A card for the LangGraph agent and register it:

```bash
curl -X POST http://localhost:3000/api/a2a/agents/register \
  -H 'Content-Type: application/json' \
  -H 'x-memroos-operator-key: <operator-key>' \
  -d '{
    "cardUrl": "http://langgraph-agent.tailnet:9000/.well-known/agent-card.json",
    "source": "a2a",
    "requestedId": "langgraph-researcher"
  }'
```

Use MemroOS's `/message:send`, `/message:stream`, and `/tasks/*` endpoints for
durable task lifecycle.

## MemroOS to LangGraph Orchestration

MemroOS proxies orchestration requests to `ORCHESTRATION_SERVICE_URL`.

```bash
curl -X POST http://localhost:3000/api/orchestration \
  -H 'Content-Type: application/json' \
  -H 'x-memroos-operator-key: <operator-key>' \
  -d '{
    "taskSummary": "Choose the best registered agent for this research task.",
    "requiredCapability": "research",
    "requiresApproval": true,
    "correlationId": "demo-langgraph-1"
  }'
```

## Human Approval

List decisions:

```bash
curl -H 'x-memroos-operator-key: <operator-key>' \
  http://localhost:3000/api/orchestration/hil
```

Resolve a decision:

```bash
curl -X POST http://localhost:3000/api/orchestration/hil/<decision-id> \
  -H 'Content-Type: application/json' \
  -H 'x-memroos-operator-key: <operator-key>' \
  -d '{"decision":"approve"}'
```

## Boundary Rule

Do not move MemroOS UI concerns into LangGraph. Do not move LangGraph checkpoint
semantics into MemroOS. The boundary is an HTTP orchestration contract.
