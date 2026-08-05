# TASK: Phase 210b-3 — P2 intersection in one place; P3 granting rules + expiry

Read: .planning/milestones/v8.35-human-accountable-agent-identity-ROADMAP.md
§ "210 design resolution (2026-08-03)" ("P3's granting authority and cap — decided") and
§ "210b" items 6-7 + the space_members hazard note. Depends on 210b-2 (clearance store,
already in this working tree) and 210b-1 (hasCapability).

Deliver:

1. P2 intersection, exactly one place: apps/memroos/src/lib/auth/effective-access.ts:
   effectiveAgentAccess(agentId) → { capabilities: Set<Capability>, clearance: ClearanceLevel }
   computed as agent grants ∩ owner grants (capabilities: set intersection between the
   agent's granted capability strings — agent_capabilities table — mapped into the catalog
   vocabulary, and the owner's ROLE_CAPABILITIES set; clearance: min(agentClearance,
   ownerClearance) on the lattice). Unowned agent (post-209-crit-3 only service agents) →
   capabilities from grants alone but clearance capped at the LOWEST level. Explicit grants
   keyed by principal type only — NEVER compute over space_members (no FK on member_id;
   humans and agents share one id namespace — cite this in a comment).
2. P3 granting rules: apps/memroos/src/lib/auth/clearance-grants.ts:
   - grantAgentClearance(actorUserId, agentId, level): allowed when actor is the agent's
     owner AND level is STRICTLY BELOW the actor's own clearance. Writes audit
     "clearance.granted".
   - grantAgentClearanceParity(actorUserId, agentId, approverUserId, level, ttlHours<=24):
     parity with owner requires a SECOND authority (approver has users:manage capability or
     admin role, approver != actor) and is TIME-BOUNDED — store expires_at; a sweep in the
     read path (getAgentClearance or effectiveAgentAccess) treats expired parity grants as
     lapsed back to the standing level. Audit "clearance.parity_granted" with approver +
     expiry. Rationale comment: prompt injection — an agent reads untrusted text; whatever
     it can see is what an injection can exfiltrate.
   - Schema: either a clearance_grants table (preferred: history + expiry) or columns on
     registered_agents (standing_clearance + parity_expires_at). Choose the table; follow
     the newest migration pattern; agents' effective clearance = parity if unexpired else
     standing.
3. Non-vacuous tests (the roadmap names these explicitly):
   - Raising the owner's clearance leaves the agent's clearance unchanged.
   - The owner ALONE cannot raise the agent to the owner's own level (strictly-below rule).
   - Parity requires a distinct second authority and expires (fake timers or injected clock).
   - Intersection: agent never exceeds owner on either axis; unowned service agent capped
     lowest.
4. Wire effectiveAgentAccess into ONE high-value consumer to prove the seam (do not migrate
   the world — that is 210b-4): the knowledge-mcp clearance source from 210b-2 should read
   the EFFECTIVE clearance (min/parity logic) — if 210b-2 added an endpoint, route it
   through effectiveAgentAccess; if it reads SQLite directly, add the parity/min logic to
   that read path in one shared place (a SQL view or the accessor) so the two lanes cannot
   disagree.

Run full fast suite + typecheck. Report every decision the spec left open.
