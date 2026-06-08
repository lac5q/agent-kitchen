import type { VaultDomain, VaultLabel, VaultPolicy, VaultSensitivity, VaultVisibility } from "@/lib/vault/types";

export interface ClassificationEvidenceSpan {
  reasonCode: string;
  text: string;
  start: number;
  end: number;
}

export interface ClassificationInput {
  content: string;
  sourceType: string;
  metadata?: Record<string, unknown>;
}

export interface ClassificationResult {
  label: {
    visibility: VaultVisibility;
    domain: VaultDomain | null;
    sensitivity: VaultSensitivity | null;
    policy: VaultPolicy;
  };
  requiresReview: boolean;
  reasonCodes: string[];
  evidenceSpans: ClassificationEvidenceSpan[];
}

export interface ClassifyVaultResult extends ClassificationResult {
  artifactId: string;
  reviewId: string | null;
  hilEscalationId: string | null;
}

type ClassificationReviewStatus = "open" | "approved" | "denied" | "redacted";
export type ClassificationDecision = "approve" | "deny" | "redact";

export interface ClassificationReviewRow {
  id: string;
  tenant_id: string;
  artifact_id: string;
  source_type: string;
  source_id: string | null;
  session_id: string | null;
  status: ClassificationReviewStatus;
  reason_codes_json: string;
  evidence_spans_json: string;
  proposed_visibility: VaultVisibility;
  proposed_domain: VaultDomain | null;
  proposed_sensitivity: VaultSensitivity | null;
  proposed_policy: VaultPolicy;
  reviewer_id: string | null;
  decision: string | null;
  decision_note: string | null;
  decided_at: string | null;
  hil_escalation_id: string | null;
  created_at: string;
}

export interface ClassificationReviewListItem {
  id: string;
  tenantId: string;
  artifactId: string;
  sourceType: string;
  sourceId: string | null;
  sessionId: string | null;
  status: ClassificationReviewStatus;
  reasonCodes: string[];
  evidenceSpans: ClassificationEvidenceSpan[];
  proposedLabel: Required<Pick<VaultLabel, "visibility" | "policy">> &
    Pick<VaultLabel, "domain" | "sensitivity">;
  reviewerId: string | null;
  decision: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  hilEscalationId: string | null;
  createdAt: string;
}

export interface DecideClassificationReviewInput {
  decision: ClassificationDecision;
  reviewerId: string;
  label?: VaultLabel;
  note?: string | null;
}
