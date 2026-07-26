import crypto from "crypto";
import type Database from "better-sqlite3";

import { writeAuditLog } from "@/lib/audit";
import { openEscalation, writeAuditEntry } from "@/lib/audit/write";
import { PATTERNS, scanContent } from "@/lib/content-scanner";
import { readVaultArtifact } from "@/lib/vault/writer";
import type { VaultDomain, VaultLabel, VaultPolicy, VaultSensitivity, VaultVisibility } from "@/lib/vault/types";
import type {
  ClassificationDecision,
  ClassificationEvidenceSpan,
  ClassificationInput,
  ClassificationReviewListItem,
  ClassificationReviewRow,
  ClassificationResult,
  ClassifyVaultResult,
  DecideClassificationReviewInput,
} from "./types";
import { proposeShadowSuggestion } from "./llm-adjudicator";

const CLASSIFICATION_SCAN_CHUNK_SIZE = 4096;
const CLASSIFICATION_SCAN_OVERLAP = 512;

type RawArtifactRow = {
  id: string;
  tenant_id: string;
  project: string | null;
  source_type: string;
  source_id: string | null;
  session_id: string | null;
};

type NormalizedLabel = {
  visibility: VaultVisibility;
  domain: VaultDomain | null;
  sensitivity: VaultSensitivity | null;
  policy: VaultPolicy;
};

const SECRET_PATTERNS = new Set([
  "aws_access_key",
  "aws_secret_key",
  "github_token_pat",
  "github_token_oauth",
  "github_token_server",
  "pem_private_key",
  "jwt_token",
  "password_in_url",
  "slack_webhook",
  "generic_secret_assign",
  "generic_long_token",
]);

const PII_PATTERNS = new Set(["ssn_us", "email_address", "phone_us"]);

type FixedSensitiveKind = "confidential" | "legal" | "finance";

function addReason(reasons: string[], code: string): void {
  if (!reasons.includes(code)) reasons.push(code);
}

function combineText(input: ClassificationInput): string {
  const metadata = input.metadata ? JSON.stringify(input.metadata) : "";
  return `${input.content}\n${metadata}`.toLowerCase();
}

function collectProviderLabelTokens(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata) return [];
  const tokens: string[] = [];
  const pushValue = (value: unknown) => {
    if (typeof value === "string") {
      tokens.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) pushValue(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) pushValue(nested);
    }
  };

  const labelKeys = new Set([
    "gmail_labels",
    "gmailLabels",
    "labels",
    "categories",
    "confidential_label",
    "confidentialLabel",
    "microsoft_sensitivity",
    "microsoftSensitivity",
    "sensitivity_label",
    "sensitivityLabel",
    "provider_labels",
    "providerLabels",
  ]);

  const visit = (record: Record<string, unknown>, depth: number) => {
    if (depth > 3) return;
    for (const [key, value] of Object.entries(record)) {
      if (labelKeys.has(key)) {
        pushValue(value);
        continue;
      }
      // Vault classify path nests provider labels under replayMetadata.
      if ((key === "replayMetadata" || key === "metadata") && value && typeof value === "object" && !Array.isArray(value)) {
        visit(value as Record<string, unknown>, depth + 1);
      }
    }
  };

  visit(metadata, 0);
  return tokens;
}

function normalizeLabelToken(token: string): string {
  return token.trim().toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ");
}

/**
 * Fixed / provider labels are authoritative. They may only tighten classification.
 * Matches: Confidential, Legal, Finance/Financial, and common Gmail/Purview variants.
 */
