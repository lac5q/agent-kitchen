# MemRoOS Architecture Review — 2026-07-24

Date: 2026-07-24
Scope: `apps/memroos` (kernel), `services/*`, `contracts/`, `scripts/`, `.github/workflows/`, `.planning/ROADMAP.md`
Method: static survey of the repo at `claude/memros-architecture-review-46a0b2` (main @ `9b3b0c75`). No live system was reached; every claim below is repo-verifiable.

## Bottom Line

The architecture described in `docs/architecture.md` is sound and the kernel is genuinely well-defended in the places it has been deliberately hardened (proxy default-deny, versioned SQLite migrations, contract drift gates, 403-not-401 onboarding semantics). The problem is not the design — it is that **the enforcement surface has not kept pace with the delivery surface**.

Three specific consequences, in priority order:

1. The current highest-priority milestone (v8.20 CONNMEM) has **7,051 lines of tested Python with no runtime path and no CI coverage**. It is marked "LANDED... release gate green."
2. The one topology contract CI enforces describes **local-dev only**, while production has moved to oracle-1. The deployment that serves users is ungated.
3. The route-auth CI gate is **enumeration-blind**: it validates a hand-maintained file list, so a new route file under an exempted prefix would be auth-exempt *and* invisible to the gate.

None of these are "the architecture is wrong." They are all "a contract exists but does not cover the thing it names." That is the theme, and it is what the roadmap recommendations below target.

## What Is Solid — Keep and Extend

- **Proxy is default-deny.** `apps/memroos/src/proxy.ts:202` requires at minimum `reviewer` rank for every `/api/*` route not explicitly listed. Adding a route without thinking about auth fails closed. This is the right shape.
- **Schema migrations are versioned.** `PRAGMA user_version` + ordered `SCHEMA_MIGRATIONS` (`lib/db-schema.ts:77-259`) with idempotent additive steps. ARCHREV-03 delivered real durability, not a checkbox.
- **SQLite ownership split is disciplined and documented.** Kernel DB and `orchestration.db` never cross-open; table-level ownership within the shared file is written down.
- **Test mass is real.** 403 test files / 86,494 test LOC against 709 source files / ~134k source LOC in `apps/memroos/src`. That is a healthy ratio, not theater.
- **The drift-gate instinct is correct.** `check:contracts`, `check:runtime-topology`, `check:route-auth-boundary`, `check:next-trust-boundary`, `check:recall-canary` are the right *category* of control. The recommendations below widen their coverage rather than replacing them.

## Findings

### F1 — `services/connmem` has no runtime path (highest priority)

`services/connmem` is 25 Python modules / 7,051 LOC / 141 test functions across 10 test files. It is also:

- **Not in CI.** `.github/workflows/ci.yml` runs `pytest` for `knowledge-mcp`, `orchestration`, and `voice-server`. `connmem` appears nowhere in the file. Its 141 tests have never run on a PR.
- **Not in compose.** `docker-compose.local.yml` services are `memroos, mem0, ollama, ollama-pull, neo4j, orchestration`.
- **Not in the topology manifest.** `runtime-topology.json` lists 5 services; `connmem` is not one of them.
- **Not reachable.** Zero references to `connmem` from any `.ts`, `.tsx`, `.mjs`, `.sh`, `.json`, or compose file outside a branch-name filter in `install-regression.yml:42`. No `/api/connmem` route exists.
- **Not runnable.** No `FastAPI`, `uvicorn`, `def main`, or `if __name__ == "__main__"` in any `services/connmem/*.py`.

The roadmap records this as "CONNMEM-02..10 **LANDED on main**... 141/141 connmem tests pass, release gate green," with the only caveat being live provider credentials. That framing is wrong in a way that matters: credentials are not the blocker. **There is nothing for credentials to run.** The library is complete; the integration is absent.

This should be corrected in the roadmap text before anything else, because it currently reads as "one API key away from done" to any agent or operator picking up the milestone.

### F2 — The enforced topology manifest does not describe production

`apps/memroos/src/lib/runtime-topology.json` declares `"profile": "local-dev"` and covers `memroos-app`, `mem0-memory`, `orchestration-service`, `voice-server`, `agentmemory-engine`. `knowledge-mcp`, `connmem`, and `healthcheck` are absent entirely.

`npm run check:runtime-topology` validates this manifest against `docker-compose.local.yml`, `start.sh`, and launchd — three local supervision modes. Production is oracle-1 behind a Cloudflare Tunnel (`docs/production-deployment.md`, `docs/cloud-operator-oracle1-runbook.md`), supervised by neither compose nor launchd.

