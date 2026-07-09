---
title: "Paperclip Deep-Dive Audit — Control-Plane Surface"
author: "Alba (Hermes) audit subagent"
date: 2026-07-08
type: audit
tags: [paperclip, audit, control-plane, hermes-adapter, federation]
status: complete
---

# Paperclip Deep-Dive Audit — Control-Plane Surface for Luis

## TL;DR

Paperclip is a **single-server, single-tenant control plane** for AI-agent companies. Every primitive Luis would need to *coordinate* an agent fleet is present (companies → orgs → agents → issues → heartbeats → budgets → approvals → activity log), but the system makes **strong assumptions** that the agent runtime is already reachable. Multi-machine provisioning is **out of scope**; multi-server / federated-server is **not built**. Hermes is a first-class built-in adapter (two flavors: `hermes_local` shells to `hermes chat`; `hermes_gateway` proxies to a remote Hermes API), but neither spins up an agent on demand from Paperclip — the runtime must already exist.

## A) Does Paperclip handle "provision an agent on a new machine"?

**No.** Paperclip assumes the agent runtime (CLI, sandbox container, gateway server) **already exists** at the address configured on the agent row (`adapter_config.apiBaseUrl`, `hermesCommand`, kube image, etc.).

What Paperclip *does* ship:

- **Bootstrap scripts for the server itself**, not agents:
  - `docker/Dockerfile` (server image)
  - `docker/docker-compose.yml` (server + Postgres)
  - `docker/ecs-task-definition.json` (single-task Fargate)
  - `docker/quadlet/{paperclip.pod,paperclip.container,paperclip-db.container}` (bare-metal Fedora/RHEL systemd-nspawn)
  - `~/github/paperclip-cloud/oracle/` — Terraform for Oracle Cloud ARM free tier + `cloud-init.sh` that `git clone`s Paperclip and `systemd enable`s it on a fresh VM
- **Agent runtime container images** under `docker/agent-runtime/` (`Dockerfile.hermes`, `Dockerfile.claude`, etc.). `Dockerfile.hermes` is **a stub** that admits "hermes_local … has no upstream npm package wired into Paperclip locally yet" — confirms the "we ship images, you provision them" model.
- **Kubernetes sandbox provider** (`packages/plugins/sandbox-providers/kubernetes/README.md`): creates per-tenant namespaces + agent-sandbox pods to *run* harnesses — but is a **sandbox-providers plugin**, called by `default_environment_id` per agent. Runs **inside an existing cluster**, not the federation story.
- **Sandbox plugin catalog** (`packages/plugins/sandbox-providers/`): `cloudflare`, `daytona`, `e2b`, `exe-dev`, `kubernetes`, `modal`, `novita` — "spin up an ephemeral VM/sandbox for one run" providers, not "provision a long-lived agent host."

**Net**: provisioning a brand-new host with Paperclip on it **is** scriptable (Oracle terraform, quadlet, compose, ECS). Provisioning a new **agent host** — Paperclip deciding to add a new machine because load is high, picking an adapter, installing its runtime, and registering an agent against it — **does not exist** anywhere in the code.

## B) Multi-machine support

**One Paperclip server + agents calling in.** Explicit from `doc/SPEC-implementation.md`:
- L33: "Tenancy: Single-tenant deployment, multi-company data model"
- L155 (agents spec): built-in adapter types are all per-row, single-machine

**No federation / multi-server / multi-tenant concepts anywhere:**
- Grep `federated|federation|multi-server|multi-tenant|cluster|HA|failover` against `doc/` and `server/src/`: zero hits
- Grep `cross.server|PAPERCLIP_URL.*remote` against `server/src`: zero hits
- `doc/DEPLOYMENT-MODES.md` defines `local_trusted` + `authenticated (private|public)` — **single-server bind modes** (loopback / lan / tailnet / custom), not multi-server topologies

**Distributed execution primitives that DO exist** (since agents and server are decoupled):
- `hermes_gateway` adapter — gateway can run on a different host than Paperclip
- `openclaw_gateway` — same pattern (HTTP wrapper)
- `http` adapter — fire-and-forget webhook to any external agent runtime
- `k8s sandbox provider` plugin — runs agents as pods on a remote cluster

