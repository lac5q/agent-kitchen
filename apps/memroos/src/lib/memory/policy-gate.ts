import type Database from "better-sqlite3";

import { writeAuditLog } from "@/lib/audit";
import type { VaultDomain, VaultPolicy, VaultSensitivity, VaultVisibility } from "@/lib/vault/types";

type MemoryUseDecision = "allow" | "deny" | "redact" | "review-required";
export type MemoryUsePurpose =
  | "recall"
  | "multi-search"
  | "context-pack"
  | "chatgpt-action"
  | "export"
  | "summary"
  | "dispatch"
  | "index-write"
  | "evidence-bundle"
  | "memory_search"
  | "memory-promotion";

export interface MemoryUseActor {
  id: string;
  role: "admin" | "operator" | "reviewer" | "agent" | "anonymous" | "system";
  capability?: string | null;
  tenantId?: string | null;
  project?: string | null;
  /** Reserved for delegated agent acting-for; unused for allow decisions in owner-ACL slice A. */
  actingForUserId?: string | null;
}

export interface MemoryLabelSnapshot {
  visibility?: VaultVisibility | null;
  domain?: VaultDomain | null;
  sensitivity?: VaultSensitivity | null;
  policy?: VaultPolicy | null;
  /** Mailbox/meeting owner; required for private agent_visible|indexable allow path. */
  ownerUserId?: string | null;
}

export interface MemoryUseDecisionResult {
  decision: MemoryUseDecision;
  reason: string;
  label: Required<Pick<MemoryLabelSnapshot, "visibility" | "policy">> &
    Pick<MemoryLabelSnapshot, "domain" | "sensitivity">;
}

interface RowWithId {
  id: number;
}

