# TASK: Phase 210b-4 — migrate proxy.ts + highest-value routes to requireCapability; ratchet down

Read: .planning/milestones/v8.35-human-accountable-agent-identity-ROADMAP.md § "210 design
resolution" (the façade/ratchet paragraph) and § "210b" item 8. Foundation in this tree:
capabilities catalog + hasCapability + requireRole façade (210b-1), effectiveAgentAccess
(210b-3).

Deliver:

1. requireCapability(request/session, capability) helper beside requireRole in the auth lib —
   same return/throw conventions as requireRole so routes swap cleanly (inspect how
   requireRole is consumed by routes/middleware first; mirror it).
2. Migrate the highest-value consumers from requireRole/ROLE_RANK to requireCapability:
   - apps/memroos/src/lib/... proxy.ts lines ~202/210/216 (admin/operator/reviewer gates —
     find the file via grep "ROLE_RANK" — pick capabilities that reproduce current semantics
     via ROLE_CAPABILITIES exactly; the equivalence test from 210b-1 is the safety net).
   - The top ~10 non-test requireRole call sites by sensitivity: keys issuance, user
     management, invites, policy write, audit export, agents manage. Grep for candidates and
     choose by CAPABILITY names that exist in the catalog; each migrated site keeps identical
     behavior (capability chosen = one that ROLE_CAPABILITIES grants to exactly the same
     role set as before).
3. Ratchet: scripts/check-role-rank-callsites.mjs counting non-test requireRole/ROLE_RANK
   references with a baseline file (mirror scripts/check-sqlite-allowlist or
   check:lib-boundary conventions exactly — same output style, same package.json wiring
   `check:role-rank-callsites`, same CI hook if the others are in CI — check
   .github/workflows). Baseline = the count AFTER your migration (record before/after in
   your report; roadmap says ~94 before 210b-1's facade, 74 at 210b-1; expect lower now).
   The gate fails when the count RISES above baseline.
4. Tests: migrated routes behave identically for admin/operator/reviewer (reuse or extend
   the 210b-1 equivalence test); ratchet script exits 0 at baseline and 1 when a synthetic
   file adds a requireRole reference (test via a temp fixture or unit-test the counter
   function).

Run full fast suite + typecheck + the new check script. Do NOT delete ROLE_RANK or
requireRole — the façade stays until the baseline reaches zero in a later phase.