Net effect: the single source of truth for "what runs where, on which port, with which health path" is enforced *only* for the environment that does not serve users. Production topology lives in prose runbooks with no drift gate. ARCHREV-04's guarantee silently stopped applying when v8.15 moved the operator to oracle-1.

### F3 — The route-auth gate cannot see new files

`proxy.ts:79-103` exempts five *prefix* patterns from proxy-level auth, delegating to handler-local checks:

| Prefix | Routes on disk | Routes listed in the gate |
| --- | --- | --- |
| `/api/gsd` | 10 | 10 |
| `/api/agent-context` | 5 | 5 |
| `/api/skillforge/` | 4 | 4 |
| `/api/chatgpt/actions/` | 4 | 3 + 1 documented as public metadata |
| `/api/memory/evals/` | 2 | 2 |

Today these are in sync — there is no live hole. But `scripts/check-route-auth-boundary.mjs` works by reading a hardcoded `routeLocalAuthCoverage` array and asserting each *listed* file contains an auth marker. It never enumerates the filesystem. Adding `apps/memroos/src/app/api/gsd/anything/route.ts` would be exempted from proxy auth by the `/^\/api\/gsd(?:\/|$)/` pattern and would produce **zero CI errors**.

The gate protects against removing auth from a known route. It does not protect against the more likely failure — adding a route inside a blanket-exempt namespace. That is a one-function fix (glob the prefix, require a marker on every match) and it should not wait for a milestone.

### F4 — No data-access chokepoint under the governance spine

- 137 `CREATE TABLE` statements in a single 3,908-line `lib/db-schema.ts`.
- 117 non-test modules import `better-sqlite3` directly.
- 145 of 235 `route.ts` files call `getDb()` / `db.prepare()` themselves.
- 111 non-test `lib/` modules do the same.

`docs/architecture.md:144` states a **native governance spine**: every action follows `Actor → Action → Asset → Purpose → Label → Decision → AuditEvent`. With SQL scattered across 262 modules, that contract is enforced by *reviewer discipline at each call site*, not by structure. `check:governance` samples coverage; it cannot make the invariant unbypassable.

This is the largest compounding cost in the codebase. Every new domain (connmem, tool-auth, paperclip) re-derives its own SQL, its own audit emission, and its own label handling. It is also why `db-schema.ts` grows monotonically — there is no per-domain owner for a table.

The fix is not a big-bang ORM migration. It is a `lib/store/` chokepoint where audit/label/purpose are structurally unavoidable, plus a lint rule that new `better-sqlite3` imports outside `lib/store/` fail CI. Existing call sites migrate opportunistically.

### F5 — `lib/` module boundary has drifted

79 flat `.ts` files sit at `lib/` root alongside 39 subdirectories, and the same domain lives in both:

- `lib/memory/` (18 files) **and** `memory-inventory.ts`, `memory-recall-evals.ts`, `memory-decay.ts`, `memory-doctor.ts`, `memory-consolidation.ts`, `memory-policy-lab.ts`, `memory-trace-observability.ts`, `memory-graph-catchup-scheduler.ts`, `memory-retention-expiry-scheduler.ts`, `meeting-qmd-recall.ts`, `recollection-policy.ts` at root.
- Eleven `agent-*.ts` files at root with no `lib/agent/` directory at all.

The "Placement Rules" table in `docs/architecture.md:73-79` distinguishes `app` / `lib` / `services` / `scripts` but says nothing about root-vs-subdirectory inside `lib`. There is no rule to violate, which is exactly why it drifted. This is cheap to fix and high-value for agent navigation — an agent asked to "change memory retention" currently has to search two places.

### F6 — `api-client.ts` is a single client-side barrel

2,315 lines, 181 exports, `"use client"` at the top, imported by 83 files. Every React Query hook for every domain — NOC, agents, evals, memory, paperclip, tool-attention — in one module. Any component that needs one hook pulls the whole graph into the client bundle. It is also a permanent merge-conflict surface for parallel agent sessions, which matters given how this repo is developed.

### F7 — Contract manifest covers 3 of the surfaces that can break

`contracts/memroos-contracts.json` covers `public-eval-api.v1`, `memroos-a2a.v1`, `memroos-mcp-tools.v1`. Not covered:

- The **REST shim agent-write paths** external agents actually depend on: `/api/agent-memory/*`, `/api/heartbeat`, `/api/recall/ingest`, `/api/tool-attention/record`, `/api/agents/register`. These are the routes a silent break would strand fleet agents on.
- The **Paperclip seam** (v8.22, `/api/paperclip/*`), which is explicitly a cross-product boundary.
- The forthcoming **tool-auth plane** (v8.23 TOOLAUTH-05 `tool_auth.getCredentials`), which is designed as a stable surface for future integrations — the exact definition of a thing that needs a versioned contract from day one.

