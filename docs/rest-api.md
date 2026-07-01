# REST API Reference

This reference covers the stable v2 integration surface. UI-only read endpoints exist, but external agents should prefer the registry, A2A, memory, heartbeat, and skill report endpoints below.

## Authentication

Operator writes use either header:

```text
x-memroos-operator-key: <MEMROOS_OPERATOR_API_KEY>
```

or:

```text
Authorization: Bearer <MEMROOS_OPERATOR_API_KEY>
```

Agent writes use:

```text
Authorization: Bearer <agent-api-key>
```

Agent API keys are minted by `/api/agents/register` or `/api/a2a/agents/register` when `issueApiKey` is true or omitted.

## Public Eval API v1

The public eval API has a machine-readable OpenAPI 3.1 contract at:

```text
GET /api/public/v1/openapi
```

For reverse-proxy deployments, set `MEMROOS_PUBLIC_EVAL_OPENAPI_BASE_URL` to the public origin that should appear in the OpenAPI `servers` block. Forwarded host headers are not trusted when generating the spec.

Tenant-scoped eval calls use:

```text
Authorization: Bearer <tenant-api-key>
```

### `POST /api/public/v1/traces`

Submits an agent trace for scoring. The endpoint accepts either MemRoOS `AgentEvalTrace` JSON or an OpenInference flat attribute bag. Successful responses include:

```text
X-Memroos-Contract: public-eval-api.v1
```

Response:

```json
{
  "runId": "run_123",
  "w": 0.82,
  "layers": {
    "l1": { "score": 0.9, "weight": 0.25, "scorers": [] },
    "l2": { "score": 0.8, "weight": 0.5, "scorers": [] },
    "l3": { "score": 0.7, "weight": 0.25, "scorers": [] }
  },
  "proposalIds": [],
  "tenantId": "tenant-alpha"
}
```

### `GET /api/public/v1/runs/{runId}`

Returns one scored eval run owned by the authenticated tenant. Returns `403` if the run exists but belongs to another tenant.

### `GET /api/public/v1/proposals`

Lists SEAL proposal summaries for the authenticated tenant. Optional query parameter:

```text
traceId=<trace-id>
```

## One-command Onboarding

### `POST /api/onboarding/invite`

Creates a short-lived signed invite and returns a shell command that an agent can run. Requires operator auth.

Request:

```json
{
  "agentId": "maria",
  "name": "Maria",
  "role": "Research and implementation partner",
  "platform": "openclaw",
  "protocol": "rest",
  "ttlMinutes": 15,
  "mcpUrl": "https://memroos.example/mcp"
}
```

Response:

```json
{
  "ok": true,
  "token": "signed-onboarding-token",
  "expiresAt": "2026-05-05T00:15:00.000Z",
  "command": "curl -fsSL 'https://memroos.example/api/onboarding/script?token=...' | bash -s -- --id 'maria' ...",
  "mcpUrl": "https://memroos.example/mcp"
}
```

### `GET /api/onboarding/script?token=...`

Serves the bootstrap shell script for a valid invite token. The script posts to `/api/onboarding/register`, stores the one-time agent API key in `~/.memroos/<agent-id>.env`, and can install MCP config for `cursor`, `hermes`, `openclaw`, `claude`, `gemini`, `qwen`, `codex`, `stdout`, `none`, or a specific `file:/path`.

The default `--mcp-target auto` maps from `platform` to the matching runtime installer. Runtime CLI commands are preferred over static config edits when available; fallback writes are scoped to each runtime's user config. The script also writes `~/.memroos/<agent-id>.onboarding-report.json` with the method used, so operators can see when a runtime CLI changed and a fallback was needed.

### `POST /api/onboarding/register`

Consumes a valid invite token and registers the agent without exposing the operator key to the agent.

Request:

```json
{
  "token": "signed-onboarding-token",
  "id": "maria",
  "name": "Maria",
  "role": "Research and implementation partner",
  "platform": "openclaw",
  "protocol": "rest",
  "location": "local"
}
```

Response includes the registered agent, a one-time `apiKey`, and an MCP config:

```json
{
  "ok": true,
  "agent": { "id": "maria" },
  "apiKey": "ak_maria_...",
  "mcp": {
    "mcpServers": {
      "memroos": {
        "url": "https://memroos.example/mcp"
      }
    }
  }
}
```

## Registry