const VAULT_VISIBILITIES = new Set<VaultVisibility>(["private", "internal", "public_safe", "public_approved"]);
const VAULT_DOMAINS = new Set<VaultDomain>(["legal", "finance", "hr", "client", "personal", "engineering"]);
const VAULT_SENSITIVITIES = new Set<VaultSensitivity>([
  "pii",
  "secret",
  "credential",
  "privileged",
  "contract",
  "payment",
  "health",
]);
const VAULT_POLICIES = new Set<VaultPolicy>([
  "indexable",
  "agent_visible",
  "requires_redaction",
  "requires_human_review",
  "sealed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readOwnerUserId(record: Record<string, unknown>): string | null | undefined {
  const raw = record.ownerUserId ?? record.owner_user_id;
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function labelFromRecord(record: Record<string, unknown>): MemoryLabelSnapshot | undefined {
  const visibility = typeof record.visibility === "string" && VAULT_VISIBILITIES.has(record.visibility as VaultVisibility)
    ? (record.visibility as VaultVisibility)
    : undefined;
  const domain =
    record.domain === null
      ? null
      : typeof record.domain === "string" && VAULT_DOMAINS.has(record.domain as VaultDomain)
        ? (record.domain as VaultDomain)
        : undefined;
  const sensitivity =
    record.sensitivity === null
      ? null
      : typeof record.sensitivity === "string" && VAULT_SENSITIVITIES.has(record.sensitivity as VaultSensitivity)
        ? (record.sensitivity as VaultSensitivity)
        : undefined;
  const policy = typeof record.policy === "string" && VAULT_POLICIES.has(record.policy as VaultPolicy)
    ? (record.policy as VaultPolicy)
    : undefined;
  const ownerUserId = readOwnerUserId(record);

  if (visibility || domain !== undefined || sensitivity !== undefined || policy || ownerUserId !== undefined) {
    return { visibility, domain, sensitivity, policy, ownerUserId };
  }
  return undefined;
}

export function extractMemoryLabelSnapshot(value: unknown): MemoryLabelSnapshot | undefined {
  if (!isRecord(value)) return undefined;

  const metadata = isRecord(value.metadata) ? value.metadata : undefined;
  const node = isRecord(value.node) ? value.node : undefined;
  const candidates: unknown[] = [
    value,
    value.label,
    value.labels,
    metadata,
    metadata?.label,
    metadata?.labels,
    metadata?.metadata,
    node,
    node?.label,
    node?.labels,
    node?.metadata,
  ];

  let snapshot: MemoryLabelSnapshot | undefined;
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const label = labelFromRecord(candidate);
    if (!label) continue;
    if (!snapshot) {
      snapshot = { ...label };
      continue;
    }
    snapshot = {
      visibility: snapshot.visibility ?? label.visibility,
      domain: snapshot.domain !== undefined ? snapshot.domain : label.domain,
      sensitivity: snapshot.sensitivity !== undefined ? snapshot.sensitivity : label.sensitivity,
      policy: snapshot.policy ?? label.policy,
      ownerUserId: snapshot.ownerUserId !== undefined ? snapshot.ownerUserId : label.ownerUserId,
    };
  }
  return snapshot;
}

function normalizeLabel(label: MemoryLabelSnapshot): MemoryUseDecisionResult["label"] {
  return {
    visibility: label.visibility ?? "private",
    domain: label.domain ?? null,
    sensitivity: label.sensitivity ?? null,
    policy: label.policy ?? "sealed",
  };
}

function isOwnerOrAdmin(actor: MemoryUseActor, ownerUserId: string | null | undefined): boolean {
  if (actor.role === "admin") return true;
  // Owner ACL is for human principals only in slice A; agents stay denied until OwnerGate delegation.
  if (actor.role === "agent" || actor.role === "anonymous" || actor.role === "system") {
    return false;
  }
  return typeof ownerUserId === "string" && ownerUserId.length > 0 && actor.id === ownerUserId;
}

export function authorizeMemoryUse(input: {
  actor: MemoryUseActor;
  purpose: MemoryUsePurpose;
  label: MemoryLabelSnapshot;
}): MemoryUseDecisionResult {
  const label = normalizeLabel(input.label);

  if (label.policy === "sealed") {
    return { decision: "deny", reason: "sealed_content", label };
  }
  if (label.policy === "requires_human_review") {
    return { decision: "review-required", reason: "human_review_required", label };
  }
  if (label.policy === "requires_redaction") {
    return { decision: "redact", reason: "redaction_required", label };
  }
  if (label.visibility === "private") {
    const usablePrivatePolicy = label.policy === "agent_visible" || label.policy === "indexable";
    if (usablePrivatePolicy && isOwnerOrAdmin(input.actor, input.label.ownerUserId)) {
      return { decision: "allow", reason: "owner_or_admin_private", label };
    }
    return { decision: "deny", reason: "private_content", label };
  }
  if (input.actor.role === "anonymous" && label.visibility !== "public_approved") {
    return { decision: "deny", reason: "anonymous_actor", label };
  }
  if (label.policy === "indexable" || label.policy === "agent_visible") {
    return { decision: "allow", reason: "label_allows_use", label };
  }

  return { decision: "deny", reason: "unrecognized_policy", label };
}

function labelRowsByMessageId(
  db: Database.Database,
  ids: number[]
): Map<number, MemoryLabelSnapshot> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, visibility, domain, sensitivity, policy
       FROM messages
       WHERE id IN (${placeholders})`
    )
    .all(...ids) as Array<MemoryLabelSnapshot & { id: number }>;

  return new Map(rows.map((row) => [row.id, row]));
}

function auditDecision(
  db: Database.Database,
  actor: MemoryUseActor,
  purpose: MemoryUsePurpose,
  target: string,
  decision: MemoryUseDecisionResult
): void {
  writeAuditLog(db, {
    actor: actor.id,
    action: "memory_policy_decision",
    target,
    detail: JSON.stringify({
      purpose,
      decision: decision.decision,
      reason: decision.reason,
      actorRole: actor.role,
      capability: actor.capability ?? null,
      label: decision.label,
    }),
    severity: decision.decision === "deny" ? "high" : decision.decision === "allow" ? "info" : "medium",
  });
}

export function filterAuthorizedMessageRows<T extends RowWithId>(
  db: Database.Database,
  rows: T[],
  actor: MemoryUseActor,
  purpose: MemoryUsePurpose
): T[] {
  const labels = labelRowsByMessageId(db, rows.map((row) => row.id));
  return rows.filter((row) => {
    const decision = authorizeMemoryUse({
      actor,
      purpose,
      label: labels.get(row.id) ?? {},
    });
    auditDecision(db, actor, purpose, `message:${row.id}`, decision);
    return decision.decision === "allow";
  });
}

export function filterAuthorizedMemoryItems<T>(
  db: Database.Database,
  items: T[],
  actor: MemoryUseActor,
  purpose: MemoryUsePurpose,
  labelForItem: (item: T) => MemoryLabelSnapshot | null | undefined,
  targetForItem: (item: T, index: number) => string = (_item, index) => `memory:${index}`
): T[] {
  return items.filter((item, index) => {
    const decision = authorizeMemoryUse({
      actor,
      purpose,
      label: labelForItem(item) ?? {},
    });
    auditDecision(db, actor, purpose, targetForItem(item, index), decision);
    return decision.decision === "allow";
  });
}
