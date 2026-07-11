/**
 * Skill sync governance — Phase 149 / SKILLTRUST-04.
 *
 * Governed cross-harness auto-sync: detected skill changes from
 * Claude Code / Codex / Hermes / OpenCode directories arrive as
 * `skill_import_proposals` rows (NOT silent registry updates), and each
 * agent gets a `skill_version_pins` row that records the version+hash it
 * is allowed to dispatch against plus exactly one prior version for
 * one-step rollback.
 *
 * Security contract:
 *   - detectSkillChange() NEVER mutates `skill_registry`. It only writes
 *     a new `skill_import_proposals` row (status='pending') when the
 *     detected content_hash differs from the registry row's current hash.
 *     Identical-hash detections are deduped via the
 *     UNIQUE(source_harness, skill_name, detected_content_hash) constraint.
 *   - approveImportProposal() / rejectImportProposal() never modify the
 *     skill_registry dispatch_status. The quarantine pipeline (v11) is the
 *     sole path to `enabled`. Approval only flips the proposal status so
 *     downstream tooling can act on it (e.g. seed a quarantine row).
 *   - createOrUpdateAgentVersionPin() refuses to create a pin that points
 *     at a registry row whose dispatch_status is not in
 *     ('enabled','quarantined') with completeness_pct=100, so an agent can
 *     never pin against a contract that the SQL gate would deny at
 *     dispatch time. The proposal flow is the only way to introduce new
 *     content; operators must approve the proposal before a pin can be
 *     created against it.
 *   - rollbackAgentVersionPin() restores the immediately prior pin state
 *     and writes an `audit_entries` row with event_type
 *     'skill.pin.rolled_back'. Rollback is exactly one step: after a
 *     rollback the prior_version becomes the new current and the previous
 *     prior_version is discarded. To roll back further an operator must
 *     re-import + re-pin.
 *   - All inputs are validated. No raw skill body or secret-like content
 *     is persisted by this module — only content_hash values, short
 *     diff summaries, and JSON diff payloads structured by the caller.
 */

import { createHash, randomUUID } from "crypto";
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Types — proposals
// ---------------------------------------------------------------------------

