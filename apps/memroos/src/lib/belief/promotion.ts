/**
 * Phase 122: belief promotion pipeline core (BELIEF-PROMO-01..08).
 *
 * Governed silver -> gold promotion:
 *   1. evaluatePromotionChecks - 5 deterministic checks with NO LLM call
 *   2. canAdmitToGold - gate that may admit, deny, or queue for review
 *   3. promoteCandidate - silver -> gold, single transaction, hash-chained
 *   4. demoteCandidate   - gold -> silver, always safe
 *   5. enqueueForReview / resolveReview - operator workflow
 *
 * Hard rules:
 *   - No LLM call anywhere. Deterministic only.
 *   - No raw candidate content in any receipt. Hashes and ids only.
 *   - Every state-changing path runs in a SQLite transaction.
 *   - The decision row entry_hash chains to the previous one for the
 *     tenant -- mirrors agent-checkpoints.ts:hashJson/entryHash pattern.
 *   - LLM checks are explicitly forbidden. If an admission path doesn't
 *     go through canAdmitToGold, it cannot reach gold.
 */
import crypto from "crypto";

import type Database from "better-sqlite3";

import { writeAuditEntry } from "../audit/write";
import {
  AUDIT_EVENT_TYPES,
  ENTITY_TYPES,
} from "../audit/event-types";
import {
  authorizeMemoryUse,
  type MemoryUseActor,
  type MemoryLabelSnapshot,
} from "../memory/policy-gate";
import { writeAuditLog } from "../audit";
import { getDb } from "../db";

import {
  type AdmissionDecision,
  type ClaimCategory,
  type PromotionCheck,
  type PromotionChecks,
  type PromotionReceiptSummary,
  type BeliefStage,
} from "./types";
import type { BeliefPromotionConfig } from "./config";
import { DEFAULT_BELIEF_PROMOTION_CONFIG } from "./config";
import {
  resolveOntologyValidity,
  type OntologyValidityContext,
} from "../ontology/validity";

// ---------------------------------------------------------------------------
// Stable hash helpers (mirror agent-checkpoints.ts)
// ---------------------------------------------------------------------------

function stableJson(value: unknown): string {
  return JSON.stringify(normalizeStable(value));
}

function normalizeStable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeStable);
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, normalizeStable(entryValue)])
    );
  }
  return value;
}

