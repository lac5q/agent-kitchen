/**
 * Phase 64: Closed enum of all valid audit event types (v1 taxonomy).
 *
 * Adding a new event type requires a code change here — the same pattern
 * as SEAL's closed proposal-type registry. This ensures query filters are
 * validated at compile time.
 */

export const AUDIT_EVENT_TYPES = {
  // Agent decisions
  /** Agent matched a task to a capability. */
  AGENT_MATCHED: "agent.matched",
  /** Agent flagged an item for human review. */
  AGENT_FLAGGED: "agent.flagged",
  /** Agent escalated to HIL queue. */
  AGENT_ESCALATED: "agent.escalated",
  /** Agent persisted a crash-resumable checkpoint with provenance receipts. */
  AGENT_CHECKPOINTED: "agent.checkpointed",

  // SEAL proposal lifecycle
  /** Reflection generated a proposal. */
  SEAL_PROPOSED: "seal.proposed",
  /** Operator approved a proposal. */
  SEAL_APPROVED: "seal.approved",
  /** Operator rejected a proposal. */
  SEAL_REJECTED: "seal.rejected",
  /** Isolated apply began. */
  SEAL_APPLY_STARTED: "seal.apply_started",
  /** Apply kept (W_post >= W_baseline). */
  SEAL_APPLY_SUCCEEDED: "seal.apply_succeeded",
  /** Apply rolled back (W_post < W_baseline). */
  SEAL_APPLY_FAILED: "seal.apply_failed",
  /** Manual rollback after apply. */
  SEAL_ROLLED_BACK: "seal.rolled_back",

  // Eval runs
  /** Eval run completed with W score. */
  EVAL_COMPLETED: "eval.completed",
  /** Drift guard halted (agreement < 0.85). */
  EVAL_DRIFT_HALTED: "eval.drift_halted",

  // HIL escalations
  /** Escalation opened. */
  HIL_CREATED: "hil.created",
  /** Escalation resolved (operator/admin). */
  HIL_RESOLVED: "hil.resolved",
  /** SLA deadline passed without resolution (system event). */
  HIL_SLA_BREACHED: "hil.sla_breached",
  /** SLA expired: configured action was notify (durable audit record before notification delivery). */
  HIL_SLA_NOTIFIED: "hil.sla_notified",
  /** SLA expired: escalation abandoned per configured action. */
  HIL_SLA_ABANDONED: "hil.sla_abandoned",

  // Voice / meeting bot
  /** Daily.co meeting bot join was consented and requested. */
  MEETING_JOINED: "meeting.joined",

  // Finance reconciliation vertical
  /** Finance transaction reconciled cleanly. */
  FINANCE_RECONCILIATION_MATCHED: "finance.reconciliation_matched",
  /** Finance transaction mismatched and may need review. */
  FINANCE_RECONCILIATION_MISMATCHED: "finance.reconciliation_mismatched",
  /** Finance transaction requires exception handling. */
  FINANCE_RECONCILIATION_EXCEPTION: "finance.reconciliation_exception",
  /** Finance transaction identified as duplicate. */
  FINANCE_RECONCILIATION_DUPLICATE: "finance.reconciliation_duplicate",

  // Belief promotion pipeline (Phase 122)
  /** Candidate admitted silver -> gold after passing all deterministic checks. */
  BELIEF_PROMOTED: "belief.promoted",
  /** Gold candidate demoted back to silver (source invalidation, conflict supersession, manual). */
  BELIEF_DEMOTED: "belief.demoted",
  /** High-stakes candidate routed to human-review queue (fail-closed). */
  BELIEF_QUEUED_FOR_REVIEW: "belief.queued_for_review",
  /** Operator approved a queued candidate via review (candidate then admitted). */
  BELIEF_REVIEW_APPROVED: "belief.review_approved",
  /** Operator rejected a queued candidate. */
  BELIEF_REVIEW_REJECTED: "belief.review_rejected",
  /** canAdmitToGold denied admission for a candidate. Receipt only -- no gold mutation. */
  BELIEF_ADMISSION_DENIED: "belief.admission_denied",

  // Admin / system
  /** Annotation added to a prior entry (metadata_json.ref_entry_id). */
  AUDIT_ANNOTATION: "audit.annotation",
  /** Admin changed compliance posture controls. */
  ADMIN_COMPLIANCE_UPDATED: "admin.compliance_updated",

  // Knowledge vault access (Phase 125, ENTOPS-03)
  /** Knowledge MCP op (read/write/delete) was centrally audited. Per-tenant hash-chained. */
  KNOWLEDGE_ACCESS: "knowledge.access",

  // Policy engine (Phase 128, POLGOV-01/02)
  /** A decision (retrieval/memory/knowledge/capability) was evaluated through the shared policy engine. */
  POLICY_DECISION: "policy.decision",
} as const;

/** Union type of all valid audit event type string values. */
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[keyof typeof AUDIT_EVENT_TYPES];

/** Valid entity types for audit entries. */
export const ENTITY_TYPES = {
  AGENT: "agent",
  AGENT_CHECKPOINT: "agent_checkpoint",
  AGENT_MEMORY_CANDIDATE: "agent_memory_candidate",
  BELIEF_PROMOTION_DECISION: "belief_promotion_decision",
  BELIEF_REVIEW_ITEM: "belief_review_item",
  SEAL_PROPOSAL: "seal_proposal",
  EVAL_RUN: "eval_run",
  HIL_ESCALATION: "hil_escalation",
  MEETING: "meeting",
  FINANCE_RECONCILIATION: "finance_reconciliation",
  COMPLIANCE_CONTROL: "compliance_control",
  /** Per-tenant knowledge vault accessed via the knowledge MCP (Phase 125, ENTOPS-03). */
  KNOWLEDGE_VAULT: "knowledge_vault",
  /** A shared-policy-engine decision (Phase 128, POLGOV-01/02). */
  POLICY_DECISION: "policy_decision",
} as const;

export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];

/** Valid actor roles for audit entries. */
export const ACTOR_ROLES = {
  ADMIN: "admin",
  OPERATOR: "operator",
  REVIEWER: "reviewer",
  SYSTEM: "system",
} as const;

export type ActorRole = (typeof ACTOR_ROLES)[keyof typeof ACTOR_ROLES];
