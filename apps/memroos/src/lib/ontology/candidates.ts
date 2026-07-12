import { createHash, randomUUID } from "crypto";
import type Database from "better-sqlite3";

import { commitAuditAtomic } from "@/lib/skills/skill-audit-atomic";
import { discoverOntology } from "./registry";
import { assertCandidateAuthoritative, registerOntologyDerivative, registerOntologySource, resolveOntologyValidity } from "./validity";

type CandidateStatus = "pending" | "approved" | "rejected" | "deferred" | "superseded" | "invalidated" | "promoted";
type CandidateDecision = "approve" | "reject" | "defer" | "supersede" | "invalidate";
type CandidateKind = "type" | "relationship" | "alias";
export type ConfidenceLabel = "low" | "medium" | "high";

export interface OntologyCandidate {
  id: string;
  tenantId: string;
  spaceId: string;
  sourceId: string;
  sourceHash: string;
  sourceSpans: string[];
  extractorId: string;
  extractorVersion: string;
  candidateKind: CandidateKind;
  namespace: string;
  proposed: Record<string, unknown>;
  confidenceLabel: ConfidenceLabel;
  confidenceScore: number;
  evidenceHash: string;
  status: CandidateStatus;
  createdAt: string;
}

export interface ExtractCandidateInput {
  tenantId: string;
  spaceId: string;
  sourceId: string;
  sourceHash: string;
  sourceSpans: string[];
  extractorId: string;
  extractorVersion: string;
  candidateKind: CandidateKind;
  namespace: string;
  proposed: Record<string, unknown>;
  confidenceLabel: ConfidenceLabel;
  confidenceScore: number;
  actor: string;
}

export interface OntologyPromotion {
  id: string;
  candidateId: string;
  tenantId: string;
  spaceId: string;
  sealProposalId: string;
  sealDecisionId: string;
  ontologyId: string;
  ontologyVersion: string;
  ontologyContentHash: string;
  namespace: string;
  policyContextHash: string;
  idempotencyKey: string;
  promotedBy: string;
  promotedAt: string;
}

export function registerOntologyPolicyContext(db: Database.Database, input: { tenantId: string; spaceId: string; contextHash: string; policyVersion: string; actor: string; expiresAt: string }): void {
  const tenantId = clean(input.tenantId, "tenantId");
  const spaceId = clean(input.spaceId, "spaceId");
  if (!HASH.test(input.contextHash) || !clean(input.policyVersion, "policyVersion") || !clean(input.actor, "actor") || !Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= Date.now()) {
    throw new OntologyGovernanceError("policy context is invalid or stale", "invalid");
  }
  db.prepare(`INSERT INTO ontology_policy_contexts (context_hash, tenant_id, space_id, policy_version, registered_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(context_hash) DO NOTHING`).run(input.contextHash, tenantId, spaceId, input.policyVersion, input.actor, input.expiresAt, new Date().toISOString());
}

export class OntologyGovernanceError extends Error {
  constructor(message: string, public readonly code: "invalid" | "not_found" | "conflict" | "unauthorized" | "unavailable") {
    super(message);
    this.name = "OntologyGovernanceError";
  }
}

const HASH = /^sha256:[a-f0-9]{64}$/;
const NAMESPACE = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

