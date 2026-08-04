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
  /** An admin entered a read-only view-as session. */
  VIEW_AS_START: "view_as.start",
  /** A view-as session was exited. */
  VIEW_AS_EXIT: "view_as.exit",

  // Knowledge vault access (Phase 125, ENTOPS-03)
  /** Knowledge MCP op (read/write/delete) was centrally audited. Per-tenant hash-chained. */
  KNOWLEDGE_ACCESS: "knowledge.access",

  // Policy engine (Phase 128, POLGOV-01/02)
  /** A decision (retrieval/memory/knowledge/capability) was evaluated through the shared policy engine. */
  POLICY_DECISION: "policy.decision",

  // Paperclip tenant integration (Phase 146, FLEET-18)
  /** A Paperclip activity event was ingested into MemroOS for NOC/audit visibility. */
  PAPERCLIP_ACTIVITY: "paperclip.activity",

  // Skill governance (Phase 148-150, SKILLTRUST)
  /** Skill quarantine stage transition. */
  SKILL_QUARANTINE_TRANSITIONED: "skill.quarantine.transitioned",
  /** Skill lifecycle state transitioned. */
  SKILL_LIFECYCLE_TRANSITIONED: "skill_lifecycle_transitioned",
  /** Skill deprecated notification for dependent. */
  SKILL_LIFECYCLE_DEPRECATED: "skill_lifecycle_deprecated",
  /** Skill signed (Ed25519). */
  SKILL_SIGNED: "skill.signed",
  /** Skill sync approved. */
  SKILL_SYNC_APPROVED: "skill.sync.approved",
  /** Skill sync rejected. */
  SKILL_SYNC_REJECTED: "skill.sync.rejected",
  /** Skill sync proposal approved (id-based). */
  SKILL_SYNC_PROPOSAL_APPROVED: "skill.sync.proposal.approved",
  /** Skill sync proposal rejected. */
  SKILL_SYNC_PROPOSAL_REJECTED: "skill.sync.proposal.rejected",
  /** Skill version pin created. */
  SKILL_PIN_CREATED: "skill.pin.created",
  /** Skill version pin updated. */
  SKILL_PIN_UPDATED: "skill.pin.updated",
  /** Skill version pin rolled back. */
  SKILL_PIN_ROLLED_BACK: "skill.pin.rolled_back",
  /** Skill import proposal approved. */
  SKILL_PROPOSAL_APPROVED: "skill.proposal.approved",
  /** Skill import proposal rejected. */
  SKILL_PROPOSAL_REJECTED: "skill.proposal.rejected",
  /** Skill sync pinned. */
  SKILL_SYNC_PINNED: "skill.sync.pinned",
  /** Skill sync unpinned. */
  SKILL_SYNC_UNPINNED: "skill.sync.unpinned",
  /** Skill sync rolled back. */
  SKILL_SYNC_ROLLED_BACK: "skill.sync.rolled_back",

  // Memory lifecycle (v8.7, MEMLIFE-01..02)
  /** Retention policy selected, unavailable, or conflicted for a record. */
  MEMORY_RETENTION_DECISION: "memory.retention.decision",
  /** Scheduled retention expiry run started, completed, failed, or replayed. */
  MEMORY_RETENTION_EXPIRY_RUN: "memory.retention.expiry_run",
  /** Legal hold created, updated, released, or expired. */
  MEMORY_LEGAL_HOLD: "memory.legal_hold",
  /** Subject erasure plan created with reviewable non-sensitive coverage. */
  MEMORY_SUBJECT_ERASURE_PLANNED: "memory.subject_erasure.planned",
  /** Subject erasure plan approved by an operator for the exact current hash. */
  MEMORY_SUBJECT_ERASURE_APPROVED: "memory.subject_erasure.approved",
  /** Subject erasure execution completed, blocked, incomplete, or failed. */
  MEMORY_SUBJECT_ERASURE_EXECUTED: "memory.subject_erasure.executed",
  /** Episodic decay run completed with per-record skip/decay receipts. */
  MEMORY_DECAY_RUN: "memory.decay.run",

  // Memory lifecycle v8.7 MEMLIFE-05: consolidation, vault, DSAR, offboarding, tombstones
  /** A consolidation cycle has begun for a scoped batch (success, failed, or skipped). */
  MEMORY_CONSOLIDATION_RUN: "memory.consolidation.run",
  /** A consolidation cycle wrote a new ontology summary after raw-vault integrity verification. */
  MEMORY_CONSOLIDATION_SUMMARY: "memory.consolidation.summary",
  /** Raw vault write succeeded with integrity hash and classification. */
  MEMORY_VAULT_WRITE: "memory.vault.write",
  /** Raw vault replay completed and the artifact hash matched the persisted record. */
  MEMORY_VAULT_REPLAY: "memory.vault.replay",
  /** Raw vault durability failure (db/file/rename/key/hash fault). */
  MEMORY_VAULT_FAILURE: "memory.vault.failure",
  /** Subject export (DSAR) request identity-verified and manifest produced. */
  MEMORY_SUBJECT_EXPORT: "memory.subject.export",
  /** Subject delete (DSAR) request identity-verified and erasure plan/status produced. */
  MEMORY_SUBJECT_DELETE: "memory.subject.delete",
  /** Offboarding triggered a pending MEMLIFE review (does not claim erasure complete). */
  MEMORY_OFFBOARDING_PENDING: "memory.offboarding.pending",
  /** Tombstone written for a completed erasure preserving chain continuity without payload. */
  MEMORY_TOMBSTONE_WRITTEN: "memory.tombstone.written",
  /** A single-record erasure completed across all registered derivatives. Used by the
   *  erasure coordinator; subject erasure uses MEMORY_SUBJECT_ERASURE_EXECUTED. */
  MEMORY_ERASURE_COMPLETED: "memory.erasure.completed",

  // Orchestration evidence v8.8 / MSIQ-04..05 / ORCH-FOLLOWUP-01
  /** MSIQ self-hosted Microsoft Agent Framework memory adapter established a session. */
  ORCH_MSIQ_ADAPTER_SESSION: "orch.msiq.adapter.session",
  /** MSIQ adapter write/read/search operation completed (success/deny/conflict). */
  ORCH_MSIQ_ADAPTER_OPERATION: "orch.msiq.adapter.operation",
  /** MCP protocol/capability validation step result (precedes adapter access). */
  ORCH_MCP_VALIDATION: "orch.mcp.validation",
  /** Federation source registered or updated. */
  ORCH_FEDERATION_SOURCE_REGISTERED: "orch.federation.source.registered",
  /** Federation budget exceeded (global or per-source). */
  ORCH_FEDERATION_BUDGET_EXCEEDED: "orch.federation.budget_exceeded",
  /** Per-source independent policy evaluation outcome recorded. */
  ORCH_FEDERATION_POLICY_DECISION: "orch.federation.policy.decision",
  /** Per-source federated retrieval outcome (success/empty/denied/omitted/stale/injection/timeout/malformed/failed). */
  ORCH_FEDERATION_SOURCE_OUTCOME: "orch.federation.source_outcome",
  /** Federated merge completed with deterministic pack hash + dedupe/rank metadata. */
  ORCH_FEDERATION_MERGE: "orch.federation.merge",
  /** Untrusted content was detected and dispositioned (omitted/quarantined) per policy. */
  ORCH_INJECTION_DETECTED: "orch.injection.detected",
  /** Multi-hop plan graph validated before execution. */
  ORCH_PLAN_VALIDATED: "orch.plan.validated",
  /** Per-step fresh policy/identity/freshness/dependency/input/verification gate. */
  ORCH_STEP_GATE: "orch.step.gate",
  /** Step side effect committed with hashes and rollback boundary metadata. */
  ORCH_STEP_COMMITTED: "orch.step.committed",
  /** Ambiguous remote commit was reconciled before any compensating mutation. */
  ORCH_COMMIT_RECONCILED: "orch.commit.reconciled",
  /** Compensation or rollback recovery event appended to run evidence. */
  ORCH_RECOVERY_APPENDED: "orch.recovery.appended",
  /** Rollback handle was consumed, denied, expired, or diverged. */
  ORCH_ROLLBACK_HANDLE: "orch.rollback.handle",
  /** Tamper-evident orchestration evidence bundle produced or verified. */
  ORCH_EVIDENCE_BUNDLE: "orch.evidence.bundle",

  // Retrieval benchmark v8.9 (BENCH-03 + RETRIEVAL-01 continued)
  /** A retrieval benchmark run was emitted. */
  RETRIEVAL_BENCH_RUN: "retrieval_bench.run",
  /** Stage receipt (retrieved/reranked/deduped/packed/etc.) was reconciled. */
  RETRIEVAL_BENCH_RECEIPT: "retrieval_bench.receipt",
  /** A benchmark publication gate decision was taken (ready_for_publication or blocked). */
  RETRIEVAL_BENCH_PUBLICATION: "retrieval_bench.publication",
  /** A benchmark report was replayed against the recorded config. */
  RETRIEVAL_BENCH_REPLAY: "retrieval_bench.replay",
  /** A cross-lane / cross-run contamination guard was triggered. */
  RETRIEVAL_BENCH_CONTAMINATION: "retrieval_bench.contamination",
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
  /** A Paperclip tenant entity (company, agent, issue, budget) observed via activity ingestion (Phase 146, FLEET-18). */
  PAPERCLIP: "paperclip",
  /** A lifecycle retention policy or retention-scoped record. */
  MEMORY_RETENTION: "memory_retention",
  /** A legal hold over memory lifecycle records. */
  MEMORY_LEGAL_HOLD: "memory_legal_hold",
  /** A reviewed subject erasure plan/execution record. */
  MEMORY_SUBJECT_ERASURE: "memory_subject_erasure",
  /** A scheduled episodic memory decay run. */
  MEMORY_DECAY: "memory_decay",
  /** A memory consolidation cycle (episodic -> summary via raw vault). */
  MEMORY_CONSOLIDATION: "memory_consolidation",
  /** A memory raw vault artifact (write, replay, classification, durability). */
  MEMORY_VAULT: "memory_vault",
  /** A subject data export / delete (DSAR) request. */
  MEMORY_DSAR: "memory_dsar",
  /** An offboarding-triggered pending MEMLIFE review. */
  MEMORY_OFFBOARDING: "memory_offboarding",
  /** A scoped, non-sensitive erasure tombstone pointer. */
  MEMORY_TOMBSTONE: "memory_tombstone",
  /** Embedding provenance row linked to a canonical memory identity (model_version, removability, lifecycle state). */
  MEMORY_EMBEDDING: "memory_embedding",
  /** MSIQ self-hosted Microsoft Agent Framework memory adapter session. */
  MSIQ_ADAPTER_SESSION: "msiq_adapter_session",
  /** Federation source registration (memory/knowledge/MCP, with type, handle, scope, trust, expiry). */
  FEDERATION_SOURCE: "federation_source",
  /** Federation budget evaluation record (global + per-source bounds). */
  FEDERATION_BUDGET: "federation_budget",
  /** Federation source outcome (per-source decision + receipt metadata). */
  FEDERATION_OUTCOME: "federation_outcome",
  /** Federation merged pack (deterministic dedupe + rank + provenance). */
  FEDERATION_PACK: "federation_pack",
  /** Multi-hop orchestration run, step, recovery, rollback, or evidence bundle. */
  ORCHESTRATION_RUN: "orchestration_run",
  /** A retrieval benchmark run, stage receipt, publication gate, replay, or contamination event. */
  RETRIEVAL_BENCH: "retrieval_bench",
  /** A human user referenced by an administrative audit event. */
  USER: "user",
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
