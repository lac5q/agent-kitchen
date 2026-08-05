# Beastmode acceptance contract — GSD burn-down 2026-08-04

Goal: implement every remaining unblocked GSD phase — 228 (ONBRESCUE-01..05),
229 (AGENTREPORT-01..05), 209 crit-3, 210b-2, 210b-3, 210b-4, 195 (ADOPTTEL-01..05),
190 (CLIENTSPLIT-01..02) — on branch claude/gsd-roadmap-onboarding-3889e0, one commit per
phase, PR at the end.
Non-goals: 175/176 (credential-gated), 126-127 (IdP/MDM), Voyage/166, production deploys
(operator runbook in STATE.md), sending any email/invite.
User-visible acceptance: fast suite + typecheck + lint green per phase; new gates
(role-rank ratchet, GSD memory closeout) wired like existing check:* scripts; /security-review
clean before PR; detect_changes run before commits when the GitNexus index is usable.
Seats: Director = claude-fable-5 (this session). Executor = codex gpt-5.6-luna,
model_reasoning_effort=max (operator-selected). Validator = codex gpt-5.6-sol,
model_reasoning_effort=high (operator-selected). Lane proof: LUNA OK / SOL OK 2026-08-04.
Autonomy: high (operator-directed). Escalation triggers: auth-model semantic changes beyond
the 210b design resolution, schema migrations losing data, executor failing the same
acceptance check twice, secrets in any diff.
Verification commands: npm test -- --run; npm run typecheck; npm run lint;
npm run test:slow -- --run (once, before PR); node scripts for new check:* gates.
Self-improvement log: .beastmode/learnings/2026-08-04-gsd-burndown.md
Phase order: 228 → 229 → 209crit3 → 210b-2 → 210b-3 → 210b-4 → 195 → 190.
