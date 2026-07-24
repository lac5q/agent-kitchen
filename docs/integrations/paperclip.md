# Paperclip Tenant Integration Contract

> **Phase 146 — FLEET-17..21.** This document is the formal ownership boundary
> contract between MemroOS (the agent fleet plane) and Paperclip (a parallel
> product plane / tenant for AI-agent companies). It states what each system
> owns, what is explicitly out of scope, and how the two integrate without
> federation.

## Summary

Paperclip is a **single-server, single-tenant control plane** for AI-agent
companies. It owns companies, issues, budgets, board approvals, and the
activity log. MemroOS is the **top-layer fleet plane** that owns the
cross-runtime agent registry, memory, fleet governance, A2A, and the NOC.
The two integrate through **passive adapters** and **thin HTTP proxies** —
MemroOS does not re-implement Paperclip, and Paperclip does not own the
cross-runtime fleet view.

## Ownership Split

| Concern | Owner | Where |
| --- | --- | --- |
| Companies (org-level entity) | Paperclip | Paperclip `companies` table |
| Issues (single-assignee, atomic checkout) | Paperclip | Paperclip `issues` table |
| Budgets (company / agent / project, monthly hard-stop) | Paperclip | Paperclip `budgetPolicies` + `budgetIncidents` |
| Board approvals (hire, strategy, budget override) | Paperclip | Paperclip `approvals` table + service |
| Activity log (agent/user/system actions) | Paperclip | Paperclip `activity_log` table |
| Agent runtime execution (Hermes local, gateway, http, process) | Paperclip adapter layer | Paperclip `packages/adapters/` |
| Cross-runtime agent registry (identity, API keys, capabilities) | MemroOS | `apps/memroos/src/lib/agent-registry.ts`, SQLite |
| Memory routing (vector, graph, episodic) | MemroOS | `apps/memroos/src/lib/memory` |
| Fleet governance (policy gate, audit chain, NOC) | MemroOS | `apps/memroos/src/lib/policy`, `lib/audit`, NOC |
| A2A protocol (agent cards, task lifecycle, delegation) | MemroOS | `apps/memroos/src/app/api/a2a/` |
| Operator console (UI, HIL, auth gate) | MemroOS | `apps/memroos/src/app/` |
| Paperclip activity visibility in MemroOS | MemroOS (mirror) | `POST /api/paperclip/activity` → `audit_entries` |
| Budget summary visibility in MemroOS | MemroOS (proxy) | `GET /api/paperclip/budget` → thin summary |

**Boundary rule:** MemroOS does not re-implement Paperclip board UX, budget
hard-stops, or company/issue management. Paperclip does not own the
cross-runtime fleet registry, memory, or governance. The boundary is an HTTP
contract with passive adapters — no shared database, no federation.

## Integration Paths

### 1. Paperclip Activity → MemroOS Visibility (FLEET-18)

**Endpoint:** `POST /api/paperclip/activity`

An operator, adapter, or Paperclip webhook pushes a thin, redacted activity
event into MemroOS. The event lands in the MemroOS audit chain
(`audit_entries` with `event_type = paperclip.activity`,
`entity_type = paperclip`) so it surfaces in the NOC governance strip and
audit query surfaces.

```bash
curl -X POST http://localhost:3000/api/paperclip/activity \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <operator-jwt>' \
  -d '{
    "companyId": "comp-1",
    "actorType": "agent",
    "actorId": "agent-alpha",
    "action": "agent.heartbeat",
    "entityType": "agent",
    "entityId": "agent-alpha",
    "summary": "Agent heartbeat received",
    "timestamp": "2026-07-09T10:00:00Z"
  }'
```

**Secrets invariant:** The endpoint never accepts or stores `adapter_config`,
auth headers, API keys, tokens, secrets, passwords, or env vars. The
Paperclip audit confirmed these are redacted at source; MemroOS enforces the
same invariant on the ingest side (defense-in-depth redaction).

**No live Paperclip required:** Activity ingestion is a local audit write, not
an upstream proxy call. An operator or adapter that already fetched the event
from Paperclip can push it to MemroOS without `PAPERCLIP_BASE_URL` being set.

### 2. Budget Delegation (FLEET-19)

**Endpoint:** `GET /api/paperclip/budget`

MemroOS proxies a thin budget summary from Paperclip's budget surface so the
operator can see company/agent/project spend without leaving the console.

```bash
curl -H 'Cookie: <operator-jwt>' \
  http://localhost:3000/api/paperclip/budget
```

**Response:**
```json
{
  "summary": {
    "companyId": "comp-1",
    "scope": "company",
    "scopeId": null,
    "spent": 750,
    "limit": 1000,
    "utilization": 0.75,
    "status": "warning",
    "asOf": "2026-07-09T10:00:00Z",
    "hardStopOwner": "paperclip"
  },
  "hardStopOwner": "paperclip"
}
```

**Hard-stop ownership (FLEET-19):** The monthly budget hard-stop (auto-pause at
100% utilization) is **delegated to Paperclip**. Paperclip's budget service
enforces the three-layer model (company / agent / project) with a monthly UTC
window, soft alert at 80%, and hard-stop at 100% that sets `agent.status =
paused` and blocks new checkout/invocation. **MemroOS does not re-implement
this.** The budget endpoint is read-only and for operator visibility only — it
never pauses agents, modifies budgets, or overrides Paperclip's enforcement.

### 3. Fleet Status + Dispatch (existing, Phase 21)

**Endpoints:** `GET /api/paperclip` (fleet status), `POST /api/paperclip` (dispatch)

These pre-existing endpoints proxy Paperclip's fleet status and dispatch task
to Paperclip's upstream API. They normalize autonomy modes and write local
`hive_delegations` / `hive_actions` rows for audit trail and recovery.