The manifest mechanism works. It is just pointed at the three surfaces that were hardened first, not the three most expensive to break.

### F8 — Gate proliferation without a single entry point

62 npm scripts, 20+ `check:*` gates, 8 wired into `ci.yml`. There is no `npm run verify` that runs the enforced set. A contributor — human or agent — cannot determine which gates are load-bearing without reading `ci.yml`. Related coverage holes in the same workflow: `services/memory` gets `py_compile` only (no tests), and `services/connmem` gets nothing (F1).

## Roadmap Recommendations

Next available phase number is **185** (max in `ROADMAP.md` is 184). Proposed as three milestones in the existing format.

### Correction to apply first (not a milestone)

Amend the v8.20 line in `## Milestones` to state the actual blocker. Suggested replacement for the parenthetical:

> **CONNMEM-02..10 library complete on main** — `services/connmem` (25 modules, 141 tests). **Not yet integrated:** no service entrypoint, no compose/topology entry, no kernel route, and the 141 tests do not run in CI. Live backfill is blocked on integration (Phase 185), not only on Linear/Circleback credentials.

Rationale: the current text tells the next agent that credentials are the only gap. That is the difference between a half-day task and a milestone.

---

### v8.27 Connected Work Memory Runtime Integration — Phase 185

**Goal:** Give `services/connmem` a runtime path so the v8.20 library becomes a running subsystem, and put its 141 tests behind CI.
**Depends on:** v8.20 Phase 176 (library complete), v8.15 (oracle-1 operator).
**Requirements:** CONNMEM-RT-01..05

- **CONNMEM-RT-01 — Service entrypoint.** `services/connmem` exposes a supervised process (FastAPI + uvicorn, matching `services/orchestration`) with `/health`, or is explicitly re-scoped as an in-process library invoked by a named kernel route. Pick one and record the decision; the current state is neither.
- **CONNMEM-RT-02 — CI coverage.** `.github/workflows/ci.yml` Python job runs `pytest services/connmem/tests`. 141/141 green on PR, not on a developer's machine.
- **CONNMEM-RT-03 — Topology + compose registration.** `connmem` added to `runtime-topology.json` with ports, health path, `dependsOn`, and supervision modes; `docker-compose.local.yml` service added; `npm run check:runtime-topology` passes.
- **CONNMEM-RT-04 — Kernel seam.** A `/api/connmem/*` route (or documented equivalent) that authenticates via the existing agent/operator path, appears in `check-route-auth-boundary` coverage, and lets the operator trigger sync + read ledger state.
- **CONNMEM-RT-05 — Release-gate honesty.** The Phase 176 release gate cannot report green while RT-01..04 are open. Update the gate script to assert runtime reachability, not just test-suite exit code.

**Success criteria:**
1. `docker compose up` starts connmem; `/api/health` reports it; `memroos status` shows it.
2. CI fails if a connmem test breaks.
3. A dry-run sync against fixture data completes end-to-end through the kernel route with a sync-ledger row written.
4. The only remaining blocker to live backfill is genuinely provider credentials.

---

### v8.28 Enforcement Surface Parity — Phases 186-187

**Goal:** Make the drift gates cover the deployment and the routes that actually exist, rather than the ones enumerated when each gate was written.

#### Phase 186 — Production Topology Profile

**Requirements:** TOPOPROD-01..04

- **TOPOPROD-01** — `runtime-topology.json` gains a `production` profile (oracle-1) alongside `local-dev`; `knowledge-mcp` and `healthcheck` added to both.
- **TOPOPROD-02** — `check:runtime-topology` validates the production profile against the actual supervision mechanism on oracle-1 (systemd unit files / Cloudflare Tunnel config committed to `deploy/`), the same way it validates compose and launchd today.
- **TOPOPROD-03** — `docs/production-deployment.md` and `docs/cloud-operator-oracle1-runbook.md` derive their service/port/health tables from the manifest rather than restating them, so prose cannot drift from the gate.
- **TOPOPROD-04** — `scripts/verify-onboarding-deploy.sh` extended into a post-deploy profile check that asserts every `required: true` production service is healthy.

**Success criteria:** changing a production port or health path without updating the manifest fails CI. The oracle-1 runbook and the manifest cannot disagree.

#### Phase 187 — Filesystem-Driven Auth Gate

**Requirements:** AUTHGATE-01..03

- **AUTHGATE-01** — `check-route-auth-boundary.mjs` enumerates the filesystem for every prefix pattern in `ROUTE_LOCAL_AUTH_API_ROUTES` and requires an auth marker on *every* matching `route.ts`. Public-metadata exceptions become an explicit allowlist with a stated reason, not an untested comment.
- **AUTHGATE-02** — The gate additionally asserts no `route.ts` exists outside both the proxy's default-deny path and the coverage list — closing the "new namespace, no auth" case.
- **AUTHGATE-03** — A regression test adds a fixture route under an exempt prefix with no auth marker and asserts the gate fails. Gates that have never been seen to fail are not known to work.