So "agent runs on a different machine than Paperclip" is first-class; "run multiple Paperclip servers and federate them" is not.

## C) What does the Hermes adapter actually do?

**Two built-in adapters, both passive — neither spawns Hermes.** File:line confirmations:

- `packages/adapters/hermes/src/index.ts` L30-37: exports `createHermesLocalServerAdapter` and (via `./gateway`) `createHermesGatewayServerAdapter`
- L155: `createServerAdapter()` returns a `ServerAdapterModule` — execute + sessionCodec + skills integration, **not** a provisioning layer

- `packages/adapters/hermes/src/server/execute.ts` L1-19 header comment:
  > "Spawns `hermes chat -q "..." -Q` as a child process, streams output"

So `hermes_local` is just another **process-adapter subclass**: Paperclip shells out to `hermes chat` *after* the agent row is configured and a heartbeat is triggered. It does **not** install, update, or version-manage the `hermes` CLI binary.

- `packages/adapters/hermes-gateway/README.md` L9-12:
  > "`hermes_gateway` is for an already-running Hermes API server. It does not start the local Hermes CLI."

The gateway path is even more passive: Hermes Gateway must already be running at the URL configured on the agent row; Paperclip just hits `POST /v1/runs`, streams SSE, polls status, `POST /v1/runs/{id}/stop`.

**Both flavors are wired into Paperclip core with no plugin install needed** — `server/src/adapters/registry.ts` L96-98:
```ts
import { createHermesGatewayServerAdapter, createHermesLocalServerAdapter } from "@paperclipai/hermes-paperclip-adapter";
```
and `server/src/adapters/builtin-adapter-types.ts` L12-13 explicitly declares them built-in. Good news: nothing to install; bad news: still passive.

## D) Governance primitives — what's in the box

### Approvals
- **Spec:** `doc/SPEC-implementation.md` L298-309 — schema (types: `hire_agent | approve_ceo_strategy | budget_override_required | request_board_approval`)
- **Service:** `server/src/services/approvals.ts` L11-200 — `list`, `getById`, `create`, `approve`, `reject`, `findOpenHireApprovalForAgent`. Approving a `hire_agent` approval **creates the agent row + sets agent's monthly budget policy** (L127-180)
- **Routes:** `POST /companies/:id/approvals`, `POST /approvals/:id/approve|reject`
- **Hire flow:** CEO strategy approval = board must approve before CEO's delegated work can transition to active execution

### Budget hard-stops
- **Service:** `server/src/services/budgets.ts` — three-layer model (company / agent / project), monthly UTC window (L48-54), `Warn% → warning status`, `100% → hard_stop status` (L66-75). Auto-pause via `cancelWorkForScope` hook (L45)
- **Spec:** L917-963 — soft alert default 80%, hard limit at 100% triggers `agent.status = paused` and blocks new checkout/invocation
- **Database:** `budgetPolicies` + `budgetIncidents` tables

### Activity log / audit
- **Service:** `server/src/services/activity-log.ts` L65-119 — `logActivity(db, input)` writes to `activity_log` table with redaction pipeline
- **Schema:** `actor_type` (agent|user|system), `actor_id`, `action`, `entity_type`, `entity_id`, `details`
- **Plugin event bus hook:** also fans out to plugins for downstream audit consumers
- **Redaction:** `adapter_config`, auth headers, env vars are redacted in logs

### Other governance buildings blocks
- Single-assignee issues with **atomic checkout** (single SQL UPDATE WHERE; 409 on conflict)
- **State machines** for agent / issue / approval
- **Execution locks** (`checkout_run_id`, `execution_run_id`) with board-only recovery
- **Issue thread interactions** (`request_confirmation`, `suggest_tasks`, `ask_user_questions`) + task watchdogs

### What's NOT there
- No SAML/SSO, no per-agent tool allowlist beyond `adapter_type`, no fine-grained per-task policy DSL. RBAC stays "board vs agent" (spec L556-567 explicitly **out of V1**)

## E) What is the Oracle subdir?