## 4. Memory Path (FLEET-2x) — Phase 178

This §4 clause resolves the policy collision that would otherwise emerge
between Phase 146 (FLEET contract baseline; ownership split) and
Paperclip's 2026-03-17 memory-provider plugin shape. The resolution
is the **Option D** integration (recorded in
`docs/integrations/paperclip-option-d-2026-07-21.md`):

- **Paperclip authorizes *binding access*** — which agent may call
  which provider (i.e. the `MemoryAdapter` plugin shape). Paperclip
  decides *who* is allowed to read/write memory on a per-run basis.
- **MemroOS authorizes *record content*** — the permission-aware
  context-pack assembly uses workspace/team/owner labels from
  MemroOS's own vault + ACL table to decide *what* the agent is
  entitled to see. MemroOS decides *what* is in the bundle.

When Paperclip's content authorization says "yes" but MemroOS's
content authorization says "no" (e.g. the agent row is authorized to
call the `linear` provider, but the Linear records the user is asking
about are flagged `restricted` sensitivity), **MemroOS's content
authorization wins on what's in the bundle**. The MemoryAdapter
plugin returns the redacted shape; the gateway logs the discrepancy
so the operator can investigate.

**Two Paperclip core seams:**

1. **Push (pre-run hydrate).** Paperclip's existing
   `instructionsFilePath` resolver at
   `paperclip/server/src/services/heartbeat.ts:~3630` is the one core
   change. MemroOS's `pre_run_hydrate` writes the context pack into
   the per-run instructions file via this seam. One core change
   covers all 9 CLI / cloud / gateway Paperclip adapters.
2. **Pull (MCP gateway).** MemroOS registers as **one**
   `toolConnections` row (`remote_http` transport). Paperclip adapters
   that wire `AdapterExecutionContext.runtimeMcp` get MemroOS
   natively. Adapters that do not yet wire it fall back to push-only.

**Subject-id introspection (MEMCLIP-03):** Paperclip's tool gateway
exposes the `subjectId` field at `server/src/services/heartbeat.ts:~2129`.
MemroOS's MCP callee reads this field on every gateway call to resolve
the token to `{companyId, agentId, runId}` for audit provenance. No
Paperclip adapter is required to change.

**Idempotency (MEMCLIP-04):** MemroOS enforces server-side
idempotency on `(run_id, content_hash)`. An integration test at
`services/connmem/tests/test_phase178_idempotency.py` (in the
Paperclip repo) asserts that one run which both hydrates via hook
AND writes via MCP yields exactly one MemroOS record + two linked
`memory_operations` rows.

**Zero Paperclip adapters gain Memroos-aware code (MEMCLIP-05):**
verified by `grep -r 'Memroos' paperclip/packages/adapters/*/src/**`
returning zero hits. (See `paperclip/MEMCLIP-VERIFICATION.md` for
the CI-runnable check.)

## Passive Adapter Behavior (FLEET-21)

Paperclip's Hermes and OpenClaw adapters are **passive** — the runtime must
already exist:

- `hermes_local` shells out to `hermes chat` as a child process; it does not
  install, update, or version-manage the `hermes` CLI binary.
- `hermes_gateway` proxies to an already-running Hermes API server at the URL
  configured on the agent row; it does not start the Hermes server.
- `openclaw_gateway` follows the same pattern (HTTP wrapper to a remote API).
- The `http` adapter is fire-and-forget webhook to any external agent runtime.

**Operator expectation:** Paperclip does **not** provision agent hosts on
demand. The agent runtime (CLI, sandbox container, gateway server) must already
exist at the address configured on the agent row. Auto-provisioning of new
agent hosts is an explicit industry gap and is out of scope for both Paperclip
V1 and MemroOS v8.5 (FLEET-26).

## Explicitly Out of Scope (FLEET-20)

- **Multi-Paperclip server federation** is not built and is explicitly excluded
  from Paperclip V1. The system is built around one `startServer()` holding one
  DB pool. There is no cross-server task handoff, no cross-cluster agent
  migration, no leader election, and no service discovery / agent registry
  federation. Paperclip V1 acceptance gate explicitly excludes "multi-board
  governance" and "automatic self-healing orchestration."
- **Auto-provision of new agent hosts on demand** does not exist in Paperclip
  and is out of scope for MemroOS v8.5 (FLEET-26).
- **Fine-grained RBAC** (per-agent tool allowlists, SAML/SSO) is V1-deferred to
  Paperclip Pro/Enterprise and is not re-implemented in MemroOS.
- **Re-implementing Paperclip board UX** (company management, issue
  decomposition, approval workflows) in MemroOS is explicitly rejected.

## Environment Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PAPERCLIP_BASE_URL` | (unset) | Paperclip server base URL. Leave unset to degrade gracefully (endpoints return 503). |
| `PAPERCLIP_STATUS_PATH` | `/api/fleet` | Path to Paperclip fleet status endpoint. |
| `PAPERCLIP_DISPATCH_PATH` | `/api/dispatch` | Path to Paperclip task dispatch endpoint. |
| `PAPERCLIP_BUDGET_PATH` | `/api/budget` | Path to Paperclip budget summary endpoint. |

No secrets are stored in code, docs, or audit receipts. Adapter API keys and
Paperclip credentials follow the secrets path documented in Phase 147
(FLEET-22).

## Sources

- Paperclip deep-dive audit: `content/audits/paperclip-control-plane-audit-2026-07-08.md`
- Fleet architecture decision: `content/architecture/memroos-as-agent-fleet-plane-2026-07-08.md`
- OSS control-plane survey: `content/research/agent-control-planes-2026.md`
- v8.5 milestone kickoff: `.planning/milestones/v8.5-agent-fleet-plane-KICKOFF.md`