function clean(value: string, field: string): string {
  const result = value?.trim();
  if (!result) throw new OntologyGovernanceError(`${field} is required`, "invalid");
  return result;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function hash(value: unknown): string {
  return `sha256:${createHash("sha256").update(stable(value), "utf8").digest("hex")}`;
}

function validConfidence(label: ConfidenceLabel, score: number): void {
  if (!["low", "medium", "high"].includes(label) || !Number.isFinite(score) || score < 0 || score > 1) {
    throw new OntologyGovernanceError("confidence must be a finite score in [0,1] with a controlled label", "invalid");
  }
  const expected = score < 0.34 ? "low" : score < 0.67 ? "medium" : "high";
  if (label !== expected) throw new OntologyGovernanceError("confidence label does not match deterministic score band", "invalid");
}

function candidateFrom(row: Record<string, string>): OntologyCandidate {
  return {
    id: row.id, tenantId: row.tenant_id, spaceId: row.space_id, sourceId: row.source_id, sourceHash: row.source_hash,
    sourceSpans: JSON.parse(row.source_spans_json) as string[], extractorId: row.extractor_id, extractorVersion: row.extractor_version,
    candidateKind: row.candidate_kind as CandidateKind, namespace: row.namespace, proposed: JSON.parse(row.proposed_json) as Record<string, unknown>,
    confidenceLabel: row.confidence_label as ConfidenceLabel, confidenceScore: Number(row.confidence_score), evidenceHash: row.evidence_hash,
    status: row.status as CandidateStatus, createdAt: row.created_at,
  };
}

function candidateForScope(db: Database.Database, id: string, tenantId: string, spaceId: string): OntologyCandidate {
  const row = db.prepare(`SELECT * FROM ontology_candidates WHERE id = ? AND tenant_id = ? AND space_id = ?`).get(id, tenantId, spaceId) as Record<string, string> | undefined;
  if (!row) throw new OntologyGovernanceError("candidate not found in authorized scope", "not_found");
  return candidateFrom(row);
}

export function extractOntologyCandidate(db: Database.Database, input: ExtractCandidateInput): OntologyCandidate {
  const tenantId = clean(input.tenantId, "tenantId");
  const spaceId = clean(input.spaceId, "spaceId");
  const sourceId = clean(input.sourceId, "sourceId");
  const sourceHash = clean(input.sourceHash, "sourceHash");
  const extractorId = clean(input.extractorId, "extractorId");
  const extractorVersion = clean(input.extractorVersion, "extractorVersion");
  const namespace = clean(input.namespace, "namespace");
  const actor = clean(input.actor, "actor");
  if (!HASH.test(sourceHash) || !NAMESPACE.test(namespace) || !["type", "relationship", "alias"].includes(input.candidateKind) || !Array.isArray(input.sourceSpans) || !input.sourceSpans.every((span) => typeof span === "string" && span.trim())) {
    throw new OntologyGovernanceError("candidate input is malformed", "invalid");
  }
  if (!input.proposed || typeof input.proposed !== "object" || Array.isArray(input.proposed)) throw new OntologyGovernanceError("proposed candidate is required", "invalid");
  validConfidence(input.confidenceLabel, input.confidenceScore);
  const evidenceHash = hash({ sourceHash, sourceSpans: input.sourceSpans, extractorId, extractorVersion, candidateKind: input.candidateKind, namespace, proposed: input.proposed, confidenceLabel: input.confidenceLabel, confidenceScore: input.confidenceScore });
  const existing = db.prepare(`SELECT * FROM ontology_candidates WHERE tenant_id = ? AND space_id = ? AND source_hash = ? AND extractor_id = ? AND extractor_version = ? AND evidence_hash = ?`).get(tenantId, spaceId, sourceHash, extractorId, extractorVersion, evidenceHash) as Record<string, string> | undefined;
  if (existing) return candidateFrom(existing);
  const candidate: OntologyCandidate = {
    id: `ontcand_${randomUUID()}`, tenantId, spaceId, sourceId, sourceHash, sourceSpans: [...input.sourceSpans], extractorId, extractorVersion,
    candidateKind: input.candidateKind, namespace, proposed: input.proposed, confidenceLabel: input.confidenceLabel, confidenceScore: input.confidenceScore,
    evidenceHash, status: "pending", createdAt: new Date().toISOString(),
  };
  const commit = commitAuditAtomic(db, {
    actor, eventType: "ontology_candidate_extracted", entityType: "ontology_candidate", entityId: candidate.id,
    metadata: { candidate_id: candidate.id, tenant_id: tenantId, space_id: spaceId, source_id: sourceId, source_hash: sourceHash, extractor_id: extractorId, extractor_version: extractorVersion, evidence_hash: evidenceHash, candidate_kind: candidate.candidateKind, namespace, confidence_label: candidate.confidenceLabel, confidence_score: candidate.confidenceScore },
    body: () => {
      const now = candidate.createdAt;
      // A different verified hash for the same source atomically revokes
      // every prior authoritative derivative before the new observation is
      // admitted. Historical candidate/decision evidence remains immutable.
      db.prepare(`UPDATE ontology_source_lifecycle SET status = 'changed', updated_at = ?, updated_by = ?, reason_code = 'source_changed' WHERE tenant_id = ? AND space_id = ? AND source_id = ? AND source_hash <> ? AND status = 'active'`)
        .run(now, actor, tenantId, spaceId, sourceId, sourceHash);
      db.prepare(`UPDATE ontology_derivative_validity SET status = 'revoked', revocation_reason = 'source_changed', revoked_at = ? WHERE tenant_id = ? AND space_id = ? AND source_id = ? AND source_hash <> ? AND status = 'authoritative'`)
        .run(now, tenantId, spaceId, sourceId, sourceHash);
      db.prepare(`UPDATE ontology_candidates SET status = 'invalidated', invalidated_at = ? WHERE tenant_id = ? AND space_id = ? AND source_id = ? AND source_hash <> ? AND status IN ('pending','approved','deferred','promoted')`).run(candidate.createdAt, tenantId, spaceId, sourceId, sourceHash);
      registerOntologySource(db, { tenantId, spaceId, sourceId, sourceHash, actor, reasonCode: "source_verified" });
      db.prepare(`INSERT INTO ontology_candidates (id, tenant_id, space_id, source_id, source_hash, source_spans_json, extractor_id, extractor_version, candidate_kind, namespace, proposed_json, confidence_label, confidence_score, evidence_hash, original_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
        .run(candidate.id, tenantId, spaceId, sourceId, sourceHash, stable(candidate.sourceSpans), extractorId, extractorVersion, candidate.candidateKind, namespace, stable(candidate.proposed), candidate.confidenceLabel, candidate.confidenceScore, evidenceHash, stable(candidate), candidate.createdAt);
      registerOntologyDerivative(db, { tenantId, spaceId, sourceId, sourceHash, derivativeType: "candidate", derivativeId: candidate.id });
      return candidate;
    },
  });
  return commit.mutationResult as OntologyCandidate;
}

export function decideOntologyCandidate(db: Database.Database, input: { candidateId: string; tenantId: string; spaceId: string; decision: CandidateDecision; reviewerId: string; reason: string; supersededBy?: string }): OntologyCandidate {
  const candidate = candidateForScope(db, input.candidateId, clean(input.tenantId, "tenantId"), clean(input.spaceId, "spaceId"));
  const reviewerId = clean(input.reviewerId, "reviewerId");
  const reason = clean(input.reason, "reason");
  if (!["approve", "reject", "defer", "supersede", "invalidate"].includes(input.decision) || candidate.status === "promoted" || candidate.status === "invalidated") throw new OntologyGovernanceError("candidate decision is not allowed", "conflict");
  const next: CandidateStatus = input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : input.decision === "defer" ? "deferred" : input.decision === "supersede" ? "superseded" : "invalidated";
  const now = new Date().toISOString();
  return commitAuditAtomic(db, {
    actor: reviewerId, eventType: "ontology_candidate_decided", entityType: "ontology_candidate", entityId: candidate.id,
    reason, metadata: { candidate_id: candidate.id, tenant_id: candidate.tenantId, space_id: candidate.spaceId, decision: input.decision, source_hash: candidate.sourceHash, evidence_hash: candidate.evidenceHash, confidence_label: candidate.confidenceLabel, confidence_score: candidate.confidenceScore },
    body: () => {
      db.prepare(`INSERT INTO ontology_candidate_decisions (id, candidate_id, tenant_id, space_id, decision, reviewer_id, reason, source_hash, evidence_hash, confidence_label, confidence_score, original_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(`ontcanddec_${randomUUID()}`, candidate.id, candidate.tenantId, candidate.spaceId, input.decision, reviewerId, reason, candidate.sourceHash, candidate.evidenceHash, candidate.confidenceLabel, candidate.confidenceScore, stable(candidate), now);
      db.prepare(`UPDATE ontology_candidates SET status = ?, invalidated_at = CASE WHEN ? = 'invalidated' THEN ? ELSE invalidated_at END, superseded_by = CASE WHEN ? = 'superseded' THEN ? ELSE superseded_by END WHERE id = ?`).run(next, next, now, next, input.supersededBy ?? null, candidate.id);
      return { ...candidate, status: next };
    },
  }).mutationResult as OntologyCandidate;
}

export function promoteOntologyCandidate(db: Database.Database, input: { candidateId: string; tenantId: string; spaceId: string; sealProposalId: string; sealDecisionId: string; ontologyId: string; ontologyVersion: string; ontologyContentHash: string; namespace: string; policyContextHash: string; reviewerId: string; idempotencyKey: string; expiresAt: string }): OntologyPromotion {
  const candidate = candidateForScope(db, input.candidateId, clean(input.tenantId, "tenantId"), clean(input.spaceId, "spaceId"));
  const required = ["sealProposalId", "sealDecisionId", "ontologyId", "ontologyVersion", "ontologyContentHash", "namespace", "policyContextHash", "reviewerId", "idempotencyKey", "expiresAt"] as const;
  for (const field of required) clean(input[field], field);
  if (!HASH.test(input.ontologyContentHash) || !HASH.test(input.policyContextHash) || !NAMESPACE.test(input.namespace) || Date.parse(input.expiresAt) <= Date.now()) throw new OntologyGovernanceError("promotion context is incomplete, invalid, or stale", "invalid");
  const prior = db.prepare(`SELECT * FROM ontology_promotions WHERE tenant_id = ? AND space_id = ? AND idempotency_key = ?`).get(candidate.tenantId, candidate.spaceId, input.idempotencyKey) as Record<string, string> | undefined;
  if (prior) {
    if (prior.candidate_id !== candidate.id
      || prior.ontology_id !== input.ontologyId
      || prior.ontology_version !== input.ontologyVersion
      || prior.ontology_content_hash !== input.ontologyContentHash
      || prior.namespace !== input.namespace
      || prior.policy_context_hash !== input.policyContextHash
      || prior.seal_proposal_id !== input.sealProposalId
      || prior.seal_decision_id !== input.sealDecisionId) {
      throw new OntologyGovernanceError("idempotency key conflicts with another promotion context", "conflict");
    }
    return promotionFrom(prior);
  }
  if (candidate.status !== "approved" || candidate.namespace !== input.namespace) throw new OntologyGovernanceError("approved candidate and namespace are required for promotion", "conflict");
  assertCandidateAuthoritative(db, { tenantId: candidate.tenantId, spaceId: candidate.spaceId, candidateId: candidate.id });
  let ontology;
  try { ontology = discoverOntology(db, { ontologyId: input.ontologyId, version: input.ontologyVersion }); } catch (error) { throw new OntologyGovernanceError(error instanceof Error ? error.message : "ontology unavailable", "unavailable"); }
  if (!ontology.globallyActive || ontology.contentHash !== input.ontologyContentHash) throw new OntologyGovernanceError("ontology is unavailable or inconsistent", "unavailable");
  const policy = db.prepare(`SELECT 1 FROM ontology_policy_contexts WHERE context_hash = ? AND tenant_id = ? AND space_id = ? AND expires_at > ?`).get(input.policyContextHash, candidate.tenantId, candidate.spaceId, new Date().toISOString());
  if (!policy) throw new OntologyGovernanceError("policy context is unavailable or stale", "unavailable");
  const seal = db.prepare(`SELECT p.diff_json FROM seal_proposals p JOIN seal_proposal_decisions d ON d.proposal_id = p.id WHERE p.id = ? AND p.tenant_id = ? AND p.proposal_type = 'ontology_promotion' AND p.status IN ('approved','applied') AND d.id = ? AND d.action = 'approved' AND d.operator = ?`).get(input.sealProposalId, candidate.tenantId, input.sealDecisionId, input.reviewerId) as { diff_json: string } | undefined;
  if (!seal) throw new OntologyGovernanceError("approved SEAL proposal and decision are required", "unavailable");
  let sealCandidateId: unknown;
  try { sealCandidateId = (JSON.parse(seal.diff_json) as Record<string, unknown>).candidateId; } catch { throw new OntologyGovernanceError("SEAL proposal evidence is malformed", "unavailable"); }
  if (sealCandidateId !== candidate.id) throw new OntologyGovernanceError("SEAL proposal does not govern this candidate", "conflict");
  const canonicalId = typeof candidate.proposed["id"] === "string" ? candidate.proposed["id"] : "";
  if (!canonicalId || !canonicalId.startsWith(`${candidate.namespace}.`)) throw new OntologyGovernanceError("candidate requires a namespace-qualified canonical id", "invalid");
  const promotion: OntologyPromotion = { id: `ontprom_${randomUUID()}`, candidateId: candidate.id, tenantId: candidate.tenantId, spaceId: candidate.spaceId, sealProposalId: input.sealProposalId, sealDecisionId: input.sealDecisionId, ontologyId: ontology.ontologyId, ontologyVersion: ontology.version, ontologyContentHash: ontology.contentHash, namespace: candidate.namespace, policyContextHash: input.policyContextHash, idempotencyKey: input.idempotencyKey, promotedBy: input.reviewerId, promotedAt: new Date().toISOString() };
  return commitAuditAtomic(db, {
    actor: input.reviewerId, eventType: "ontology_candidate_promoted", entityType: "ontology_promotion", entityId: promotion.id,
    metadata: { promotion_id: promotion.id, candidate_id: candidate.id, tenant_id: candidate.tenantId, space_id: candidate.spaceId, seal_proposal_id: promotion.sealProposalId, seal_decision_id: promotion.sealDecisionId, ontology_id: promotion.ontologyId, ontology_version: promotion.ontologyVersion, ontology_content_hash: promotion.ontologyContentHash, namespace: promotion.namespace, policy_context_hash: promotion.policyContextHash, evidence_hash: candidate.evidenceHash },
    body: () => {
      db.prepare(`INSERT INTO ontology_promotions (id, candidate_id, tenant_id, space_id, seal_proposal_id, seal_decision_id, ontology_id, ontology_version, ontology_content_hash, namespace, policy_context_hash, idempotency_key, promoted_by, promoted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(promotion.id, promotion.candidateId, promotion.tenantId, promotion.spaceId, promotion.sealProposalId, promotion.sealDecisionId, promotion.ontologyId, promotion.ontologyVersion, promotion.ontologyContentHash, promotion.namespace, promotion.policyContextHash, promotion.idempotencyKey, promotion.promotedBy, promotion.promotedAt);
      const canonicalDefinitionId = `ontdef_${randomUUID()}`;
      db.prepare(`INSERT INTO ontology_canonical_definitions (id, promotion_id, ontology_id, ontology_version, ontology_content_hash, namespace, canonical_id, definition_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(canonicalDefinitionId, promotion.id, promotion.ontologyId, promotion.ontologyVersion, promotion.ontologyContentHash, promotion.namespace, canonicalId, stable(candidate.proposed), promotion.promotedAt);
      const source = { tenantId: candidate.tenantId, spaceId: candidate.spaceId, sourceId: candidate.sourceId, sourceHash: candidate.sourceHash };
      registerOntologyDerivative(db, { ...source, derivativeType: "promotion", derivativeId: promotion.id });
      registerOntologyDerivative(db, { ...source, derivativeType: "canonical_definition", derivativeId: canonicalDefinitionId });
      db.prepare(`UPDATE ontology_candidates SET status = 'promoted' WHERE id = ?`).run(candidate.id);
      return promotion;
    },
  }).mutationResult as OntologyPromotion;
}

function promotionFrom(row: Record<string, string>): OntologyPromotion {
  return { id: row.id, candidateId: row.candidate_id, tenantId: row.tenant_id, spaceId: row.space_id, sealProposalId: row.seal_proposal_id, sealDecisionId: row.seal_decision_id, ontologyId: row.ontology_id, ontologyVersion: row.ontology_version, ontologyContentHash: row.ontology_content_hash, namespace: row.namespace, policyContextHash: row.policy_context_hash, idempotencyKey: row.idempotency_key, promotedBy: row.promoted_by, promotedAt: row.promoted_at };
}

export function getOntologyCandidate(db: Database.Database, candidateId: string, tenantId: string, spaceId: string): OntologyCandidate {
  return candidateForScope(db, candidateId, tenantId, spaceId);
}

export function ontologyReceiptContext(db: Database.Database, input: { tenantId: string; spaceId: string; recordType: string; recordId: string }): Record<string, unknown> {
  return resolveOntologyValidity(db, input);
}