export function detectFixedSensitiveLabels(input: ClassificationInput): {
  kinds: FixedSensitiveKind[];
  matchedTokens: string[];
  reasonCodes: string[];
  evidenceSpans: ClassificationEvidenceSpan[];
} {
  const kinds = new Set<FixedSensitiveKind>();
  const matchedTokens: string[] = [];
  const reasonCodes: string[] = [];
  const evidenceSpans: ClassificationEvidenceSpan[] = [];
  const tokens = collectProviderLabelTokens(input.metadata);

  for (const token of tokens) {
    const normalized = normalizeLabelToken(token);
    if (!normalized) continue;

    let kind: FixedSensitiveKind | null = null;
    if (
      /\bconfidential\b/.test(normalized) ||
      /\brestricted\b/.test(normalized) ||
      /\bhighly confidential\b/.test(normalized)
    ) {
      kind = "confidential";
    } else if (/\blegal\b/.test(normalized) || /\bprivileged\b/.test(normalized) || /\battorney\b/.test(normalized)) {
      kind = "legal";
    } else if (/\bfinance\b/.test(normalized) || /\bfinancial\b/.test(normalized) || /\bpayroll\b/.test(normalized)) {
      kind = "finance";
    }

    if (!kind) continue;
    kinds.add(kind);
    matchedTokens.push(token);
    addReason(reasonCodes, `fixed_label:${kind}`);
    evidenceSpans.push({
      reasonCode: `fixed_label:${kind}`,
      text: token.slice(0, 80),
      start: 0,
      end: Math.min(token.length, 80),
    });
  }

  return {
    kinds: Array.from(kinds),
    matchedTokens,
    reasonCodes,
    evidenceSpans,
  };
}

function domainFromFixedKinds(kinds: FixedSensitiveKind[], fallback: VaultDomain): VaultDomain {
  if (kinds.includes("legal")) return "legal";
  if (kinds.includes("finance")) return "finance";
  if (kinds.includes("confidential")) {
    if (fallback === "engineering") return "client";
    return fallback;
  }
  return fallback;
}

function sensitivityFromFixedKinds(
  kinds: FixedSensitiveKind[],
  scannerSensitivity: VaultSensitivity | null
): VaultSensitivity | null {
  if (kinds.includes("legal") || kinds.includes("confidential")) {
    return scannerSensitivity === "credential" || scannerSensitivity === "payment"
      ? scannerSensitivity
      : "privileged";
  }
  if (kinds.includes("finance")) {
    return scannerSensitivity === "credential" ? scannerSensitivity : "payment";
  }
  return scannerSensitivity;
}

function detectDomain(input: ClassificationInput): VaultDomain {
  const haystack = combineText(input);
  if (/\b(client|customer|account|sow|onboarding)\b/.test(haystack)) return "client";
  if (/\b(legal|contract|nda|attorney|privileged|counsel)\b/.test(haystack)) return "legal";
  if (/\b(finance|invoice|bank|wire|payment|payroll|tax|card)\b/.test(haystack)) return "finance";
  if (/\b(hr|salary|candidate|performance review|termination|benefits)\b/.test(haystack)) return "hr";
  if (/\b(personal|family|medical|health|home address)\b/.test(haystack)) return "personal";
  return "engineering";
}

function publicPromotionCandidate(input: ClassificationInput): boolean {
  return /\b(public|publish|website|press|marketing|announcement|external)\b/i.test(input.content);
}

function highRiskDomain(domain: VaultDomain): boolean {
  return domain === "client" || domain === "finance" || domain === "hr" || domain === "legal" || domain === "personal";
}

function evidenceForPattern(content: string, reasonCode: string, pattern: RegExp): ClassificationEvidenceSpan | null {
  const match = pattern.exec(content);
  if (!match || match.index < 0) return null;
  return {
    reasonCode,
    text: match[0].slice(0, 80),
    start: match.index,
    end: match.index + match[0].length,
  };
}

function scannerEvidence(content: string): ClassificationEvidenceSpan[] {
  const evidence: ClassificationEvidenceSpan[] = [];
  for (const item of PATTERNS) {
    const span = evidenceForPattern(content, `scanner:${item.name}`, new RegExp(item.pattern));
    if (span) evidence.push(span);
  }
  return evidence;
}

function sensitivityFromScanner(patternNames: string[], domain: VaultDomain): VaultSensitivity | null {
  if (patternNames.includes("credit_card")) return "payment";
  if (patternNames.some((name) => PII_PATTERNS.has(name))) return "pii";
  if (patternNames.some((name) => SECRET_PATTERNS.has(name))) return "credential";
  if (domain === "legal") return "privileged";
  if (domain === "finance") return "payment";
  if (domain === "hr" || domain === "personal") return "pii";
  return null;
}

