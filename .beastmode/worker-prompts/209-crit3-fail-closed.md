# TASK: Phase 209 criterion 3 — unowned agents fail closed at the enforcing boundary

Read: .planning/milestones/v8.35-human-accountable-agent-identity-ROADMAP.md § "Phase 209"
(success criterion 3 specifically). Context: criteria 1/2/4/5/6 already landed via v8.37 and
Phase 227 (registered_agents.owner_id exists, ON DELETE SET NULL — the newer deliberate
design; do NOT change it to CASCADE, and do not fight commit 868c60d5's removal-trace design).

Deliver exactly:

1. Owner enforcement inside the authenticate path itself —
   apps/memroos/src/lib/agent/registry.ts. Locate authenticateAgentKey (called by
   authenticateAgentHeaders at line ~779). After a key validates, load the agent row's
   owner_id. If owner_id IS NULL and the agent id is NOT in the service-agent allowlist,
   REJECT (return null) and write an audit entry event_type "agent.auth_denied_unowned"
   (best-effort, never throws) carrying the agent id and key prefix. This makes all 58
   authenticateAgentHeaders call sites fail closed by construction.
2. Service-agent allowlist: a documented, explicit list — env var
   MEMROOS_SERVICE_AGENT_ALLOWLIST (comma-separated agent ids) merged with a small
   in-repo constant list ONLY if the repo already has one (search for existing service
   agent conventions, e.g. sidecar/observe agents; if none, the env var alone is the list,
   default empty). Document in docs/production-deployment.md (short subsection: what
   happens to unowned agents, how to allowlist a service agent, how to find unowned agents).
3. Backfill/report tooling: script scripts/report-unowned-agents.mjs (read-only) that
   prints unowned, non-deregistered agents (id, platform, created_at, last_heartbeat_at) so
   the operator can assign owners or allowlist; wire `npm run report:unowned-agents` in the
   root package.json mirroring existing script conventions.
4. Defect-state queryability (criterion 6 tie-in): if listRegisteredAgents already exposes
   owner filtering (v8.37), ensure a filter for ownerless rows exists (e.g. owner: "none");
   add only if missing.
5. Tests (apps/memroos/src/lib/agent/__tests__/ or wherever registry tests live):
   - valid key + owned agent → authenticates.
   - valid key + unowned agent → null + audit row written.
   - valid key + unowned agent on allowlist (env) → authenticates.
   - deregistered agent stays rejected (existing behavior unchanged).
   Check the existing registry test file for fixture helpers and follow them. Some existing
   tests register agents without owners and then call authenticated surfaces — those
   fixtures will now fail closed; update fixtures to set an owner (there will be a
   registerAgent/RegisterAgentInput ownerUserId field from Phase 209 partials — verify) or
   allowlist them via env in test setup, choosing whichever keeps each test's intent.

CAUTION: this is the highest-blast-radius change in the run (58 call sites). Do not alter
authenticateAgentHeaders' signature. Do not touch call sites. Run the FULL fast suite
(npm test -- --run) at the end, not only targeted tests, and report the exact failure list
if any.
