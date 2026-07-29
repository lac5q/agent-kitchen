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
  /**
   * Space ids this actor is a member of (see `space_members`). Required to
   * read any row carrying a `space_id`; see the space gate in
   * `authorizeMemoryUse`. `undefined`/omitted is treated as "no memberships"
   * and therefore denies space-scoped rows — fail closed, because a caller
   * that forgot to resolve memberships must not thereby gain access.
   * `filterAuthorizedMessageRows` resolves this for you.
   */
  spaceIds?: readonly string[] | null;
}

export interface MemoryLabelSnapshot {
  visibility?: VaultVisibility | null;
  domain?: VaultDomain | null;
  sensitivity?: VaultSensitivity | null;
  policy?: VaultPolicy | null;
  /** Mailbox/meeting owner; required for private agent_visible|indexable allow path. */
  ownerUserId?: string | null;
  /**
   * `messages.space_id`. When set, the row is space-scoped: only members of
   * that space (plus admins) may use it, regardless of visibility/policy.
   * NULL/absent preserves pre-space behaviour exactly — which is what every
   * existing row has, so this gate is additive rather than a broad revocation.
   */
  spaceId?: string | null;
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

function readSpaceId(record: Record<string, unknown>): string | null | undefined {
  const raw = record.spaceId ?? record.space_id;
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
  const spaceId = readSpaceId(record);

  if (
    visibility ||
    domain !== undefined ||
    sensitivity !== undefined ||
    policy ||
    ownerUserId !== undefined ||
    spaceId !== undefined
  ) {
    return { visibility, domain, sensitivity, policy, ownerUserId, spaceId };
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
      spaceId: snapshot.spaceId !== undefined ? snapshot.spaceId : label.spaceId,
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

/**
 * Space gate. A row carrying `space_id` is readable only by members of that
 * space. Admins bypass, consistent with `isOwnerOrAdmin`.
 *
 * Fails closed on a missing `spaceIds`: a caller that never resolved the
 * actor's memberships gets no space-scoped rows rather than all of them.
 * That matters because this gate is the *only* thing standing between a
 * space-scoped row and any authenticated actor — visibility='internal' +
 * policy='indexable' otherwise resolves to allow for everyone.
 */
function isSpaceAuthorized(actor: MemoryUseActor, spaceId: string | null | undefined): boolean {
  if (!spaceId) return true; // Not space-scoped — pre-space behaviour.
  if (actor.role === "admin") return true;
  const memberships = actor.spaceIds;
  if (!memberships || memberships.length === 0) return false;
  return memberships.includes(spaceId);
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
  // Space gate runs before the visibility/policy ladder below: membership is a
  // precondition for a space-scoped row, not something an `internal` +
  // `indexable` label can satisfy on its own. Rows with no space_id skip this
  // entirely and behave exactly as they did pre-spaces.
  if (!isSpaceAuthorized(input.actor, input.label.spaceId)) {
    return { decision: "deny", reason: "space_not_member", label };
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
      // space_id is selected as spaceId so it lands on MemoryLabelSnapshot
      // directly — without it the space gate sees undefined on every row and
      // silently never engages.
      `SELECT id, visibility, domain, sensitivity, policy, space_id AS spaceId
       FROM messages
       WHERE id IN (${placeholders})`
    )
    .all(...ids) as Array<MemoryLabelSnapshot & { id: number }>;

  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Resolve the space ids an actor belongs to, for the space gate.
 *
 * Returns `actor.spaceIds` untouched when the caller already resolved them.
 * Anonymous actors are never members of anything, so we skip the query.
 */
export function resolveActorSpaceIds(
  db: Database.Database,
  actor: MemoryUseActor
): readonly string[] {
  if (actor.spaceIds) return actor.spaceIds;
  if (!actor.id || actor.role === "anonymous") return [];
  try {
    const rows = db
      .prepare(`SELECT space_id FROM space_members WHERE member_id = ?`)
      .all(actor.id) as Array<{ space_id: string }>;
    return rows.map((row) => row.space_id);
  } catch {
    // space_members missing (pre-Phase-130 DB) — no space-scoped rows can
    // exist either, so an empty membership set is the correct answer.
    return [];
  }
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
  // Resolve memberships once per call, not per row: the gate fails closed on
  // an unresolved membership list, so this must happen even when the caller
  // did not think about spaces at all.
  const actorWithSpaces: MemoryUseActor = {
    ...actor,
    spaceIds: resolveActorSpaceIds(db, actor),
  };
  return rows.filter((row) => {
    const decision = authorizeMemoryUse({
      actor: actorWithSpaces,
      purpose,
      label: labels.get(row.id) ?? {},
    });
    auditDecision(db, actorWithSpaces, purpose, `message:${row.id}`, decision);
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
  // Resolve memberships for the same reason filterAuthorizedMessageRows does.
  // No external memory item carries a spaceId today, so this changes nothing
  // now — but the gate fails closed, so without it the first labelled item
  // would be denied for everyone, silently, in whichever lane introduced it.
  const actorWithSpaces: MemoryUseActor = {
    ...actor,
    spaceIds: resolveActorSpaceIds(db, actor),
  };
  return items.filter((item, index) => {
    const decision = authorizeMemoryUse({
      actor: actorWithSpaces,
      purpose,
      label: labelForItem(item) ?? {},
    });
    auditDecision(db, actorWithSpaces, purpose, targetForItem(item, index), decision);
    return decision.decision === "allow";
  });
}