### `GET /api/agents`

Lists canonical registry agents.

Response:

```json
{
  "agents": [],
  "timestamp": "2026-05-05T00:00:00.000Z"
}
```

### `POST /api/agents/register`

Registers a REST, A2A, UI, or local agent. Requires operator auth outside loopback.

Request:

```json
{
  "id": "worker-1",
  "name": "Worker 1",
  "role": "Research agent",
  "platform": "codex",
  "protocol": "rest",
  "location": "tailscale",
  "host": "agent.tailnet",
  "port": 8787,
  "healthEndpoint": "/health",
  "capabilities": [
    { "id": "research", "name": "Research", "description": "Researches bounded tasks", "tags": ["research"] }
  ]
}
```

Response:

```json
{
  "ok": true,
  "agent": { "id": "worker-1" },
  "apiKey": "generated-agent-key",
  "timestamp": "2026-05-05T00:00:00.000Z"
}
```

### `GET /api/agents/{id}`

Returns one canonical registry agent.

### `DELETE /api/agents/{id}`

Soft-deletes an agent and revokes active keys. Requires operator auth.

### `GET /api/agents/cards`

Returns A2A cards for registered agents that can be represented as cards.

### `GET /api/agents/{id}/card`

Returns one registered agent's A2A card projection.

## A2A Registration

### `POST /api/a2a/agents/register`

Ingests a remote A2A agent card into the canonical registry. Requires operator auth.

Request:

```json
{
  "cardUrl": "http://agent.tailnet:8000/.well-known/agent-card.json",
  "source": "a2a",
  "requestedId": "research-agent",
  "issueApiKey": true
}
```

## A2A Protocol Endpoints

### `GET /.well-known/agent-card.json`

Memroos's canonical A2A card.

### `GET /.well-known/agent.json`

Compatibility alias for clients that still look for the older path.

### `POST /a2a`

JSON-RPC endpoint. Supports Memroos's current A2A task methods for sending messages, listing tasks, fetching tasks, and canceling tasks.

### `POST /message:send`

Creates a durable task from an authenticated A2A caller.

### `POST /message:stream`

Creates a task and returns SSE `task.update` events.

### `GET /tasks`

Lists tasks visible to the authenticated agent.

### `GET /tasks/{id}`

Fetches one task visible to the authenticated agent.

### `POST /tasks/{id}:cancel`

Cancels a non-terminal task visible to the authenticated agent.

### `POST /tasks/{id}:subscribe`

Returns task state and stored events as SSE `task.update` events.

## Agent Runtime Reporting

### `POST /api/heartbeat`

Requires agent bearer auth.

Request:

```json
{
  "agentId": "worker-1",
  "status": "active",
  "currentTask": "Indexing docs",
  "latencyMs": 42,
  "metadata": { "machine": "mac-mini-1" }
}
```

### `POST /api/memory/add`

Requires agent bearer auth. Writes through mem0 and records the write in Memroos.

Request:

```json
{
  "agentId": "worker-1",
  "content": "The deployment target is private-network over Tailscale.",
  "metadata": { "topic": "deployment" },
  "tier": "vector"
}
```

Tier may be `vector`, `graph`, or `episodic`; the router also infers tier from metadata when possible.

### `POST /api/skills/report`

Requires agent bearer auth.

Request:

```json
{
  "agentId": "worker-1",
  "skillId": "code-review",
  "action": "completed",
  "metadata": { "findings": 2 }
}
```

## Memory Read Endpoints

These require operator authorization because they can expose sensitive memory.

### `GET /api/memory/search?q=agent&limit=10`

Searches vector memory.

### `GET /api/memory/graph?q=Luis&limit=25`

Queries graph memory.

### `GET /api/memory/health`

Returns vector, graph, and episodic tier health.

## Orchestration

### `POST /api/orchestration`

Requires operator auth. Sends a task to the LangGraph orchestration service with registered agents as routing candidates.

Request:

```json
{
  "taskSummary": "Research A2A compatibility and propose an implementation plan",
  "requiredCapability": "research",
  "requiresApproval": true,
  "correlationId": "phase-40-docs"
}
```

### `GET /api/orchestration/hil`

Lists pending human-in-the-loop decisions. Requires operator auth.

### `POST /api/orchestration/hil/{id}`

Resolves one HIL decision. Requires operator auth.

```json
{ "decision": "approve" }
```
