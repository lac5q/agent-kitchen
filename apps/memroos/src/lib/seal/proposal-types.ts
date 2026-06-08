// Leaf type module; no imports from seal siblings.
// Breaks circular: types.ts <-> proposal-registry.ts.
export type ProposalType =
  | "noop_test"
  | "memory_rewrite"
  | "query_hint"
  | "salience_update"
  | "tier_route"
  | "skill_revision"
  | "agent_instruction_patch"
  | "skill_addition"
  | "tool_routing_update"
  | "eval_case_addition";