/**
 * Scan long vault/message bodies in bounded overlapping chunks.
 *
 * `scanContent` intentionally fails closed for inputs over 4096 characters.
 * That contract is correct for a single untrusted request, but applying it
 * directly to ingested transcripts turns every normal long conversation into
 * a human-review escalation. Chunking preserves fail-closed scanning while
 * treating `input_too_long` as a transport guard, not as security evidence.
 */
function scanForClassification(content: string) {
  if (content.length <= CLASSIFICATION_SCAN_CHUNK_SIZE) {
    return scanContent(content);
  }

  const matches = new Map<string, {
    patternName: string;
    severity: "HIGH" | "MEDIUM";
    redacted: string;
  }>();
  let blocked = false;
  const step = CLASSIFICATION_SCAN_CHUNK_SIZE - CLASSIFICATION_SCAN_OVERLAP;

  for (let start = 0; start < content.length; start += step) {
    const result = scanContent(content.slice(start, start + CLASSIFICATION_SCAN_CHUNK_SIZE));
    for (const match of result.matches) {
      if (match.patternName === "input_too_long") continue;
      matches.set(match.patternName, match);
      if (match.severity === "HIGH") blocked = true;
    }
  }

  return {
    blocked,
    matches: Array.from(matches.values()),
    cleanContent: content,
  };
}

export function classifyText(input: ClassificationInput): ClassificationResult {
  const scan = scanForClassification(input.content);
  const fixed = detectFixedSensitiveLabels(input);
  const domain = domainFromFixedKinds(fixed.kinds, detectDomain(input));
  const reasonCodes = ["default_private_sealed"];
  const scannerPatterns = scan.matches.map((match) => match.patternName);
  const evidenceSpans = [...scannerEvidence(input.content), ...fixed.evidenceSpans];

  for (const match of scan.matches) {
    addReason(reasonCodes, `scanner:${match.patternName}`);
  }
  for (const code of fixed.reasonCodes) addReason(reasonCodes, code);

  if (highRiskDomain(domain)) addReason(reasonCodes, `domain:${domain}`);
  if (publicPromotionCandidate(input)) addReason(reasonCodes, "public_promotion_candidate");

  const scannerOrPublicRisk =
    scan.blocked ||
    scan.matches.length > 0 ||
    publicPromotionCandidate(input);

  // Keyword-only high-risk domains still go to human review.
  // Fixed confidential/legal/finance labels are authoritative: owner-scoped agent_visible
  // so the owner ACL path can recall them without waiting on review promotion.
  const hasFixedSensitive = fixed.kinds.length > 0;
  const requiresReview = scannerOrPublicRisk || (!hasFixedSensitive && highRiskDomain(domain)) || hasFixedSensitive;

  let policy: VaultPolicy;
  if (scannerOrPublicRisk) {
    policy = "requires_human_review";
  } else if (hasFixedSensitive) {
    policy = "agent_visible";
    addReason(reasonCodes, "fixed_label_owner_scoped");
  } else if (highRiskDomain(domain)) {
    policy = "requires_human_review";
  } else {
    policy = "sealed";
  }

  const label: NormalizedLabel = {
    visibility: "private",
    domain,
    sensitivity: sensitivityFromFixedKinds(fixed.kinds, sensitivityFromScanner(scannerPatterns, domain)),
    policy,
  };

  // Shadow adjudicator: never applied to labels in this phase; records tighten/abstain candidates.
  if (process.env.MEMROOS_CLASSIFICATION_LLM_SHADOW === "1") {
    const suggestion = proposeShadowSuggestion({
      content: input.content,
      sourceType: input.sourceType,
      metadata: input.metadata,
      deterministicReasonCodes: reasonCodes,
    });
    for (const code of suggestion.reasonCodes) addReason(reasonCodes, `shadow:${code}`);
  }

  return { label, requiresReview, reasonCodes, evidenceSpans };
}

function readArtifactRow(db: Database.Database, artifactId: string): RawArtifactRow {
  const row = db
    .prepare("SELECT id, tenant_id, project, source_type, source_id, session_id FROM raw_artifacts WHERE id = ?")
    .get(artifactId) as RawArtifactRow | undefined;
  if (!row) throw new Error(`Vault artifact not found: ${artifactId}`);
  return row;
}