**Success criteria:** creating `api/gsd/<anything>/route.ts` without a handler-local auth call fails CI. Phase 187 is small; it should land ahead of Phase 186 if capacity is tight.

---

### v8.29 Structural Debt Paydown — Phases 188-190

**Goal:** Remove the three structures that make every subsequent milestone more expensive. Explicitly incremental — no big-bang rewrites, each phase lands behind a gate that prevents regression.

#### Phase 188 — Data-Access Chokepoint

**Requirements:** STORE-01..04

- **STORE-01** — `lib/store/` with per-domain modules owning their tables. Governance fields (`actor, action, asset, purpose, label, decision`) are required arguments on write paths, so an ungoverned write does not typecheck.
- **STORE-02** — `db-schema.ts` split by domain (`lib/store/<domain>/schema.ts`), migrations still ordered through the single `user_version` runner. Mechanical, low-risk, high-readability.
- **STORE-03** — ESLint rule: `better-sqlite3` may only be imported from `lib/store/**` and test files. Existing violations enter an explicit, shrinking allowlist; new ones fail CI.
- **STORE-04** — Two domains migrated as proof (recommend `memory` and `audit` — highest governance stakes), with the allowlist reduced accordingly.

**Success criteria:** a new domain cannot write to SQLite without emitting an audit event, because the API offers no other path. Allowlist size is tracked and monotonically decreasing.

#### Phase 189 — `lib/` Boundary Normalization

**Requirements:** LIBNORM-01..03

- **LIBNORM-01** — `docs/architecture.md` Placement Rules gain an explicit rule: **domain logic lives in `lib/<domain>/`; `lib/` root is reserved for cross-cutting primitives** (`env.ts`, `db.ts`, `paths.ts`, `constants.ts`, `api-error.ts`). Write the rule before moving files.
- **LIBNORM-02** — Consolidate the two worst offenders: all `memory-*.ts` and `meeting-qmd-recall.ts` / `recollection-policy.ts` into `lib/memory/`; all `agent-*.ts` into `lib/agent/`. Use `rename` (call-graph aware) per `AGENTS.md`, not find-and-replace.
- **LIBNORM-03** — `check:lib-boundary` script fails on new root-level files outside the reserved primitives list.

**Success criteria:** `lib/` root drops from 79 files to the reserved set plus a declared, shrinking exception list. An agent asked to change memory behavior has exactly one directory to search.

#### Phase 190 — Client Barrel Split

**Requirements:** CLIENTSPLIT-01..02

- **CLIENTSPLIT-01** — `lib/api-client.ts` split into `lib/api-client/<domain>.ts` mirroring the F5 domain boundaries. Re-export shim kept for one milestone, then removed.
- **CLIENTSPLIT-02** — Measure and record client bundle size for the three heaviest routes before and after in the phase closeout.

**Success criteria:** no single client module exceeds ~400 lines; measured bundle reduction on the NOC and operator console routes.

---

### Cross-cutting, fold into whichever milestone lands first

- **Contract manifest expansion (F7).** Add `memroos-rest-shim.v1` covering the agent-write paths, and require v8.23 TOOLAUTH-05 to ship *with* a contract entry rather than adding one later. Cheapest possible insurance on the surfaces external agents depend on.
- **Single verify entry point (F8).** `npm run verify` = the exact gate set `ci.yml` runs, in order. One command that answers "will CI pass." Add `services/memory` tests to the Python job while touching it.

## Sequencing Opinion

If only one thing ships: **Phase 187** (auth gate, hours of work, closes a fail-open path).

If only one milestone ships: **v8.27** (CONNMEM runtime), because the roadmap's stated highest priority is currently blocked on something the roadmap does not name.

**v8.29 should not be deferred indefinitely.** F4 in particular is a compounding tax — every milestone from v8.23 onward (tool-auth vault writes, paperclip seam, connmem projections) adds new ungoverned SQL call sites. The cost of STORE-01..04 goes up with each one. Landing STORE-03 (the lint rule) early is valuable even if the migration itself is slow, because it stops the bleeding while the backlog drains.

Note also that **v8.19 Phase 175 (runtime bottleneck evidence) is a prerequisite for any performance-motivated rewrite**, and its measurement runs are still deferred. None of the recommendations above are performance-motivated — they are correctness, enforcement, and maintainability — so they do not need Phase 175 to unblock. Keep it that way; do not let structural cleanup get bundled into a runtime-rewrite decision that has no evidence behind it yet.