function hashText(value: string): string {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function hashJson(value: unknown): string {
  return hashText(stableJson(value));
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Candidate row + helper types
// ---------------------------------------------------------------------------

interface CandidateRow {
  id: string;
  tenant_id: string;
  capture_id: string;
  agent_id: string;
  memory_type: string;
  content: string;
  content_hash: string;
  status: string;
  metadata_json: string;
  belief_stage: BeliefStage;
  created_at: string;
  promoted_at: string | null;
  promoted_by: string | null;
  demoted_at: string | null;
  demotion_reason: string | null;
}

interface CaptureRow {
  id: string;
  raw_artifact_id: string | null;
  capture_hash: string;
  captured_at: string;
  capture_health: string;
}

const VALID_CATEGORIES: ReadonlySet<ClaimCategory> = new Set<ClaimCategory>([
  "pricing",
  "product_capability",
  "legal_compliance",
  "personal_data",
  "operational",
  "engineering",
  "unclassified",
]);

export function normalizeCategory(value: string | null | undefined): ClaimCategory {
  if (!value) return "unclassified";
  const trimmed = value.trim().toLowerCase();
  if (VALID_CATEGORIES.has(trimmed as ClaimCategory)) {
    return trimmed as ClaimCategory;
  }
  return "unclassified";
}

function readCandidate(db: Database.Database, candidateId: string, tenantId: string): CandidateRow {
  const row = db
    .prepare<[string, string], CandidateRow>(
      `SELECT id, tenant_id, capture_id, agent_id, memory_type, content, content_hash,
              status, metadata_json, belief_stage, created_at,
              promoted_at, promoted_by, demoted_at, demotion_reason
         FROM agent_memory_candidates
        WHERE id = ? AND tenant_id = ?`
    )
    .get(candidateId, tenantId);
  if (!row) {
    throw new Error(`candidate not found: ${candidateId}`);
  }
  return row;
}

function readCapture(db: Database.Database, captureId: string): CaptureRow | undefined {
  return db
    .prepare<[string], CaptureRow>(
      `SELECT id, raw_artifact_id, capture_hash, captured_at, capture_health
         FROM agent_session_captures
        WHERE id = ?`
    )
    .get(captureId);
}

function parseJsonRecord(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function queueField(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveQueuedOntologyContext(
  db: Database.Database,
  row: Record<string, unknown>,
  tenantId: string,
): QueueOntologyContext | null {
  const recordType = queueField(row, "ontology_record_type");
  const recordId = queueField(row, "ontology_record_id");
  const ontologyId = queueField(row, "ontology_id");
  const ontologyVersion = queueField(row, "ontology_version");
  const ontologyContentHash = queueField(row, "ontology_content_hash");
  const canonicalId = queueField(row, "ontology_canonical_id");
  const sourceId = queueField(row, "ontology_source_id");
  const sourceHash = queueField(row, "ontology_source_hash");
  const derivativeId = queueField(row, "ontology_derivative_id");
  const spaceId = queueField(row, "ontology_space_id") ?? "default";
  if (!recordType || !recordId || !ontologyId || !ontologyVersion || !ontologyContentHash || !canonicalId || !sourceId || !sourceHash || !derivativeId) {
    return null;
  }
  const reference = { tenantId, spaceId, recordType, recordId };
  try {
    const context = resolveOntologyValidity(db, reference);
    if (
      context.ontologyId !== ontologyId
      || context.ontologyVersion !== ontologyVersion
      || context.ontologyContentHash !== ontologyContentHash
      || context.canonicalId !== canonicalId
      || context.sourceId !== sourceId
      || context.sourceHash !== sourceHash
      || context.derivativeId !== derivativeId
    ) {
      return null;
    }
    return { reference, context };
  } catch {
    return null;
  }
}

function resolveCandidateReviewOntologyContext(
  db: Database.Database,
  tenantId: string,
  candidateId: string,
): QueueOntologyContext | null {
  const rows = db.prepare(
    `SELECT space_id, record_type, record_id
       FROM ontology_versioned_records
      WHERE tenant_id = ? AND record_type = 'belief_candidate' AND record_id = ?
      ORDER BY created_at DESC
      LIMIT 2`
  ).all(tenantId, candidateId) as Array<{ space_id: string; record_type: string; record_id: string }>;
  if (rows.length !== 1) return null;
  const row = rows[0];
  const reference = {
    tenantId,
    spaceId: row.space_id,
    recordType: row.record_type,
    recordId: row.record_id,
  };
  try {
    return { reference, context: resolveOntologyValidity(db, reference) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Check 1: provenance -- the candidate must trace back to a raw artifact
// or, at minimum, a capture with a non-empty hash. No raw artifacts => denied.
// Receipts store only the artifact_id / hash, never the content.
// ---------------------------------------------------------------------------

function provenanceCheck(
  db: Database.Database,
  candidate: CandidateRow,
  now: Date
): PromotionCheck {
  const capture = readCapture(db, candidate.capture_id);
  if (!capture) {
    return {
      name: "provenance",
      pass: false,
      evidence: {
        reason: "capture_not_found",
        candidateId: candidate.id,
        captureId: candidate.capture_id,
      },
    };
  }
  if (!capture.raw_artifact_id) {
    return {
      name: "provenance",
      pass: false,
      evidence: {
        reason: "no_raw_artifact",
        candidateId: candidate.id,
        captureId: candidate.id,
      },
    };
  }
  if (!capture.capture_hash || capture.capture_hash === "") {
    return {
      name: "provenance",
      pass: false,
      evidence: {
        reason: "capture_hash_missing",
        candidateId: candidate.id,
        captureId: candidate.id,
      },
    };
  }
  return {
    name: "provenance",
    pass: true,
    evidence: {
      artifactId: capture.raw_artifact_id,
      captureHash: capture.capture_hash,
      captureHealth: capture.capture_health,
    },
  };
}

// ---------------------------------------------------------------------------
// Check 2: freshness -- the candidate's source must be within the freshness
// window. The window is configurable via MEMROOS_BELIEF_FRESHNESS_DAYS
// (default 180). Receipts store age in days, not the timestamp itself.
// ---------------------------------------------------------------------------

function freshnessCheck(
  candidate: CandidateRow,
  capture: CaptureRow | undefined,
  config: BeliefPromotionConfig,
  now: Date
): PromotionCheck {
  const baseline = capture?.captured_at ?? candidate.created_at;
  const capturedMs = Date.parse(baseline);
  if (!Number.isFinite(capturedMs)) {
    return {
      name: "freshness",
      pass: false,
      evidence: {
        reason: "unparseable_capture_timestamp",
        candidateId: candidate.id,
      },
    };
  }
  const ageDays = Math.max(0, (now.getTime() - capturedMs) / 86_400_000);
  const window = config.freshnessWindowDays;
  return {
    name: "freshness",
    pass: ageDays <= window,
    evidence: {
      ageDays: Number(ageDays.toFixed(2)),
      windowDays: window,
      within: ageDays <= window,
    },
  };
}

// ---------------------------------------------------------------------------
// Check 3: policy -- defer to the existing memory policy gate with the
// 'memory-promotion' purpose. authoriseMemoryUse is the SOLE policy oracle.
// ---------------------------------------------------------------------------

function policyCheck(candidate: CandidateRow, actor: MemoryUseActor): PromotionCheck {
  const labelRecord = parseJsonRecord(candidate.metadata_json);
  const label: MemoryLabelSnapshot = {
    visibility: typeof labelRecord.visibility === "string"
      ? (labelRecord.visibility as MemoryLabelSnapshot["visibility"])
      : null,
    domain: typeof labelRecord.domain === "string"
      ? (labelRecord.domain as MemoryLabelSnapshot["domain"])
      : null,
    sensitivity: typeof labelRecord.sensitivity === "string"
      ? (labelRecord.sensitivity as MemoryLabelSnapshot["sensitivity"])
      : null,
    policy: typeof labelRecord.policy === "string"
      ? (labelRecord.policy as MemoryLabelSnapshot["policy"])
      : null,
  };
  const decision = authorizeMemoryUse({ actor, purpose: "memory-promotion", label });
  // The promotion pipeline only admits when policy returns 'allow'. Review
  // and redact outcomes still surface here as failures -- the high-stakes
  // gate (next) decides whether to queue rather than deny.
  return {
    name: "policy",
    pass: decision.decision === "allow",
    evidence: {
      decision: decision.decision,
      reason: decision.reason,
      policy: decision.label.policy,
      visibility: decision.label.visibility,
      sensitivity: decision.label.sensitivity,
    },
  };
}

// ---------------------------------------------------------------------------
// Check 4: conflict -- HASH/dedupe only. No semantic checks. A candidate
// conflicts iff another gold candidate for the same tenant already claims
// the same content_hash for the same memory_type. (Within
// (tenant_id, memory_type, content_hash) tuple a single gold claim may
// exist; the new candidate is rejected. Silver duplicates do not block
// promotion -- the supersession demotion path clears gold so a new claim
// can take its place.)
// ---------------------------------------------------------------------------

function conflictCheck(
  db: Database.Database,
  candidate: CandidateRow,
  excludeId: string
): PromotionCheck {
  const row = db
    .prepare<[string, string, string, string], { id: string; belief_stage: BeliefStage }>(
      `SELECT id, belief_stage
         FROM agent_memory_candidates
        WHERE tenant_id = ?
          AND memory_type = ?
          AND content_hash = ?
          AND id <> ?
          AND belief_stage = 'gold_operational_truth'`
    )
    .get(candidate.tenant_id, candidate.memory_type, candidate.content_hash, excludeId);
  const hasConflict = !!row;
  return {
    name: "conflict",
    pass: !hasConflict,
    evidence: {
      hasConflict,
      conflictingId: row?.id ?? null,
      conflictingStage: row?.belief_stage ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Check 5: dedupe -- a candidate may not already be gold. A promotion
// request for an already-gold candidate is a no-op denial.
// ---------------------------------------------------------------------------

function dedupeCheck(candidate: CandidateRow): PromotionCheck {
  if (candidate.belief_stage === "gold_operational_truth") {
    return {
      name: "dedupe",
      pass: false,
      evidence: {
        reason: "already_gold",
        candidateId: candidate.id,
      },
    };
  }
  return {
    name: "dedupe",
    pass: true,
    evidence: { candidateId: candidate.id, currentStage: candidate.belief_stage },
  };
}

// ---------------------------------------------------------------------------
// Public surface: evaluatePromotionChecks
// ---------------------------------------------------------------------------

export interface EvaluatePromotionOptions {
  actor?: MemoryUseActor;
  config?: BeliefPromotionConfig;
  now?: Date;
}

export function evaluatePromotionChecks(
  db: Database.Database,
  tenantId: string,
  candidateId: string,
  options: EvaluatePromotionOptions = {}
): PromotionChecks {
  const config = options.config ?? DEFAULT_BELIEF_PROMOTION_CONFIG;
  const now = options.now ?? new Date();
  const actor: MemoryUseActor = options.actor ?? {
    id: "system:belief-promotion",
    role: "system",
    tenantId,
  };
  const candidate = readCandidate(db, candidateId, tenantId);
  const capture = readCapture(db, candidate.capture_id);
  return [
    provenanceCheck(db, candidate, now),
    freshnessCheck(candidate, capture, config, now),
    policyCheck(candidate, actor),
    conflictCheck(db, candidate, candidate.id),
    dedupeCheck(candidate),
  ];
}

// ---------------------------------------------------------------------------
// Decision-row writer (shared by admit / deny / queue paths)
// ---------------------------------------------------------------------------

interface DecisionRowInput {
  decisionId: string;
  candidateId: string;
  tenantId: string;
  category: ClaimCategory;
  decisionType:
    | "promoted"
    | "demoted"
    | "queued_for_review"
    | "review_approved"
    | "review_rejected"
    | "admission_denied";
  fromStage: BeliefStage;
  toStage: BeliefStage;
  actorId: string | null;
  actorRole: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  previousEntryHash: string | null;
  ontology?: PromotionReceiptSummary["ontology"];
}

function writeDecisionRow(db: Database.Database, row: DecisionRowInput): PromotionReceiptSummary {
  // Hash chain: hash fields EXCLUDING entry_hash first, then seal entry_hash in metadata.
  // Caller-supplied `metadata` keys are flattened into baseMetadata so they appear at the
  // top level of the stored metadata_json (alongside schemaVersion/entryHash/etc.). This
  // keeps the receipt's externally-queryable shape predictable for ops/audit consumers.
  const baseMetadata = {
    schemaVersion: 1,
    candidateId: row.candidateId,
    tenantId: row.tenantId,
    decisionType: row.decisionType,
    fromStage: row.fromStage,
    toStage: row.toStage,
    previousEntryHash: row.previousEntryHash,
    ontology: row.ontology ?? null,
    ...row.metadata,
  };
  const entryHash = hashJson({
    id: row.decisionId,
    tenantId: row.tenantId,
    decisionType: row.decisionType,
    fromStage: row.fromStage,
    toStage: row.toStage,
    candidateId: row.candidateId,
    category: row.category,
    previousEntryHash: row.previousEntryHash,
    actorId: row.actorId,
    actorRole: row.actorRole,
    reason: row.reason,
    metadata: baseMetadata,
    createdAt: row.createdAt,
  });
  const fullMetadata = { ...baseMetadata, entryHash };

  db.prepare(
    `INSERT INTO belief_promotion_decisions
       (id, tenant_id, candidate_id, decision_type, category, actor_id, actor_role,
        from_stage, to_stage, reason, metadata_json, previous_entry_hash, entry_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.decisionId,
    row.tenantId,
    row.candidateId,
    row.decisionType,
    row.category,
    row.actorId,
    row.actorRole,
    row.fromStage,
    row.toStage,
    row.reason,
    stableJson(fullMetadata),
    row.previousEntryHash,
    entryHash,
    row.createdAt
  );

  return {
    id: row.decisionId,
    candidateId: row.candidateId,
    tenantId: row.tenantId,
    category: row.category,
    fromStage: row.fromStage,
    toStage: row.toStage,
    decisionType: row.decisionType,
    actorId: row.actorId,
    actorRole: row.actorRole,
    previousEntryHash: row.previousEntryHash,
    entryHash,
    createdAt: row.createdAt,
    ontology: row.ontology,
  };
}

function latestDecisionEntryHash(db: Database.Database, tenantId: string): string | null {
  const row = db
    .prepare<[string], { entry_hash: string }>(
      `SELECT entry_hash
         FROM belief_promotion_decisions
        WHERE tenant_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1`
    )
    .get(tenantId);
  return row?.entry_hash ?? null;
}

// ---------------------------------------------------------------------------
// Receipt builders (build metadata for the decision row)
// ---------------------------------------------------------------------------

function checksMetadata(checks: PromotionChecks, extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    checks: checks.map((check) => ({
      name: check.name,
      pass: check.pass,
      evidence: check.evidence,
    })),
    ...extras,
  };
}

// ---------------------------------------------------------------------------
// canAdmitToGold -- the gate. NO LLM. Three branches:
//   admitted               -- silver -> gold UPDATE + decision row in tx
//   denied                 -- admission_denied decision row, candidate unchanged
//   queued_for_review      -- high-stakes category OR unlisted sensitive label
//                              opens belief_review_queue + decision row in tx
// ---------------------------------------------------------------------------

export interface AdmitActor {
  id: string;
  role: "admin" | "operator" | "system";
  tenantId?: string;
}

export interface AdmitOptions {
  actor: AdmitActor;
  category?: ClaimCategory | string;
  config?: BeliefPromotionConfig;
  now?: Date;
  /** Operator-reviewed bypass for items previously queued in this tenant. */
  reviewedQueueId?: string | null;
  ontology?: PromotionReceiptSummary["ontology"];
  ontologyReference?: OntologyContextReference;
}

interface OntologyContextReference {
  tenantId: string;
  spaceId: string;
  recordType: string;
  recordId: string;
}

interface QueueOntologyContext {
  reference: OntologyContextReference;
  context: OntologyValidityContext;
}

export function canAdmitToGold(
  db: Database.Database,
  tenantId: string,
  candidateId: string,
  options: AdmitOptions
): AdmissionDecision {
  const config = options.config ?? DEFAULT_BELIEF_PROMOTION_CONFIG;
  const now = options.now ?? new Date();
  const category = normalizeCategory(options.category);
  const candidate = readCandidate(db, candidateId, tenantId);
  let ontology = options.ontology;

  if (candidate.belief_stage === "gold_operational_truth") {
    // No-op: already promoted. Return admitted w/ existing most-recent receipt.
    const existing = latestDecisionForCandidate(db, candidateId);
    if (!existing) throw new Error("candidate is gold but no promotion decision row exists");
    return { kind: "admitted", decisionId: existing.id, receipt: existing };
  }

  const actor: MemoryUseActor = {
    id: options.actor.id,
    role: options.actor.role === "operator" || options.actor.role === "admin"
      ? options.actor.role
      : "system",
    tenantId: options.actor.tenantId ?? tenantId,
  };

  const checks = evaluatePromotionChecks(db, tenantId, candidateId, {
    actor,
    config,
    now,
  });

  const failed = checks.find((check) => !check.pass);

  // Fail-closed: if any deterministic check fails, deny.
  if (failed) {
    return writeDeniedReceipt({
      db,
      tenantId,
      candidate,
      category,
      checks,
      failed,
      actor,
      createdAt: nowIso(),
    });
  }

  // High-stakes routing.
  const sensitiveLabel = sensitiveLabelOf(candidate);
  const isHighStakes = config.highStakesCategories.has(category);
  // Fail-closed sensitive: any sensitive label that is not on the
  // configured allow-list for non-sensitive categories fails closed
  // into review. In our default config, only the four high-stakes
  // categories are tracked; any other category w/ a sensitive label
  // (including engineering and operational) sends to review.
  const isUnlistedSensitive = !!sensitiveLabel
    && !config.highStakesCategories.has(category);
  const reviewOntology = isUnlistedSensitive || isHighStakes
    ? resolveCandidateReviewOntologyContext(db, tenantId, candidateId)
    : null;

  if (isUnlistedSensitive && sensitiveLabel) {
    if (!reviewOntology) throw new Error("ontology context is required for belief review");
    return writeQueuedReceipt({
      db,
      tenantId,
      candidate,
      category,
      checks,
      reason: "unlisted_sensitive_label",
      sensitiveLabel,
      actor,
      createdAt: nowIso(),
      ontology: reviewOntology.context,
      ontologyReference: reviewOntology.reference,
    });
  }
  if (isHighStakes) {
    // review-required override: caller can pass a reviewed queue id to bypass
    if (!options.reviewedQueueId) {
      if (!reviewOntology) throw new Error("ontology context is required for belief review");
      return writeQueuedReceipt({
        db,
        tenantId,
        candidate,
        category,
        checks,
        reason: "high_stakes_category",
        sensitiveLabel: null,
        actor,
        createdAt: nowIso(),
        ontology: reviewOntology.context,
        ontologyReference: reviewOntology.reference,
      });
    }
    // Operator-approved queue: continue to admit below
    const queueItem = db
      .prepare<[string, string], Record<string, unknown>>(
        `SELECT * FROM belief_review_queue
          WHERE id = ? AND tenant_id = ?`
      )
      .get(options.reviewedQueueId, tenantId);
    if (
      !queueItem
      || queueField(queueItem, "status") !== "approved"
      || queueField(queueItem, "candidate_id") !== candidateId
    ) {
      throw new Error("reviewedQueueId provided but queue item is not approved");
    }
    const queueOntology = resolveQueuedOntologyContext(db, queueItem, tenantId);
    if (!queueOntology) throw new Error("reviewedQueueId ontology context is unavailable");
    ontology = queueOntology.context;
  }

  return writeAdmittedReceipt({
    db,
    tenantId,
    candidate,
    category,
    checks,
    actor,
    createdAt: nowIso(),
    ontology,
  });
}

// ---------------------------------------------------------------------------
// Internal helpers used by canAdmitToGold -- split so each branch writes
// its own decision row in one transaction.
// ---------------------------------------------------------------------------

interface DeniedArgs {
  db: Database.Database;
  tenantId: string;
  candidate: CandidateRow;
  category: ClaimCategory;
  checks: PromotionChecks;
  failed: PromotionCheck;
  actor: MemoryUseActor;
  createdAt: string;
}

function writeDeniedReceipt(args: DeniedArgs): AdmissionDecision {
  const previousEntryHash = latestDecisionEntryHash(args.db, args.tenantId);
  const decisionId = crypto.randomUUID();
  const reason = `admission_denied:${args.failed.name}`;
  return args.db.transaction(() => {
    const receipt = writeDecisionRow(args.db, {
      decisionId,
      candidateId: args.candidate.id,
      tenantId: args.tenantId,
      category: args.category,
      decisionType: "admission_denied",
      fromStage: args.candidate.belief_stage,
      toStage: args.candidate.belief_stage,
      actorId: args.actor.id,
      actorRole: args.actor.role,
      reason,
      metadata: checksMetadata(args.checks, { failedCheck: args.failed.name }),
      createdAt: args.createdAt,
      previousEntryHash,
    });
    writeAuditEntry(
      {
        tenant_id: args.tenantId,
        actor_id: args.actor.id,
        actor_role: args.actor.role === "operator" || args.actor.role === "admin"
          ? args.actor.role
          : "system",
        event_type: AUDIT_EVENT_TYPES.BELIEF_ADMISSION_DENIED,
        entity_type: ENTITY_TYPES.AGENT_MEMORY_CANDIDATE,
        entity_id: `agent_memory_candidate:${args.candidate.id}`,
        reason,
        metadata_json: {
          candidate_id: args.candidate.id,
          decision_id: decisionId,
          failed_check: args.failed.name,
        },
        created_at: args.createdAt,
      },
      args.db
    );
    return {
      kind: "denied" as const,
      reason,
      failedCheck: args.failed.name,
      decisionId,
      receipt,
    };
  })();
}

interface QueuedArgs {
  db: Database.Database;
  tenantId: string;
  candidate: CandidateRow;
  category: ClaimCategory;
  checks: PromotionChecks;
  reason: "high_stakes_category" | "unlisted_sensitive_label";
  sensitiveLabel: string | null;
  actor: MemoryUseActor;
  createdAt: string;
  ontology?: PromotionReceiptSummary["ontology"];
  ontologyReference?: OntologyContextReference;
}

function writeQueuedReceipt(args: QueuedArgs): AdmissionDecision {
  const ontologyReference = args.ontologyReference;
  const ontology = args.ontology;
  if (!ontology || !ontologyReference) {
    throw new Error("ontology context is required for belief review");
  }
  const previousEntryHash = latestDecisionEntryHash(args.db, args.tenantId);
  const decisionId = crypto.randomUUID();
  const queueId = crypto.randomUUID();

  return args.db.transaction(() => {
    args.db.prepare(
      `INSERT INTO belief_review_queue
         (id, tenant_id, candidate_id, category, status, opened_by, opened_at,
          ontology_record_type, ontology_record_id, ontology_space_id, ontology_id, ontology_version,
          ontology_content_hash, ontology_canonical_id, ontology_source_id,
          ontology_source_hash, ontology_derivative_id)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      queueId, args.tenantId, args.candidate.id, args.category, args.actor.id, args.createdAt,
      ontologyReference.recordType, ontologyReference.recordId, ontologyReference.spaceId, ontology.ontologyId,
      ontology.ontologyVersion, ontology.ontologyContentHash,
      ontology.canonicalId, ontology.sourceId, ontology.sourceHash,
      ontology.derivativeId,
    );

    const receipt = writeDecisionRow(args.db, {
      decisionId,
      candidateId: args.candidate.id,
      tenantId: args.tenantId,
      category: args.category,
      decisionType: "queued_for_review",
      fromStage: args.candidate.belief_stage,
      toStage: args.candidate.belief_stage,
      actorId: args.actor.id,
      actorRole: args.actor.role,
      reason: args.reason,
      metadata: checksMetadata(args.checks, {
        queueId,
        sensitiveLabel: args.sensitiveLabel,
        reasonDetail: args.reason,
      }),
      createdAt: args.createdAt,
      previousEntryHash,
      ontology,
    });

    writeAuditEntry(
      {
        tenant_id: args.tenantId,
        actor_id: args.actor.id,
        actor_role: args.actor.role === "operator" || args.actor.role === "admin"
          ? args.actor.role
          : "system",
        event_type: AUDIT_EVENT_TYPES.BELIEF_QUEUED_FOR_REVIEW,
        entity_type: ENTITY_TYPES.BELIEF_REVIEW_ITEM,
        entity_id: `belief_review_item:${queueId}`,
        reason: args.reason,
        metadata_json: {
          candidate_id: args.candidate.id,
          decision_id: decisionId,
          queue_id: queueId,
          sensitive_label: args.sensitiveLabel,
          ontology_record_type: ontologyReference.recordType,
          ontology_record_id: ontologyReference.recordId,
          ontology_derivative_id: ontology.derivativeId,
        },
        created_at: args.createdAt,
      },
      args.db
    );

    return {
      kind: "queued_for_review" as const,
      reason: args.reason,
      category: args.category,
      queueId,
      decisionId,
      receipt,
    };
  })();
}

interface AdmittedArgs {
  db: Database.Database;
  tenantId: string;
  candidate: CandidateRow;
  category: ClaimCategory;
  checks: PromotionChecks;
  actor: MemoryUseActor;
  createdAt: string;
  ontology?: PromotionReceiptSummary["ontology"];
}

function writeAdmittedReceipt(args: AdmittedArgs): AdmissionDecision {
  const previousEntryHash = latestDecisionEntryHash(args.db, args.tenantId);
  const decisionId = crypto.randomUUID();
  return args.db.transaction(() => {
    // Promote only AFTER all checks passed. The transaction guarantees
    // no gold row can exist without a matching admitted decision row.
    const result = args.db
      .prepare(
        `UPDATE agent_memory_candidates
            SET belief_stage = 'gold_operational_truth',
                promoted_at = ?,
                promoted_by = ?,
                demoted_at = NULL,
                demotion_reason = NULL
          WHERE id = ?
            AND tenant_id = ?
            AND belief_stage <> 'gold_operational_truth'`
      )
      .run(args.createdAt, args.actor.id, args.candidate.id, args.tenantId);
    if (result.changes !== 1) {
      throw new Error(`promotion UPDATE affected ${result.changes} rows; expected 1`);
    }

    const receipt = writeDecisionRow(args.db, {
      decisionId,
      candidateId: args.candidate.id,
      tenantId: args.tenantId,
      category: args.category,
      decisionType: "promoted",
      fromStage: args.candidate.belief_stage,
      toStage: "gold_operational_truth",
      actorId: args.actor.id,
      actorRole: args.actor.role,
      reason: "admitted via deterministic check pass",
      metadata: checksMetadata(args.checks),
      ontology: args.ontology,
      createdAt: args.createdAt,
      previousEntryHash,
    });

    writeAuditEntry(
      {
        tenant_id: args.tenantId,
        actor_id: args.actor.id,
        actor_role: args.actor.role === "operator" || args.actor.role === "admin"
          ? args.actor.role
          : "system",
        event_type: AUDIT_EVENT_TYPES.BELIEF_PROMOTED,
        entity_type: ENTITY_TYPES.AGENT_MEMORY_CANDIDATE,
        entity_id: `agent_memory_candidate:${args.candidate.id}`,
        reason: "deterministic checks passed; candidate promoted",
        metadata_json: {
          candidate_id: args.candidate.id,
          decision_id: decisionId,
          previous_entry_hash: previousEntryHash,
          entry_hash: receipt.entryHash,
          category: args.category,
        },
        created_at: args.createdAt,
      },
      args.db
    );

    return { kind: "admitted" as const, decisionId, receipt };
  })();
}

// ---------------------------------------------------------------------------
// Public functions exposed by the module
// ---------------------------------------------------------------------------

export interface PromoteArgs {
  actor: AdmitActor;
  category?: ClaimCategory | string;
  config?: BeliefPromotionConfig;
  /** Optional reviewed-queue bypass for an explicit operator approval. */
  reviewedQueueId?: string | null;
  ontologyContext?: PromotionReceiptSummary["ontology"];
  ontologyReference?: OntologyContextReference;
}

export function promoteCandidate(
  db: Database.Database,
  args: { candidateId: string; tenantId: string } & PromoteArgs
): AdmissionDecision {
  if (args.ontologyContext && !args.ontologyReference) {
    throw new Error("caller-supplied ontology context is not accepted");
  }
  const ontology = args.ontologyReference
    ? resolveOntologyValidity(db, args.ontologyReference)
    : undefined;
  return canAdmitToGold(db, args.tenantId, args.candidateId, {
    actor: args.actor,
    category: args.category,
    config: args.config,
    reviewedQueueId: args.reviewedQueueId ?? null,
    ontology,
    ontologyReference: args.ontologyReference,
  });
}

export interface DemoteArgs {
  reason:
    | "source_invalidated"
    | "superseded_by_conflict"
    | "manual_operator"
    | string;
  actor?: AdmitActor;
  category?: ClaimCategory | string;
}

export interface DemoteResult {
  decisionId: string;
  receipt: PromotionReceiptSummary;
  supersedesCandidateId: string | null;
}

export function demoteCandidate(
  db: Database.Database,
  args: { candidateId: string; tenantId: string } & DemoteArgs
): DemoteResult {
  const candidate = readCandidate(db, args.candidateId, args.tenantId);
  const actor: AdmitActor = args.actor ?? {
    id: "system:belief-demotion",
    role: "system",
    tenantId: args.tenantId,
  };
  const category = normalizeCategory(args.category);
  const createdAt = nowIso();
  const previousEntryHash = latestDecisionEntryHash(db, args.tenantId);
  const decisionId = crypto.randomUUID();
  const previousStage: BeliefStage = candidate.belief_stage;
  const nextStage: BeliefStage = "silver_candidate_claim";

  let supersedesCandidateId: string | null = null;
  const result = db.transaction(() => {
    // Demotion is safe regardless of category or current stage (even from silver).
    // Stage must move down or stay if already silver.
    const update = db
      .prepare(
        `UPDATE agent_memory_candidates
            SET belief_stage = ?,
                demoted_at = ?,
                demotion_reason = ?
          WHERE id = ? AND tenant_id = ?`
      )
      .run(nextStage, createdAt, args.reason, args.candidateId, args.tenantId);
    if (update.changes !== 1) {
      throw new Error(`demotion UPDATE affected ${update.changes} rows; expected 1`);
    }

    // Conflict supersession: when reason='superseded_by_conflict', find
    // the new gold candidate with the same (memory_type, content_hash) that
    // triggered this demotion and record supersession in the receipt.
    let supersedes: { id: string } | undefined;
    if (args.reason === "superseded_by_conflict") {
      supersedes = db
        .prepare<[string, string, string, string], { id: string }>(
          `SELECT id FROM agent_memory_candidates
            WHERE tenant_id = ?
              AND memory_type = ?
              AND content_hash = ?
              AND id <> ?
              AND belief_stage = 'gold_operational_truth'
            ORDER BY promoted_at DESC
            LIMIT 1`
        )
        .get(args.tenantId, candidate.memory_type, candidate.content_hash, args.candidateId);
      supersedesCandidateId = supersedes?.id ?? null;
    }

    const receipt = writeDecisionRow(db, {
      decisionId,
      candidateId: args.candidateId,
      tenantId: args.tenantId,
      category,
      decisionType: "demoted",
      fromStage: previousStage,
      toStage: nextStage,
      actorId: actor.id,
      actorRole: actor.role,
      reason: `demote:${args.reason}`,
      metadata: {
        demotionReason: args.reason,
        supersedesCandidateId,
      },
      createdAt,
      previousEntryHash,
    });

    writeAuditEntry(
      {
        tenant_id: args.tenantId,
        actor_id: actor.id,
        actor_role: actor.role === "operator" || actor.role === "admin" ? actor.role : "system",
        event_type: AUDIT_EVENT_TYPES.BELIEF_DEMOTED,
        entity_type: ENTITY_TYPES.AGENT_MEMORY_CANDIDATE,
        entity_id: `agent_memory_candidate:${args.candidateId}`,
        reason: `demote:${args.reason}`,
        metadata_json: {
          candidate_id: args.candidateId,
          decision_id: decisionId,
          reason: args.reason,
          supersedes_candidate_id: supersedesCandidateId,
        },
        created_at: createdAt,
      },
      db
    );

    return { decisionId, receipt, supersedesCandidateId };
  })();

  writeAuditLog(db, {
    actor: actor.id,
    action: "belief_demotion",
    target: `agent_memory_candidate:${args.candidateId}`,
    detail: JSON.stringify({
      reason: args.reason,
      category,
      previousStage,
      nextStage,
    }),
    severity: "medium",
  });

  return result;
}

export function enqueueForReview(
  db: Database.Database,
  args: {
    candidateId: string;
    tenantId: string;
    category?: ClaimCategory | string;
    actor?: AdmitActor;
    ontologyReference?: OntologyContextReference;
  }
): { queueId: string; decisionId: string } {
  const candidate = readCandidate(db, args.candidateId, args.tenantId);
  const actor: AdmitActor = args.actor ?? {
    id: "system:belief-queue",
    role: "system",
    tenantId: args.tenantId,
  };
  const category = normalizeCategory(args.category);
  const createdAt = nowIso();
  const previousEntryHash = latestDecisionEntryHash(db, args.tenantId);
  const decisionId = crypto.randomUUID();
  const queueId = crypto.randomUUID();
  const resolvedOntology = resolveCandidateReviewOntologyContext(db, args.tenantId, args.candidateId);
  if (!resolvedOntology) throw new Error("ontology context is unavailable for belief review");
  const { reference: ontologyReference, context: ontology } = resolvedOntology;
  return db.transaction(() => {
    db.prepare(
      `INSERT INTO belief_review_queue
         (id, tenant_id, candidate_id, category, status, opened_by, opened_at,
          ontology_record_type, ontology_record_id, ontology_space_id, ontology_id, ontology_version,
          ontology_content_hash, ontology_canonical_id, ontology_source_id,
          ontology_source_hash, ontology_derivative_id)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      queueId, args.tenantId, args.candidateId, category, actor.id, createdAt,
      ontologyReference.recordType, ontologyReference.recordId, ontologyReference.spaceId, ontology.ontologyId,
      ontology.ontologyVersion, ontology.ontologyContentHash, ontology.canonicalId,
      ontology.sourceId, ontology.sourceHash, ontology.derivativeId,
    );

    const receipt = writeDecisionRow(db, {
      decisionId,
      candidateId: args.candidateId,
      tenantId: args.tenantId,
      category,
      decisionType: "queued_for_review",
      fromStage: candidate.belief_stage,
      toStage: candidate.belief_stage,
      actorId: actor.id,
      actorRole: actor.role,
      reason: "manual_enqueue",
      metadata: { queueId, manual: true },
      createdAt,
      previousEntryHash,
      ontology,
    });

    writeAuditEntry(
      {
        tenant_id: args.tenantId,
        actor_id: actor.id,
        actor_role: actor.role === "operator" || actor.role === "admin" ? actor.role : "system",
        event_type: AUDIT_EVENT_TYPES.BELIEF_QUEUED_FOR_REVIEW,
        entity_type: ENTITY_TYPES.BELIEF_REVIEW_ITEM,
        entity_id: `belief_review_item:${queueId}`,
        reason: "manual_enqueue",
        metadata_json: {
          candidate_id: args.candidateId,
          decision_id: decisionId,
          ontology_record_type: ontologyReference.recordType,
          ontology_record_id: ontologyReference.recordId,
          ontology_derivative_id: ontology.derivativeId,
        },
        created_at: createdAt,
      },
      db
    );
    return { queueId, decisionId, _receipt: receipt } as { queueId: string; decisionId: string };
  })();
}

export interface ResolveReviewArgs {
  queueId: string;
  tenantId: string;
  resolution: "approved" | "rejected";
  operatorId: string;
  note?: string | null;
  /** Only required when resolution === 'approved' -- the gate to admit. */
  category?: ClaimCategory | string;
  config?: BeliefPromotionConfig;
}

export interface ResolveReviewResult {
  resolution: "approved" | "rejected";
  decisionId: string;
  admission: AdmissionDecision | null;
  receipt: PromotionReceiptSummary;
}

export function resolveReview(
  db: Database.Database,
  args: ResolveReviewArgs
): ResolveReviewResult {
  const queue = db
    .prepare<[string, string], Record<string, unknown>>(
      `SELECT * FROM belief_review_queue
        WHERE id = ? AND tenant_id = ?`
    )
    .get(args.queueId, args.tenantId);
  if (!queue) throw new Error(`review queue item not found: ${args.queueId}`);
  const queueStatus = queueField(queue, "status");
  const queueCandidateId = queueField(queue, "candidate_id");
  const queueCategory = queueField(queue, "category");
  if (!queueStatus || !queueCandidateId || !queueCategory) {
    throw new Error("review queue item is malformed");
  }
  if (queueStatus !== "open") {
    throw new Error(`review queue item already ${queueStatus}`);
  }
  if (args.resolution !== "approved" && args.resolution !== "rejected") {
    throw new Error(`invalid resolution: ${String(args.resolution)}`);
  }
  const createdAt = nowIso();

  const previousEntryHash = latestDecisionEntryHash(db, args.tenantId);
  const decisionId = crypto.randomUUID();
  const candidate = readCandidate(db, queueCandidateId, args.tenantId);

  if (args.resolution === "approved") {
    return db.transaction((): ResolveReviewResult => {
      db.prepare(
        `UPDATE belief_review_queue
            SET status = 'approved',
                resolved_by = ?,
                resolution_note = ?,
                resolved_at = ?
          WHERE id = ?`
      ).run(args.operatorId, args.note ?? null, createdAt, args.queueId);

      const category = normalizeCategory(args.category ?? queueCategory);
      const admission = canAdmitToGold(db, args.tenantId, queueCandidateId, {
        actor: { id: args.operatorId, role: "operator", tenantId: args.tenantId },
        category,
        config: args.config,
        reviewedQueueId: args.queueId,
      });

      if (admission.kind !== "admitted") {
        throw new Error(
          `review-approved candidate failed admission gate: ${admission.kind === "denied" ? admission.reason : admission.reason}`
        );
      }

      // Record the review approval decision row (separate from the admission row).
      const receipt = writeDecisionRow(db, {
        decisionId,
        candidateId: queueCandidateId,
        tenantId: args.tenantId,
        category,
        decisionType: "review_approved",
        fromStage: candidate.belief_stage,
        toStage: "gold_operational_truth",
        actorId: args.operatorId,
        actorRole: "operator",
        reason: "review_approved",
        metadata: {
          queueId: args.queueId,
          admissionDecisionId: admission.decisionId,
          note: args.note ?? null,
        },
        createdAt,
        previousEntryHash,
        ontology: admission.receipt.ontology,
      });

      writeAuditEntry(
        {
          tenant_id: args.tenantId,
          actor_id: args.operatorId,
          actor_role: "operator",
          event_type: AUDIT_EVENT_TYPES.BELIEF_REVIEW_APPROVED,
          entity_type: ENTITY_TYPES.BELIEF_REVIEW_ITEM,
          entity_id: `belief_review_item:${args.queueId}`,
          reason: "review_approved",
          metadata_json: {
            candidate_id: queueCandidateId,
            decision_id: decisionId,
            note: args.note ?? null,
            ontology_derivative_id: admission.receipt.ontology?.derivativeId ?? null,
          },
          created_at: createdAt,
        },
        db
      );

      return { resolution: "approved", decisionId, admission, receipt };
    })();
  }

  // rejected
  return db.transaction((): ResolveReviewResult => {
    db.prepare(
      `UPDATE belief_review_queue
          SET status = 'rejected',
              resolved_by = ?,
              resolution_note = ?,
              resolved_at = ?
        WHERE id = ?`
    ).run(args.operatorId, args.note ?? null, createdAt, args.queueId);

    db.prepare(
      `UPDATE agent_memory_candidates SET status = 'rejected' WHERE id = ?`
    ).run(queueCandidateId);

    const category = normalizeCategory(args.category ?? queueCategory);
    const receipt = writeDecisionRow(db, {
      decisionId,
      candidateId: queueCandidateId,
      tenantId: args.tenantId,
      category,
      decisionType: "review_rejected",
      fromStage: candidate.belief_stage,
      toStage: candidate.belief_stage,
      actorId: args.operatorId,
      actorRole: "operator",
      reason: "review_rejected",
      metadata: { queueId: args.queueId, note: args.note ?? null },
      createdAt,
      previousEntryHash,
    });

    writeAuditEntry(
      {
        tenant_id: args.tenantId,
        actor_id: args.operatorId,
        actor_role: "operator",
        event_type: AUDIT_EVENT_TYPES.BELIEF_REVIEW_REJECTED,
        entity_type: ENTITY_TYPES.BELIEF_REVIEW_ITEM,
        entity_id: `belief_review_item:${args.queueId}`,
        reason: "review_rejected",
        metadata_json: {
          candidate_id: queueCandidateId,
          decision_id: decisionId,
          note: args.note ?? null,
        },
        created_at: createdAt,
      },
      db
    );

    return { resolution: "rejected", decisionId, admission: null, receipt };
  })();
}

// ---------------------------------------------------------------------------
// Review queue listing (used by the API route)
// ---------------------------------------------------------------------------

export function listOpenReviews(
  db: Database.Database,
  args: { tenantId: string; limit?: number }
): Array<{
  id: string;
  candidateId: string;
  category: ClaimCategory;
  status: "open";
  openedBy: string | null;
  openedAt: string;
}> {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const rows = db
    .prepare<[string, number], { id: string; candidate_id: string; category: string; opened_by: string | null; opened_at: string }>(
      `SELECT id, candidate_id, category, opened_by, opened_at
         FROM belief_review_queue
        WHERE tenant_id = ? AND status = 'open'
        ORDER BY opened_at ASC
        LIMIT ?`
    )
    .all(args.tenantId, limit);
  return rows.map((row) => ({
    id: row.id,
    candidateId: row.candidate_id,
    category: normalizeCategory(row.category),
    status: "open" as const,
    openedBy: row.opened_by,
    openedAt: row.opened_at,
  }));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sensitiveLabelOf(candidate: CandidateRow): string | null {
  const meta = parseJsonRecord(candidate.metadata_json);
  const raw = meta.sensitivity;
  return typeof raw === "string" && raw.length > 0 ? raw.toLowerCase() : null;
}

function latestDecisionForCandidate(db: Database.Database, candidateId: string): PromotionReceiptSummary | null {
  const row = db
    .prepare<[string], { id: string; tenant_id: string; candidate_id: string; category: string; decision_type: string; from_stage: string; to_stage: string; actor_id: string | null; actor_role: string; previous_entry_hash: string | null; entry_hash: string; created_at: string }>(
      `SELECT id, tenant_id, candidate_id, category, decision_type, from_stage, to_stage,
              actor_id, actor_role, previous_entry_hash, entry_hash, created_at
         FROM belief_promotion_decisions
        WHERE candidate_id = ? AND decision_type = 'promoted'
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1`
    )
    .get(candidateId);
  if (!row) return null;
  return {
    id: row.id,
    candidateId: row.candidate_id,
    tenantId: row.tenant_id,
    category: normalizeCategory(row.category),
    fromStage: row.from_stage as BeliefStage,
    toStage: row.to_stage as BeliefStage,
    decisionType: row.decision_type as PromotionReceiptSummary["decisionType"],
    actorId: row.actor_id,
    actorRole: row.actor_role,
    previousEntryHash: row.previous_entry_hash,
    entryHash: row.entry_hash,
    createdAt: row.created_at,
  };
}

// Re-export getDb consumers (so callers can avoid extra imports).
export { getDb };
