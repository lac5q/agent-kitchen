# TASK: Phase 210b-2 — clearance columns + lattice + knowledge-mcp reads the store

Read: .planning/milestones/v8.35-human-accountable-agent-identity-ROADMAP.md
§ "210 design resolution (2026-08-03)" and § "210b — Clearance, intersection, and
non-inheritance" items 5 and 9. Foundation already landed: 210b-1
(apps/memroos/src/lib/auth/capabilities.ts — catalog + ROLE_CAPABILITIES + hasCapability +
requireRole facade, commit c401a1bb).

Deliver:

1. Clearance lattice module apps/memroos/src/lib/auth/clearance.ts:
   ordered levels ["public","internal","confidential","restricted"] (check
   services/knowledge-mcp document classification vocabulary first — grep mcp_server.py
   around line ~587 and knowledge_system for the sensitivity labels actually used (MSIQ-01
   labels); the lattice MUST reuse the exact existing label vocabulary, do not invent one).
   Export type ClearanceLevel, DEFAULT_USER_CLEARANCE, DEFAULT_AGENT_CLEARANCE (lowest),
   clearanceDominates(a, b), clampClearance(requested, cap).
2. Schema: add `clearance` TEXT columns to users and registered_agents with CHECK constraints
   on the lattice values, defaulting users to "internal" and agents to the LOWEST level.
   Follow the newest migration pattern in db-schema.ts (same as Phase 227 tables), bump
   schema version. Backfill: existing users get clearance by role (admin→"restricted",
   operator→"confidential", reviewer→"internal") in the migration; existing agents get the
   default lowest unless owner is admin/operator — NO, keep it simple and safe: ALL existing
   agents get the lowest level; the operator raises specific agents deliberately (P3).
3. Store accessors via the chokepoint (lib/store/): getUserClearance(userId),
   getAgentClearance(agentId), setUserClearance / setAgentClearance with audit entries
   ("clearance.changed", carrying old/new/actor).
4. knowledge-mcp reads the store instead of self-asserted role:
   services/knowledge-mcp/knowledge_system/mcp_server.py resolves clearance from
   MEMROOS_AGENT_ROLE env or an agent_role tool argument (~line 587) — replace the
   AUTHORITY: the document-classification filter must consult stored clearance for the
   requesting agent id. Mechanism: the knowledge-mcp service reaches the app DB — check how
   it already reads app state (does it open the SQLite directly? grep for conversations.db /
   SQLITE_DB_PATH in services/knowledge-mcp). If it has direct SQLite read access, read the
   clearance column directly (read-only) with the env var kept ONLY as a fallback when the
   DB row is missing, and log which source was used. If it has no DB access, add a small
   authenticated app endpoint GET /api/agents/:id/clearance (agent key or operator) and call
   it with short cache (60s). Choose based on what exists; explain the choice in your report.
   The agent_role TOOL ARGUMENT must stop being an authorization input entirely (accept and
   ignore with a deprecation note in the docstring, so callers don't break).
5. Tests: lattice ordering/clamp; migration produces columns + backfill values; store
   accessors audit; python-side: filter consults stored clearance (mock the store source),
   tool-argument role no longer changes visibility.

Run full fast suite + typecheck at the end. Python: run the targeted test file.