**Not a sub-product. Just a Terraform deploy recipe.**

`~/github/paperclip-cloud/oracle/`:
- `README.md`, `main.tf`, `cloud-init.sh`, `setup.sh`, `retry-provision.sh`, `terraform.tfvars`, `variables.tf`

`main.tf` (L1-100): provisions **one Oracle Cloud Always Free ARM VM** (4 OCPUs, 24GB RAM). Singleton.
`cloud-init.sh` (L1-100): on first boot, `apt install docker + node + pnpm`, `git clone paperclipai/paperclip`, `pnpm install + build`, drop a systemd unit for Paperclip, install Caddy as reverse proxy.

**This is "single-click deploy Paperclip on one VM," not a separate service.** The "oracle" directory lives **only** in `paperclip-cloud`, which is a *sibling* of `paperclip` — not a subdir. Paperclip doesn't know Oracle exists.

## F) Federation / externalized config

### DOES exist
- **Declarative adapter registry** — `PAPERCLIP_ADAPTERS` (inline JSON) or `PAPERCLIP_ADAPTERS_FILE` (path). Allows a deployer to lock the adapter picker to a curated allowlist
- **Execution policy bootstrap** — `PAPERCLIP_*` env-var-driven runtime policy
- **Plugin sandbox-provider catalog** — see B above
- **Per-agent `default_environment_id`** — agents are routed to a chosen environment
- **Local plugin SDK + plugin loader** — external adapter plugin packages can be installed at runtime

### DOES NOT exist
- **No multi-server / federated topology.** System is built around one `startServer()` holding one DB pool
- **No remote agent-host provisioning.** Paperclip does not have an SSH driver / cloud-init hook to spin up a new VM and configure an adapter there
- **No service discovery / agent registry federation.** Adapter is hardcoded per row
- **No cross-machine coordination primitives.** No task handoff between Paperclips, no cross-cluster agent migration, no leader election
- **V1 acceptance gate explicitly excludes** "multi-board governance" and "automatic self-healing orchestration"

## Cap matrix vs alternatives

| Capability | Paperclip today | Typical alternative fills |
|---|---|---|
| Single-tenant control plane (companies, agents, issues, approvals, budgets, activity log) | **Shipped, mature** | — |
| Built-in Hermes adapter | **Shipped** (`hermes_local`, `hermes_gateway`) | LangGraph has no Hermes adapter. Archestra is built around Hermes |
| `process` + `http` adapter for any CLI/API | **Shipped** (13+ built-ins) | — |
| Single-machine orchestration (one Paperclip server) | **Shipped** | — |
| Provision an agent on a *new* machine on demand | **Missing** | None fill this cleanly — closest is LangGraph Deploy SaaS or Archestra cloud |
| Federate / multi-server / cross-cluster | **Missing, explicitly out of V1** | "Gardner"-style products position around multi-server clusters |
| Fine-grained RBAC + per-agent tool allowlists | **V1 deferred to Pro/Enterprise** | Archestra leans more governance-y |
| Enterprise SSO + audit export | **V1 excluded** | LangSmith hits this; Archestra targets it |
| In-server plugin SDK + plugin DB namespaces | **Shipped** | — |
| Built-in structured-task watchdog with allowed-mutation whitelist | **Shipped** (very specific) | — |
| Issue tree decomposition + plan-document workflow | **Shipped** | LangGraph Studio is similar conceptually |
| Per-tenant ephemeral sandbox leases per heartbeat | **Shipped** (sandbox-providers catalog) | — |

**Net**: Paperclip is the strongest paper "control plane for autonomous AI companies" today, **especially** for the Hermes story (built-in adapters + rich doc) and the "organization + budgets + governance + activity" story. If Luis doesn't need multi-server federation or fine-grained RBAC, **Paperclip covers ~80% of the goal**. The remaining ~20% (multi-machine provisioning, federated control plane) is the candidate space where alternatives might fit — but as of July 2026 none of them own it definitively.

## Files I created or modified

None — read-only audit. All code references are real `file:line` cites against the working tree at commit `ad961227f` (HEAD of `master` branch pointing to upstream `paperclipai/paperclip`, not the fork branch).