function appendArtifactLabel(db: Database.Database, artifactId: string, label: NormalizedLabel, labeledAt: string): number {
  const current = db
    .prepare("SELECT COALESCE(MAX(label_version), 0) as version FROM artifact_labels WHERE artifact_id = ?")
    .get(artifactId) as { version: number };
  const nextVersion = Number(current.version) + 1;
  db.prepare(
    `INSERT INTO artifact_labels
      (artifact_id, visibility, domain, sensitivity, policy, label_version, labeled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(artifactId, label.visibility, label.domain, label.sensitivity, label.policy, nextVersion, labeledAt);
  return nextVersion;
}

function stampSourceRows(db: Database.Database, artifact: RawArtifactRow, label: NormalizedLabel): void {
  if (artifact.source_type === "messages" && artifact.session_id) {
    // Only stamp rows that are still at their default unclassified values.
    // Rows already promoted by a reviewer (e.g. visibility='public_safe') or
    // explicitly sealed by a prior classification are left untouched to prevent
    // a later artifact in the same session from downgrading an approved label.
    db.prepare(
      `UPDATE messages
       SET visibility = ?, domain = ?, sensitivity = ?, policy = ?
       WHERE session_id = ?
         AND (visibility IS NULL OR visibility = 'private')
         AND (policy IS NULL OR policy = 'sealed' OR policy = 'requires_human_review')`
    ).run(label.visibility, label.domain, label.sensitivity, label.policy, artifact.session_id);
  }
}

function openClassificationReview(
  db: Database.Database,
  artifact: RawArtifactRow,
  result: ClassificationResult,
  now: string
): { reviewId: string; hilEscalationId: string } {
  const reviewId = crypto.randomUUID();
  const hilEscalationId = openEscalation(
    {
      tenant_id: artifact.tenant_id,
      entity_type: "classification_review",
      entity_id: reviewId,
      escalation_type: "agent_escalate",
      opened_by: "classification-cascade",
    },
    db
  );

  db.prepare(
    `INSERT INTO classification_reviews
      (id, tenant_id, artifact_id, source_type, source_id, session_id, status,
       reason_codes_json, evidence_spans_json, proposed_visibility, proposed_domain,
       proposed_sensitivity, proposed_policy, hil_escalation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    reviewId,
    artifact.tenant_id,
    artifact.id,
    artifact.source_type,
    artifact.source_id,
    artifact.session_id,
    JSON.stringify(result.reasonCodes),
    JSON.stringify(result.evidenceSpans),
    result.label.visibility,
    result.label.domain,
    result.label.sensitivity,
    result.label.policy,
    hilEscalationId,
    now
  );

  writeAuditLog(db, {
    actor: "classification-cascade",
    action: "classification_review_created",
    target: reviewId,
    detail: JSON.stringify({ artifactId: artifact.id, reasonCodes: result.reasonCodes }),
    severity: "medium",
  });

  return { reviewId, hilEscalationId };
}

export function classifyVaultArtifact(db: Database.Database, artifactId: string): ClassifyVaultResult {
  const artifact = readArtifactRow(db, artifactId);
  const replay = readVaultArtifact(db, artifactId);
  const result = classifyText({
    content: replay.body,
    sourceType: artifact.source_type,
    metadata: {
      project: artifact.project,
      sourceId: artifact.source_id,
      sessionId: artifact.session_id,
      replayMetadata: replay.replayMetadata,
    },
  });
  const now = new Date().toISOString();
  let reviewId: string | null = null;
  let hilEscalationId: string | null = null;

  db.transaction(() => {
    appendArtifactLabel(db, artifact.id, result.label, now);
    stampSourceRows(db, artifact, result.label);
    if (result.requiresReview) {
      const review = openClassificationReview(db, artifact, result, now);
      reviewId = review.reviewId;
      hilEscalationId = review.hilEscalationId;
    }
  })();

  return { ...result, artifactId, reviewId, hilEscalationId };
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function reviewToListItem(row: ClassificationReviewRow): ClassificationReviewListItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    artifactId: row.artifact_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sessionId: row.session_id,
    status: row.status,
    reasonCodes: parseJsonArray<string>(row.reason_codes_json),
    evidenceSpans: parseJsonArray<ClassificationEvidenceSpan>(row.evidence_spans_json),
    proposedLabel: {
      visibility: row.proposed_visibility,
      domain: row.proposed_domain,
      sensitivity: row.proposed_sensitivity,
      policy: row.proposed_policy,
    },
    reviewerId: row.reviewer_id,
    decision: row.decision,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at,
    hilEscalationId: row.hil_escalation_id,
    createdAt: row.created_at,
  };
}