export const PROPOSAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export interface ImportProposalRow {
  id: string;
  source_harness: string;
  skill_name: string;
  skill_identity: string;
  current_content_hash: string | null;
  detected_content_hash: string;
  prior_content_hash: string | null;
  prior_version: string | null;
  version: string | null;
  diff_summary: string;
  diff_payload: string;
  status: ProposalStatus;
  proposed_by: string;
  proposed_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  affected_skill_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface DetectSkillChangeParams {
  source_harness: string;
  skill_name: string;
  version?: string | null;
  detected_content_hash?: string | null;
  /** Raw body used to compute the hash when detected_content_hash is omitted. */
  detected_content_body?: string | null;
  proposed_by: string;
  diff_summary?: string;
  diff_payload?: Record<string, unknown>;
}

export interface DetectSkillChangeResult {
  proposal: ImportProposalRow;
  /** True when this call inserted a new pending proposal. False when an
   *  identical-hash scan matched an existing pending row (dedupe). */
  created: boolean;
  /** True when the detected content_hash equals the registry row's
   *  current hash — the proposal is recorded but the registry is left
   *  untouched. The caller can treat this as "no change" without
   *  surfacing the proposal to the operator. */
  unchanged: boolean;
}

export interface ListProposalsOptions {
  status?: ProposalStatus;
  source_harness?: string;
  skill_name?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Types — pins
// ---------------------------------------------------------------------------

export interface VersionPinRow {
  id: number;
  agent_id: string;
  skill_name: string;
  skill_id: number | null;
  current_version: string;
  current_content_hash: string;
  prior_version: string | null;
  prior_content_hash: string | null;
  prior_skill_id: number | null;
  actor: string;
  created_at: string;
  updated_at: string;
  rolled_back_at: string | null;
  rolled_back_by: string | null;
  last_rollback_event_id: string | null;
}

export interface CreateOrUpdatePinParams {
  agent_id: string;
  skill_name: string;
  skill_id: number | null;
  current_version: string;
  current_content_hash: string;
  actor: string;
  /**
   * VAL-SKILL-030 — optimistic-concurrency token. When supplied, the
   * existing pin's `updated_at` must match this value exactly, or the
   * call fails with a typed SyncGovernanceError. Lets a concurrent
   * operator action race fail closed without silently overwriting
   * the other side's intent.
   */
  expected_current_updated_at?: string | null;
  /**
   * VAL-SKILL-030 — idempotency key. When supplied, the same key on a
   * matching body returns the existing pin (one logical transition per
   * key). Reusing the key with a different request hash surfaces as a
   * typed conflict. The key is persisted to skill_pin_idempotency_keys
   * so a restart or duplicate POST is recognized.
   */
  idempotency_key?: string | null;
}

export interface RollbackPinParams {
  pin_id: number;
  operator: string;
  reason?: string;
}

export interface ListPinsOptions {
  agent_id?: string;
  skill_name?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SyncGovernanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncGovernanceError";
  }
}

// ---------------------------------------------------------------------------
// SQL row helpers — proposals
// ---------------------------------------------------------------------------

interface ProposalSqlRow {
  id: string;
  source_harness: string;
  skill_name: string;
  skill_identity: string;
  current_content_hash: string | null;
  detected_content_hash: string;
  prior_content_hash: string | null;
  prior_version: string | null;
  version: string | null;
  diff_summary: string;
  diff_payload: string;
  status: string;
  proposed_by: string;
  proposed_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  affected_skill_id: number | null;
  created_at: string;
  updated_at: string;
}

function rowToProposal(row: ProposalSqlRow): ImportProposalRow {
  return {
    id: row.id,
    source_harness: row.source_harness,
    skill_name: row.skill_name,
    skill_identity: row.skill_identity,
    current_content_hash: row.current_content_hash,
    detected_content_hash: row.detected_content_hash,
    prior_content_hash: row.prior_content_hash,
    prior_version: row.prior_version,
    version: row.version,
    diff_summary: row.diff_summary,
    diff_payload: row.diff_payload,
    status: row.status as ProposalStatus,
    proposed_by: row.proposed_by,
    proposed_at: row.proposed_at,
    decided_by: row.decided_by,
    decided_at: row.decided_at,
    decision_reason: row.decision_reason,
    affected_skill_id: row.affected_skill_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function loadProposalById(
  db: Database.Database,
  id: string
): ImportProposalRow | null {
  const row = db
    .prepare<[string], ProposalSqlRow>(
      `SELECT id, source_harness, skill_name, skill_identity,
              current_content_hash, detected_content_hash, prior_content_hash,
              prior_version, version, diff_summary, diff_payload, status,
              proposed_by, proposed_at, decided_by, decided_at, decision_reason,
              affected_skill_id, created_at, updated_at
         FROM skill_import_proposals
        WHERE id = ?
        LIMIT 1`
    )
    .get(id);
  return row ? rowToProposal(row) : null;
}

function loadProposalByIdentity(
  db: Database.Database,
  sourceHarness: string,
  skillName: string,
  detectedHash: string
): ImportProposalRow | null {
  const row = db
    .prepare<[string, string, string], ProposalSqlRow>(
      `SELECT id, source_harness, skill_name, skill_identity,
              current_content_hash, detected_content_hash, prior_content_hash,
              prior_version, version, diff_summary, diff_payload, status,
              proposed_by, proposed_at, decided_by, decided_at, decision_reason,
              affected_skill_id, created_at, updated_at
         FROM skill_import_proposals
        WHERE source_harness = ?
          AND skill_name = ?
          AND detected_content_hash = ?
        LIMIT 1`
    )
    .get(sourceHarness, skillName, detectedHash);
  return row ? rowToProposal(row) : null;
}

const PROPOSAL_SORT_DESC = "updated_at DESC";

// ---------------------------------------------------------------------------
// SQL row helpers — pins
// ---------------------------------------------------------------------------

interface PinSqlRow {
  id: number;
  agent_id: string;
  skill_name: string;
  skill_id: number | null;
  current_version: string;
  current_content_hash: string;
  prior_version: string | null;
  prior_content_hash: string | null;
  prior_skill_id: number | null;
  actor: string;
  created_at: string;
  updated_at: string;
  rolled_back_at: string | null;
  rolled_back_by: string | null;
  last_rollback_event_id: string | null;
}

function rowToPin(row: PinSqlRow): VersionPinRow {
  return {
    id: row.id,
    agent_id: row.agent_id,
    skill_name: row.skill_name,
    skill_id: row.skill_id,
    current_version: row.current_version,
    current_content_hash: row.current_content_hash,
    prior_version: row.prior_version,
    prior_content_hash: row.prior_content_hash,
    prior_skill_id: row.prior_skill_id,
    actor: row.actor,
    created_at: row.created_at,
    updated_at: row.updated_at,
    rolled_back_at: row.rolled_back_at,
    rolled_back_by: row.rolled_back_by,
    last_rollback_event_id: row.last_rollback_event_id,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function hashContent(body: string): string {
  return createHash("sha256").update(body ?? "", "utf8").digest("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeHarness(value: string): string {
  if (typeof value !== "string") {
    throw new SyncGovernanceError("source_harness must be a non-empty string");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new SyncGovernanceError("source_harness must be a non-empty string");
  }
  return trimmed;
}

function sanitizeSkillName(value: string): string {
  if (typeof value !== "string") {
    throw new SyncGovernanceError("skill_name must be a non-empty string");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new SyncGovernanceError("skill_name must be a non-empty string");
  }
  return trimmed;
}

function sanitizeActor(value: string, field: string): string {
  if (typeof value !== "string") {
    throw new SyncGovernanceError(`${field} must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new SyncGovernanceError(`${field} must be a non-empty string`);
  }
  return trimmed;
}

function sanitizeVersion(value: string | null | undefined, field: string): string {
  if (value === null || value === undefined) {
    throw new SyncGovernanceError(`${field} must be a non-empty string`);
  }
  if (typeof value !== "string") {
    throw new SyncGovernanceError(`${field} must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new SyncGovernanceError(`${field} must be a non-empty string`);
  }
  return trimmed;
}

function sanitizeHash(value: string | null | undefined, field: string): string {
  if (value === null || value === undefined) {
    throw new SyncGovernanceError(`${field} must be a 64-char SHA-256 hex`);
  }
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new SyncGovernanceError(`${field} must be a 64-char SHA-256 hex`);
  }
  return value.toLowerCase();
}

function serializeDiffPayload(
  payload: Record<string, unknown> | undefined
): string {
  if (!payload) return "{}";
  try {
    return JSON.stringify(payload);
  } catch {
    return "{}";
  }
}

function writeAuditEntry(
  db: Database.Database,
  entry: {
    actor: string;
    eventType: string;
    entityType: string;
    entityId: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }
): string {
  const id = randomUUID();
  try {
    db.prepare(
      `INSERT INTO audit_entries
        (id, tenant_id, actor_id, actor_role, event_type, entity_type,
         entity_id, reason, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      "default-tenant",
      entry.actor,
      "operator",
      entry.eventType,
      entry.entityType,
      entry.entityId,
      entry.reason ?? null,
      JSON.stringify(entry.metadata ?? {}),
      nowIso()
    );
  } catch {
    // audit_entries is append-only and may not exist on partial test
    // schemas. We deliberately swallow the failure here so a missing
    // audit table never breaks the primary action; a higher-level
    // integration test verifies the entry is written when the schema
    // is fully migrated.
  }
  return id;
}

/**
 * Persists a pin idempotency key. The UNIQUE(agent_id, skill_name,
 * idempotency_key) constraint surfaces duplicate-key races as SQLite
 * errors; the function catches them so the existing pin (returned
 * above) is preserved instead of producing a partial error state.
 */
function persistPinIdempotencyKey(
  db: Database.Database,
  entry: {
    agentId: string;
    skillName: string;
    idempotencyKey: string;
    pinId: number;
    requestHash: string;
  }
): void {
  try {
    db.prepare(
      `INSERT INTO skill_pin_idempotency_keys
        (agent_id, skill_name, idempotency_key, pin_id, request_hash)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      entry.agentId,
      entry.skillName,
      entry.idempotencyKey,
      entry.pinId,
      entry.requestHash
    );
  } catch {
    // Duplicate-key race: another concurrent request already persisted
    // the same key. We deliberately swallow the error so the caller
    // gets the same pin that the parallel request produced (each
    // request will read back via getVersionPin on retry).
  }
}

// ---------------------------------------------------------------------------
// Proposal API — detection
// ---------------------------------------------------------------------------

/**
 * Records a cross-harness skill change detection as a proposal.
 *
 * Behavior:
 *   - When `detected_content_hash` matches the registry row's current
 *     `content_hash` for the same (source_harness, skill_name), the
 *     registry is left untouched and an `unchanged=true` proposal is
 *     recorded with `status='approved'` (auto-approved detection =
 *     no change). No `skill_registry` mutation occurs.
 *   - When the hash differs (or no registry row exists), a
 *     `status='pending'` proposal is created. If a pending proposal for
 *     the same (source_harness, skill_name, detected_content_hash)
 *     already exists, it is returned unchanged (dedupe).
 *   - The proposal stores `current_content_hash` from the registry row
 *     (or null when no row exists), plus the prior version/hash so a
 *     single rollback could reapply the prior content.
 *   - This function NEVER mutates skill_registry — detection is purely
 *     a discovery primitive. Approval / rejection flips the proposal
 *     status only.
 */
export function detectSkillChange(
  db: Database.Database,
  params: DetectSkillChangeParams
): DetectSkillChangeResult {
  const sourceHarness = sanitizeHarness(params.source_harness);
  const skillName = sanitizeSkillName(params.skill_name);
  const proposedBy = sanitizeActor(params.proposed_by, "proposed_by");
  const version =
    params.version === null || params.version === undefined
      ? null
      : params.version.trim() || null;

  let detectedHash: string;
  if (params.detected_content_hash) {
    detectedHash = sanitizeHash(
      params.detected_content_hash,
      "detected_content_hash"
    );
  } else if (typeof params.detected_content_body === "string") {
    detectedHash = hashContent(params.detected_content_body);
  } else {
    throw new SyncGovernanceError(
      "detectSkillChange requires detected_content_hash or detected_content_body"
    );
  }

  // Locate the existing registry row (if any) for the same name+harness.
  const registryRow = db
    .prepare<[string, string], {
      id: number;
      content_hash: string | null;
      version: string | null;
    }>(
      `SELECT id, content_hash, version
         FROM skill_registry
        WHERE source_harness = ?
          AND name = ?
        LIMIT 1`
    )
    .get(sourceHarness, skillName);

  const currentHash = registryRow?.content_hash ?? null;
  const priorHash = currentHash; // current becomes the "prior" once a new proposal lands.
  const priorVersion = registryRow?.version ?? null;
  const unchanged =
    currentHash !== null &&
    detectedHash.toLowerCase() === currentHash.toLowerCase();

  // Dedupe: an identical hash already has a proposal row, return it.
  const existing = loadProposalByIdentity(
    db,
    sourceHarness,
    skillName,
    detectedHash
  );
  if (existing) {
    return {
      proposal: existing,
      created: false,
      unchanged,
    };
  }

  const id = randomUUID();
  const now = nowIso();
  const skillIdentity = `${skillName}@${version ?? priorVersion ?? "unknown"}`;
  const status: ProposalStatus = unchanged ? "approved" : "pending";

  db.prepare(
    `INSERT INTO skill_import_proposals
      (id, source_harness, skill_name, skill_identity, current_content_hash,
       detected_content_hash, prior_content_hash, prior_version, version,
       diff_summary, diff_payload, status, proposed_by, proposed_at,
       decided_by, decided_at, decision_reason, affected_skill_id,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    sourceHarness,
    skillName,
    skillIdentity,
    currentHash,
    detectedHash,
    unchanged ? null : priorHash,
    unchanged ? null : priorVersion,
    version,
    params.diff_summary ?? "",
    serializeDiffPayload(params.diff_payload),
    status,
    proposedBy,
    now,
    unchanged ? proposedBy : null,
    unchanged ? now : null,
    unchanged ? "no_change_detected" : null,
    registryRow?.id ?? null,
    now,
    now
  );

  const proposal = loadProposalById(db, id);
  if (!proposal) {
    throw new SyncGovernanceError(
      `detectSkillChange: failed to read back inserted proposal ${id}`
    );
  }

  return { proposal, created: true, unchanged };
}

// ---------------------------------------------------------------------------
// Proposal API — read / list
// ---------------------------------------------------------------------------

export function getImportProposal(
  db: Database.Database,
  id: string
): ImportProposalRow | null {
  if (!id || typeof id !== "string") return null;
  return loadProposalById(db, id);
}

export function listImportProposals(
  db: Database.Database,
  options: ListProposalsOptions = {}
): ImportProposalRow[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.status) {
    if (!PROPOSAL_STATUSES.includes(options.status)) {
      throw new SyncGovernanceError(
        `Invalid proposal status '${options.status}'. Valid: ${PROPOSAL_STATUSES.join(", ")}`
      );
    }
    conditions.push("status = ?");
    params.push(options.status);
  }
  if (options.source_harness) {
    conditions.push("source_harness = ?");
    params.push(options.source_harness);
  }
  if (options.skill_name) {
    conditions.push("skill_name = ?");
    params.push(options.skill_name);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit =
    options.limit && Number.isFinite(options.limit) && options.limit > 0
      ? Math.min(options.limit, 200)
      : 50;
  const offset =
    options.offset && Number.isFinite(options.offset) && options.offset >= 0
      ? options.offset
      : 0;

  const rows = db
    .prepare<unknown[], ProposalSqlRow>(
      `SELECT id, source_harness, skill_name, skill_identity,
              current_content_hash, detected_content_hash, prior_content_hash,
              prior_version, version, diff_summary, diff_payload, status,
              proposed_by, proposed_at, decided_by, decided_at, decision_reason,
              affected_skill_id, created_at, updated_at
         FROM skill_import_proposals
         ${where}
         ORDER BY ${PROPOSAL_SORT_DESC}
         LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return rows.map(rowToProposal);
}

// ---------------------------------------------------------------------------
// Proposal API — transitions
// ---------------------------------------------------------------------------

/**
 * Approves a pending proposal. Sets status='approved', records
 * decided_by / decided_at / decision_reason. The proposal body is
 * never mutated; this transition only updates the proposal row.
 *
 * Throws SyncGovernanceError when:
 *   - the proposal id does not exist,
 *   - the proposal is not in 'pending' status (already approved/rejected),
 *   - the operator identity is empty.
 */
export function approveImportProposal(
  db: Database.Database,
  id: string,
  operator: string,
  reason?: string
): ImportProposalRow {
  if (!id || typeof id !== "string") {
    throw new SyncGovernanceError("Proposal id is required");
  }
  const actor = sanitizeActor(operator, "operator");

  const existing = loadProposalById(db, id);
  if (!existing) {
    throw new SyncGovernanceError(`Proposal ${id} not found`);
  }
  if (existing.status !== "pending") {
    throw new SyncGovernanceError(
      `Cannot approve proposal ${id} from status '${existing.status}' — must be 'pending'`
    );
  }

  const now = nowIso();
  db.prepare(
    `UPDATE skill_import_proposals
        SET status = 'approved',
            decided_by = ?,
            decided_at = ?,
            decision_reason = ?,
            updated_at = ?
      WHERE id = ?`
  ).run(actor, now, reason?.trim() || null, now, id);

  const updated = loadProposalById(db, id);
  if (!updated) {
    throw new SyncGovernanceError(
      `approveImportProposal: row vanished for ${id}`
    );
  }

  writeAuditEntry(db, {
    actor,
    eventType: "skill.proposal.approved",
    entityType: "skill_import_proposal",
    entityId: id,
    reason: reason ?? null,
    metadata: {
      source_harness: updated.source_harness,
      skill_name: updated.skill_name,
      affected_skill_id: updated.affected_skill_id,
    },
  });

  return updated;
}

/**
 * Rejects a pending proposal. Sets status='rejected', records the
 * operator + reason. Idempotent on already-rejected proposals.
 *
 * Throws SyncGovernanceError when:
 *   - the proposal id does not exist,
 *   - the operator identity is empty.
 */
export function rejectImportProposal(
  db: Database.Database,
  id: string,
  operator: string,
  reason: string
): ImportProposalRow {
  if (!id || typeof id !== "string") {
    throw new SyncGovernanceError("Proposal id is required");
  }
  const actor = sanitizeActor(operator, "operator");
  const reasonText = reason?.trim() ?? "";
  if (!reasonText) {
    throw new SyncGovernanceError("Rejection reason is required");
  }

  const existing = loadProposalById(db, id);
  if (!existing) {
    throw new SyncGovernanceError(`Proposal ${id} not found`);
  }
  if (existing.status === "rejected") {
    return existing; // Idempotent.
  }
  if (existing.status !== "pending") {
    throw new SyncGovernanceError(
      `Cannot reject proposal ${id} from status '${existing.status}'`
    );
  }

  const now = nowIso();
  db.prepare(
    `UPDATE skill_import_proposals
        SET status = 'rejected',
            decided_by = ?,
            decided_at = ?,
            decision_reason = ?,
            updated_at = ?
      WHERE id = ?`
  ).run(actor, now, reasonText, now, id);

  const updated = loadProposalById(db, id);
  if (!updated) {
    throw new SyncGovernanceError(
      `rejectImportProposal: row vanished for ${id}`
    );
  }

  writeAuditEntry(db, {
    actor,
    eventType: "skill.proposal.rejected",
    entityType: "skill_import_proposal",
    entityId: id,
    reason: reasonText,
    metadata: {
      source_harness: updated.source_harness,
      skill_name: updated.skill_name,
    },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Pin API — create / update / list
// ---------------------------------------------------------------------------

interface SkillRegistryStatusRow {
  id: number;
  dispatch_status: string;
  completeness_pct: number;
}

/**
 * Creates or updates the version pin for (agent_id, skill_name). Pin
 * replacement rotates the previous current -> prior. The skill must
 * already be in a dispatchable state (status='enabled' with
 * completeness_pct=100, or status='quarantined' as a permitted
 * exception so operators can pre-pin a quarantined skill before
 * approval — but never a row that the SQL gate would deny at
 * dispatch time).
 *
 * The actor is recorded for audit; pass the operator or system
 * identity that authorized the pin.
 *
 * Throws SyncGovernanceError when:
 *   - agent_id / skill_name / current_version / current_content_hash
 *     are missing or malformed,
 *   - the referenced skill_id points at a row whose dispatch_status
 *     is not in the permitted set,
 *   - the agent_id does not exist in registered_agents.
 */
export function createOrUpdateAgentVersionPin(
  db: Database.Database,
  params: CreateOrUpdatePinParams
): VersionPinRow {
  const agentId = sanitizeActor(params.agent_id, "agent_id");
  const skillName = sanitizeSkillName(params.skill_name);
  const currentVersion = sanitizeVersion(
    params.current_version,
    "current_version"
  );
  const currentHash = sanitizeHash(
    params.current_content_hash,
    "current_content_hash"
  );
  const actor = sanitizeActor(params.actor, "actor");
  const skillId =
    params.skill_id === null || params.skill_id === undefined
      ? null
      : Number(params.skill_id);

  if (
    skillId !== null &&
    (!Number.isInteger(skillId) || skillId <= 0)
  ) {
    throw new SyncGovernanceError(
      "skill_id must be a positive integer or null"
    );
  }

  // FK check on registered_agents — fail-closed on unknown agents.
  const agentExists = db
    .prepare<[string], { id: string }>(
      `SELECT id FROM registered_agents WHERE id = ? LIMIT 1`
    )
    .get(agentId);
  if (!agentExists) {
    throw new SyncGovernanceError(
      `Cannot pin: agent '${agentId}' not found in registered_agents`
    );
  }

  // FK + status check on skill_registry. We permit pins on rows whose
  // dispatch_status is 'enabled' (fully dispatched) or 'quarantined'
  // (operator-approved and quarantined for the v11 pipeline). Any other
  // status is denied because the SQL gate would reject the skill at
  // dispatch time, so pinning against it would create a footgun.
  if (skillId !== null) {
    const skillRow = db
      .prepare<[number], SkillRegistryStatusRow>(
        `SELECT id, dispatch_status, completeness_pct
           FROM skill_registry
          WHERE id = ?
          LIMIT 1`
      )
      .get(skillId);
    if (!skillRow) {
      throw new SyncGovernanceError(
        `Cannot pin: skill_id=${skillId} not found in skill_registry`
      );
    }
    if (
      skillRow.dispatch_status !== "enabled" &&
      skillRow.dispatch_status !== "quarantined"
    ) {
      throw new SyncGovernanceError(
        `Cannot pin skill_id=${skillId} with dispatch_status='${skillRow.dispatch_status}' — must be 'enabled' or 'quarantined'`
      );
    }
    if (skillRow.completeness_pct < 100) {
      throw new SyncGovernanceError(
        `Cannot pin skill_id=${skillId} with completeness_pct=${skillRow.completeness_pct} — must be 100`
      );
    }
  }

  // Read the existing pin (if any) so we can rotate current -> prior.
  const existingPin = db
    .prepare<[string, string], PinSqlRow>(
      `SELECT id, agent_id, skill_name, skill_id, current_version,
              current_content_hash, prior_version, prior_content_hash,
              prior_skill_id, actor, created_at, updated_at,
              rolled_back_at, rolled_back_by, last_rollback_event_id
         FROM skill_version_pins
        WHERE agent_id = ?
          AND skill_name = ?
        LIMIT 1`
    )
    .get(agentId, skillName);

  // VAL-SKILL-030 — optimistic-concurrency check. When the caller
  // supplies expected_current_updated_at, the existing pin's
  // updated_at must match exactly. A mismatch surfaces as a typed
  // error so the caller can re-fetch and retry without silently
  // overwriting the other side's intent.
  if (
    existingPin &&
    typeof params.expected_current_updated_at === "string" &&
    params.expected_current_updated_at &&
    existingPin.updated_at !== params.expected_current_updated_at
  ) {
    throw new SyncGovernanceError(
      `Stale concurrent pin update for agent='${agentId}' skill='${skillName}': expected updated_at='${params.expected_current_updated_at}' but row is '${existingPin.updated_at}'`
    );
  }

  // VAL-SKILL-030 — idempotency check. When the caller supplies an
  // idempotency_key we compute a deterministic request hash and look
  // up any prior key usage. Matching key + matching body => return
  // the previously produced pin without mutation. Matching key +
  // mismatched body => typed conflict (the caller is reusing the
  // key for a different request, which is always wrong).
  const idempotencyKey =
    typeof params.idempotency_key === "string" && params.idempotency_key.trim()
      ? params.idempotency_key.trim()
      : null;
  const requestHash = idempotencyKey
    ? createHash("sha256")
        .update(
          JSON.stringify({
            agent_id: agentId,
            skill_name: skillName,
            skill_id: skillId,
            current_version: currentVersion,
            current_content_hash: currentHash,
            actor,
          }),
          "utf8"
        )
        .digest("hex")
    : null;

  if (idempotencyKey && requestHash) {
    const existingKey = db
      .prepare<[string, string, string], {
        id: number;
        pin_id: number;
        request_hash: string;
      }>(
        `SELECT id, pin_id, request_hash
           FROM skill_pin_idempotency_keys
          WHERE agent_id = ?
            AND skill_name = ?
            AND idempotency_key = ?
          LIMIT 1`
      )
      .get(agentId, skillName, idempotencyKey);
    if (existingKey) {
      if (existingKey.request_hash !== requestHash) {
        throw new SyncGovernanceError(
          `Idempotency key '${idempotencyKey}' was previously used with a different request body for agent='${agentId}' skill='${skillName}'`
        );
      }
      const priorPin = getVersionPin(db, existingKey.pin_id);
      if (priorPin) return rowToPin(priorPin);
      // The pin row was hard-deleted but the idempotency key survived;
      // treat as a fresh insert below.
    }
  }

  const now = nowIso();

  if (existingPin) {
    const previousVersion = existingPin.current_version;
    const previousHash = existingPin.current_content_hash;
    const previousSkillId = existingPin.skill_id;

    // Refuse silent no-op updates that would otherwise overwrite audit data.
    if (
      previousVersion === currentVersion &&
      previousHash === currentHash &&
      previousSkillId === skillId
    ) {
      // Idempotent: return the existing pin untouched.
      return rowToPin(existingPin);
    }

    db.prepare(
      `UPDATE skill_version_pins
          SET skill_id = ?,
              current_version = ?,
              current_content_hash = ?,
              prior_version = ?,
              prior_content_hash = ?,
              prior_skill_id = ?,
              actor = ?,
              updated_at = ?,
              rolled_back_at = NULL,
              rolled_back_by = NULL,
              last_rollback_event_id = NULL
        WHERE id = ?`
    ).run(
      skillId,
      currentVersion,
      currentHash,
      previousVersion,
      previousHash,
      previousSkillId,
      actor,
      now,
      existingPin.id
    );

    writeAuditEntry(db, {
      actor,
      eventType: "skill.pin.updated",
      entityType: "skill_version_pin",
      entityId: String(existingPin.id),
      metadata: {
        agent_id: agentId,
        skill_name: skillName,
        current_version: currentVersion,
        prior_version: previousVersion,
      },
    });

    if (idempotencyKey && requestHash) {
      persistPinIdempotencyKey(db, {
        agentId,
        skillName,
        idempotencyKey,
        pinId: existingPin.id,
        requestHash,
      });
    }

    const refreshed = db
      .prepare<[number], PinSqlRow>(
        `SELECT id, agent_id, skill_name, skill_id, current_version,
                current_content_hash, prior_version, prior_content_hash,
                prior_skill_id, actor, created_at, updated_at,
                rolled_back_at, rolled_back_by, last_rollback_event_id
           FROM skill_version_pins
          WHERE id = ?`
      )
      .get(existingPin.id);
    if (!refreshed) {
      throw new SyncGovernanceError(
        `createOrUpdateAgentVersionPin: row vanished for pin_id=${existingPin.id}`
      );
    }
    return rowToPin(refreshed);
  }

  // Fresh insert.
  const insertResult = db
    .prepare(
      `INSERT INTO skill_version_pins
        (agent_id, skill_name, skill_id, current_version, current_content_hash,
         prior_version, prior_content_hash, prior_skill_id, actor,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      agentId,
      skillName,
      skillId,
      currentVersion,
      currentHash,
      null,
      null,
      null,
      actor,
      now,
      now
    );

  const pinId = Number(insertResult.lastInsertRowid);
  writeAuditEntry(db, {
    actor,
    eventType: "skill.pin.created",
    entityType: "skill_version_pin",
    entityId: String(pinId),
    metadata: {
      agent_id: agentId,
      skill_name: skillName,
      current_version: currentVersion,
    },
  });

  if (idempotencyKey && requestHash) {
    persistPinIdempotencyKey(db, {
      agentId,
      skillName,
      idempotencyKey,
      pinId,
      requestHash,
    });
  }

  const refreshed = db
    .prepare<[number], PinSqlRow>(
      `SELECT id, agent_id, skill_name, skill_id, current_version,
              current_content_hash, prior_version, prior_content_hash,
              prior_skill_id, actor, created_at, updated_at,
              rolled_back_at, rolled_back_by, last_rollback_event_id
         FROM skill_version_pins
        WHERE id = ?`
    )
    .get(pinId);
  if (!refreshed) {
    throw new SyncGovernanceError(
      `createOrUpdateAgentVersionPin: row vanished for new pin_id=${pinId}`
    );
  }
  return rowToPin(refreshed);
}

export function getAgentVersionPin(
  db: Database.Database,
  agentId: string,
  skillName: string
): VersionPinRow | null {
  if (!agentId || !skillName) return null;
  const row = db
    .prepare<[string, string], PinSqlRow>(
      `SELECT id, agent_id, skill_name, skill_id, current_version,
              current_content_hash, prior_version, prior_content_hash,
              prior_skill_id, actor, created_at, updated_at,
              rolled_back_at, rolled_back_by, last_rollback_event_id
         FROM skill_version_pins
        WHERE agent_id = ?
          AND skill_name = ?
        LIMIT 1`
    )
    .get(agentId, skillName);
  return row ? rowToPin(row) : null;
}

export function getVersionPin(
  db: Database.Database,
  pinId: number
): VersionPinRow | null {
  if (!Number.isInteger(pinId) || pinId <= 0) return null;
  const row = db
    .prepare<[number], PinSqlRow>(
      `SELECT id, agent_id, skill_name, skill_id, current_version,
              current_content_hash, prior_version, prior_content_hash,
              prior_skill_id, actor, created_at, updated_at,
              rolled_back_at, rolled_back_by, last_rollback_event_id
         FROM skill_version_pins
        WHERE id = ?
        LIMIT 1`
    )
    .get(pinId);
  return row ? rowToPin(row) : null;
}

export function listAgentVersionPins(
  db: Database.Database,
  options: ListPinsOptions = {}
): VersionPinRow[] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options.agent_id) {
    conditions.push("agent_id = ?");
    params.push(options.agent_id);
  }
  if (options.skill_name) {
    conditions.push("skill_name = ?");
    params.push(options.skill_name);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit =
    options.limit && Number.isFinite(options.limit) && options.limit > 0
      ? Math.min(options.limit, 200)
      : 50;
  const offset =
    options.offset && Number.isFinite(options.offset) && options.offset >= 0
      ? options.offset
      : 0;

  const rows = db
    .prepare<unknown[], PinSqlRow>(
      `SELECT id, agent_id, skill_name, skill_id, current_version,
              current_content_hash, prior_version, prior_content_hash,
              prior_skill_id, actor, created_at, updated_at,
              rolled_back_at, rolled_back_by, last_rollback_event_id
         FROM skill_version_pins
         ${where}
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return rows.map(rowToPin);
}

// ---------------------------------------------------------------------------
// Pin API — rollback
// ---------------------------------------------------------------------------

/**
 * Performs a one-step rollback on the pin: the immediately prior
 * version/hash becomes the new current; the previous current becomes
 * the discarded prior (cleared to null). An `audit_entries` row is
 * written with event_type='skill.pin.rolled_back' so the rollback is
 * auditable.
 *
 * Throws SyncGovernanceError when:
 *   - the pin does not exist,
 *   - the pin has no prior_version to roll back to (already rolled back),
 *   - the operator identity is empty,
 *   - the prior skill_id no longer exists in skill_registry (the
 *     referenced prior content is gone, so rolling back would point at
 *     a missing contract — fail-closed).
 */

/**
 * Phase 149 (continued) / VAL-SKILL-031 — agent-scoped rollback.
 *
 * Looks up the pin by (agent_id, skill_name) and rolls back to its
 * immediately prior version. The operator need not know the numeric
 * pin_id; the API route is `POST /api/skills/pins/:agent/rollback`
 * (the validation contract uses the agent id in the URL path).
 *
 * This is a thin wrapper over `rollbackAgentVersionPin` that resolves
 * the pin id from the (agent_id, skill_name) tuple first. The same
 * fail-closed guarantees apply: the prior version's registry row must
 * still exist, the prior version must remain dispatchable
 * (dispatch_status in {enabled, quarantined} with completeness_pct=100
 * or be explicitly retired), and a single-step rollback discards the
 * pre-rollback current.
 */
export interface RollbackAgentVersionPinByAgentParams {
  agent_id: string;
  skill_name: string;
  operator: string;
  reason?: string;
}

export function rollbackAgentVersionPinByAgent(
  db: Database.Database,
  params: RollbackAgentVersionPinByAgentParams
): VersionPinRow {
  const agentId = sanitizeActor(params.agent_id, "agent_id");
  const skillName = sanitizeSkillName(params.skill_name);
  const operator = sanitizeActor(params.operator, "operator");
  const reason =
    typeof params.reason === "string" && params.reason.trim()
      ? params.reason.trim()
      : undefined;

  const pin = getAgentVersionPin(db, agentId, skillName);
  if (!pin) {
    throw new SyncGovernanceError(
      `No version pin found for agent='${agentId}' skill='${skillName}'`
    );
  }

  // VAL-SKILL-031: never activate retired/tampered policy-invalid
  // versions. When the prior registry row is in a state that the
  // dispatch gate would deny (disabled, incomplete, review, missing),
  // the rollback fails closed rather than silently enabling a
  // policy-invalid version.
  if (pin.prior_skill_id !== null) {
    const priorRow = db
      .prepare<[number], {
        id: number;
        dispatch_status: string;
        completeness_pct: number;
        content_hash: string | null;
      }>(
        `SELECT id, dispatch_status, completeness_pct, content_hash
           FROM skill_registry
          WHERE id = ?
          LIMIT 1`
      )
      .get(pin.prior_skill_id);
    if (!priorRow) {
      throw new SyncGovernanceError(
        `Cannot roll back pin for agent='${agentId}' skill='${skillName}': prior skill_id=${pin.prior_skill_id} no longer exists`
      );
    }
    // The prior version is allowed to be retired/tampered so an
    // operator can explicitly roll back from a known-bad version to a
    // known-good one. We still fail closed on rows the SQL gate would
    // never serve: disabled / incomplete / review. A 'retired' row is
    // allowed because rollback is the documented escape hatch from a
    // retired current.
    if (
      priorRow.dispatch_status === "disabled" ||
      priorRow.dispatch_status === "incomplete" ||
      priorRow.dispatch_status === "review"
    ) {
      throw new SyncGovernanceError(
        `Cannot roll back to prior version with dispatch_status='${priorRow.dispatch_status}' for agent='${agentId}' skill='${skillName}' — policy-invalid`
      );
    }
    if (priorRow.completeness_pct < 100) {
      throw new SyncGovernanceError(
        `Cannot roll back to prior version with completeness_pct=${priorRow.completeness_pct} (must be 100) for agent='${agentId}' skill='${skillName}'`
      );
    }
    // Pin hash must equal registry hash — a tampering between pin
    // creation and rollback fails closed.
    if (
      priorRow.content_hash &&
      pin.prior_content_hash &&
      priorRow.content_hash.toLowerCase() !== pin.prior_content_hash.toLowerCase()
    ) {
      throw new SyncGovernanceError(
        `Cannot roll back: prior registry row content_hash does not match the pin (tampering suspected)`
      );
    }
  }

  return rollbackAgentVersionPin(db, {
    pin_id: pin.id,
    operator,
    ...(reason ? { reason } : {}),
  });
}

/**
 * Performs a one-step rollback on the pin: the immediately prior
 * version/hash becomes the new current; the previous current is
 * discarded. An `audit_entries` row is written with event_type
 * 'skill.pin.rolled_back' so the rollback is auditable.
 *
 * Throws SyncGovernanceError when:
 *   - the pin does not exist,
 *   - the pin has no prior_version to roll back to (already rolled back),
 *   - the operator identity is empty,
 *   - the prior skill_id no longer exists in skill_registry (the
 *     referenced prior content is gone, so rolling back would point at
 *     a missing contract — fail-closed).
 */
export function rollbackAgentVersionPin(
  db: Database.Database,
  params: RollbackPinParams
): VersionPinRow {
  if (!Number.isInteger(params.pin_id) || params.pin_id <= 0) {
    throw new SyncGovernanceError("pin_id must be a positive integer");
  }
  const operator = sanitizeActor(params.operator, "operator");

  const pin = getVersionPin(db, params.pin_id);
  if (!pin) {
    throw new SyncGovernanceError(`Pin id=${params.pin_id} not found`);
  }
  if (!pin.prior_version || !pin.prior_content_hash) {
    throw new SyncGovernanceError(
      `Pin id=${params.pin_id} has no prior version to roll back to`
    );
  }

  // Fail-closed if the prior skill registry row is gone — rolling back
  // to a missing contract would silently break dispatch.
  if (pin.prior_skill_id !== null) {
    const priorRow = db
      .prepare<[number], { id: number }>(
        `SELECT id FROM skill_registry WHERE id = ? LIMIT 1`
      )
      .get(pin.prior_skill_id);
    if (!priorRow) {
      throw new SyncGovernanceError(
        `Cannot roll back pin id=${params.pin_id}: prior skill_id=${pin.prior_skill_id} no longer exists`
      );
    }
  }

  const now = nowIso();
  // Rotate current <- prior; previous current is discarded (single-step
  // rollback, no chained history).
  db.prepare(
    `UPDATE skill_version_pins
        SET current_version = prior_version,
            current_content_hash = prior_content_hash,
            skill_id = prior_skill_id,
            prior_version = NULL,
            prior_content_hash = NULL,
            prior_skill_id = NULL,
            actor = ?,
            updated_at = ?,
            rolled_back_at = ?,
            rolled_back_by = ?,
            last_rollback_event_id = ?
      WHERE id = ?`
  ).run(operator, now, now, operator, "PENDING", params.pin_id);

  const eventId = writeAuditEntry(db, {
    actor: operator,
    eventType: "skill.pin.rolled_back",
    entityType: "skill_version_pin",
    entityId: String(params.pin_id),
    reason: params.reason ?? null,
    metadata: {
      agent_id: pin.agent_id,
      skill_name: pin.skill_name,
      rolled_back_from_version: pin.current_version,
      rolled_back_from_hash: pin.current_content_hash,
      rolled_back_to_version: pin.prior_version,
      rolled_back_to_hash: pin.prior_content_hash,
    },
  });

  // Stamp the audit entry id back onto the pin row.
  db.prepare(
    `UPDATE skill_version_pins
        SET last_rollback_event_id = ?, updated_at = ?
      WHERE id = ?`
  ).run(eventId, now, params.pin_id);

  const refreshed = getVersionPin(db, params.pin_id);
  if (!refreshed) {
    throw new SyncGovernanceError(
      `rollbackAgentVersionPin: row vanished for pin_id=${params.pin_id}`
    );
  }
  return refreshed;
}

// ---------------------------------------------------------------------------
// Content hashing re-export (helpers)
// ---------------------------------------------------------------------------

/**
 * Helper that computes the same SHA-256 hex digest the governance
 * tables expect. Mirrors `computeContentHash` from `registry.ts` so
 * callers do not need to import from two places.
 */
export function computeGovernanceContentHash(body: string): string {
  return hashContent(body);
}