export function listClassificationReviews(
  db: Database.Database,
  params: { tenantId: string; status?: "open" | "all"; limit?: number }
): ClassificationReviewListItem[] {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const rows = params.status === "all"
    ? db
        .prepare("SELECT * FROM classification_reviews WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?")
        .all(params.tenantId, limit)
    : db
        .prepare("SELECT * FROM classification_reviews WHERE tenant_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT ?")
        .all(params.tenantId, limit);
  return (rows as ClassificationReviewRow[]).map(reviewToListItem);
}

function normalizeDecisionLabel(review: ClassificationReviewRow, override?: VaultLabel): NormalizedLabel {
  return {
    visibility: override?.visibility ?? review.proposed_visibility,
    domain: override?.domain === undefined ? review.proposed_domain : override.domain,
    sensitivity: override?.sensitivity === undefined ? review.proposed_sensitivity : override.sensitivity,
    policy: override?.policy ?? review.proposed_policy,
  };
}

function statusForDecision(decision: ClassificationDecision): "approved" | "denied" | "redacted" {
  if (decision === "approve") return "approved";
  if (decision === "redact") return "redacted";
  return "denied";
}

function nullableUserId(db: Database.Database, userId: string): string | null {
  const row = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  return row ? userId : null;
}

export function decideClassificationReview(
  db: Database.Database,
  reviewId: string,
  input: DecideClassificationReviewInput
): { review: ClassificationReviewListItem; label: NormalizedLabel | null } {
  const review = db
    .prepare("SELECT * FROM classification_reviews WHERE id = ?")
    .get(reviewId) as ClassificationReviewRow | undefined;
  if (!review) throw new Error(`classification review not found: ${reviewId}`);
  if (review.status !== "open") throw new Error(`classification review is already ${review.status}`);

  const artifact = readArtifactRow(db, review.artifact_id);
  const now = new Date().toISOString();
  const status = statusForDecision(input.decision);
  const label = input.decision === "deny" ? null : normalizeDecisionLabel(review, input.label);

  db.transaction(() => {
    db.prepare(
      `UPDATE classification_reviews
       SET status = ?, reviewer_id = ?, decision = ?, decision_note = ?, decided_at = ?
       WHERE id = ?`
    ).run(status, input.reviewerId, input.decision, input.note ?? null, now, reviewId);

    if (label) {
      appendArtifactLabel(db, review.artifact_id, label, now);
      stampSourceRows(db, artifact, label);
    }

    if (review.hil_escalation_id) {
      db.prepare(
        `UPDATE hil_escalations
         SET status = 'resolved', resolved_by = ?, resolution_note = ?, resolved_at = ?
         WHERE id = ? AND status != 'resolved'`
      ).run(
        nullableUserId(db, input.reviewerId),
        input.note ?? `classification ${input.decision}`,
        now,
        review.hil_escalation_id
      );

      writeAuditEntry(
        {
          tenant_id: review.tenant_id,
          actor_id: input.reviewerId,
          actor_role: "reviewer",
          event_type: "hil.resolved",
          entity_type: "hil_escalation",
          entity_id: `hil_escalation:${review.hil_escalation_id}`,
          reason: input.note ?? `classification ${input.decision}`,
          metadata_json: {
            classification_review_id: reviewId,
            decision: input.decision,
          },
          created_at: now,
        },
        db
      );
    }

    writeAuditLog(db, {
      actor: input.reviewerId,
      action: "classification_review_decided",
      target: reviewId,
      detail: JSON.stringify({ decision: input.decision, note: input.note ?? null, label }),
      severity: input.decision === "deny" ? "medium" : "info",
    });
  })();

  const updated = db
    .prepare("SELECT * FROM classification_reviews WHERE id = ?")
    .get(reviewId) as ClassificationReviewRow;
  return { review: reviewToListItem(updated), label };
}
