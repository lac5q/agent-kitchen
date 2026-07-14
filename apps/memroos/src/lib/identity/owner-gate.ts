/**
 * Phase 131 / TEAMSCALE-06: Owner gates for cross-agent asset access.
 *
 * The owner gate is the explicit, owner-controlled authorization check that
 * sits in front of an asset (e.g. a knowledge entry, a memory item, a skill).
 * A policy decision in the shared engine can be tightened by an owner gate
 * because the owner has final say over who reads / writes their content.
 *
 * Two approval modes are supported:
 *   - standing   : the owner has pre-authorized any agent. Stored with
 *                  agent_id = NULL so the gate matches every requester.
 *   - per_use    : the owner has authorized one specific agent. Stored with
 *                  agent_id = <agentId>. Only that agent passes the gate.
 *
 * Both modes honor `revoked_at`: a row with `revoked_at IS NOT NULL` is
 * inactive. Re-granting creates a new row rather than un-revoking -- this
 * preserves the audit trail and makes "revoked at" a stable fact.
 *
 * Decisions are written to `audit_entries` so the gate trail is reviewable
 * in the same audit panel as policy decisions and HIL escalations.
 */

import crypto from "crypto";
import type Database from "better-sqlite3";

import { writeAuditEntry } from "@/lib/audit/write";

const TENANT_ID = "default-tenant";

export interface OwnerGate {
  assetType: string;
  assetId: string;
  ownerId: string;
  approvalMode: "standing" | "per-use";
}

export interface OwnerGateDecision {
  allowed: boolean;
  reason: string;
  approvalMode: "standing" | "per-use" | "none";
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Decide whether the requesting agent is allowed through the gate for this
 * asset. The check order is:
 *   1. Standing approval: any row with (asset_type, asset_id, mode='standing',
 *      revoked_at IS NULL) matches.
 *   2. Per-use approval: a row with (asset_type, asset_id, mode='per_use',
 *      agent_id = requestingAgentId, revoked_at IS NULL).
 *
 * Returns `allowed=false, approvalMode='none'` if neither row exists. Writes
 * a single audit row per call so the gate decisions are reviewable.
 */
export function checkOwnerGate(
  db: Database.Database,
  input: {
    assetType: string;
    assetId: string;
    requestingAgentId: string;
    ownerId: string;
  }
): OwnerGateDecision {
  if (!input.assetType || !input.assetId) {
    throw new Error("checkOwnerGate: assetType and assetId are required");
  }
  if (!input.requestingAgentId) {
    throw new Error("checkOwnerGate: requestingAgentId is required");
  }
  if (!input.ownerId) {
    throw new Error("checkOwnerGate: ownerId is required");
  }

  const createdAt = nowIso();

  // 1. Standing approval.
  const standing = db
    .prepare(
      `SELECT id FROM owner_gate_approvals
        WHERE owner_id = ?
          AND asset_type = ?
          AND asset_id = ?
          AND approval_mode = 'standing'
          AND revoked_at IS NULL
        LIMIT 1`
    )
    .get(input.ownerId, input.assetType, input.assetId) as
    | { id: number }
    | undefined;

  if (standing) {
    const decision: OwnerGateDecision = {
      allowed: true,
      reason: "owner_gate_standing_approval",
      approvalMode: "standing",
    };
    writeAuditEntry(
      {
        tenant_id: TENANT_ID,
        actor_id: input.requestingAgentId,
        actor_role: "system",
        event_type: "admin.compliance_updated",
        entity_type: "compliance_control",
        entity_id: `user:${input.ownerId}`,
        reason: "owner_gate_allowed_standing",
        metadata_json: {
          asset_type: input.assetType,
          asset_id: input.assetId,
          requesting_agent_id: input.requestingAgentId,
          owner_id: input.ownerId,
          approval_mode: "standing",
          approval_id: standing.id,
          allowed: true,
        },
        created_at: createdAt,
      },
      db
    );
    return decision;
  }

  // 2. Per-use approval.
  const perUse = db
    .prepare(
      `SELECT id FROM owner_gate_approvals
        WHERE owner_id = ?
          AND asset_type = ?
          AND asset_id = ?
          AND approval_mode = 'per_use'
          AND agent_id = ?
          AND revoked_at IS NULL
        LIMIT 1`
    )
    .get(
      input.ownerId,
      input.assetType,
      input.assetId,
      input.requestingAgentId
    ) as { id: number } | undefined;

  if (perUse) {
    const decision: OwnerGateDecision = {
      allowed: true,
      reason: "owner_gate_per_use_approval",
      approvalMode: "per-use",
    };
    writeAuditEntry(
      {
        tenant_id: TENANT_ID,
        actor_id: input.requestingAgentId,
        actor_role: "system",
        event_type: "admin.compliance_updated",
        entity_type: "compliance_control",
        entity_id: `user:${input.ownerId}`,
        reason: "owner_gate_allowed_per_use",
        metadata_json: {
          asset_type: input.assetType,
          asset_id: input.assetId,
          requesting_agent_id: input.requestingAgentId,
          owner_id: input.ownerId,
          approval_mode: "per-use",
          approval_id: perUse.id,
          allowed: true,
        },
        created_at: createdAt,
      },
      db
    );
    return decision;
  }

  // Deny path. Audit row records the negative decision so we have a complete
  // gate trail even when no approval was found.
  writeAuditEntry(
    {
      tenant_id: TENANT_ID,
      actor_id: input.requestingAgentId,
      actor_role: "system",
      event_type: "admin.compliance_updated",
      entity_type: "compliance_control",
      entity_id: `user:${input.ownerId}`,
      reason: "owner_gate_denied",
      metadata_json: {
        asset_type: input.assetType,
        asset_id: input.assetId,
        requesting_agent_id: input.requestingAgentId,
        owner_id: input.ownerId,
        allowed: false,
      },
      created_at: createdAt,
    },
    db
  );

  return {
    allowed: false,
    reason: "owner_gate_no_approval",
    approvalMode: "none",
  };
}

/**
 * Owner grants standing approval for an asset. Idempotent: if a non-revoked
 * standing approval already exists, the call is a no-op (the existing row is
 * returned via a fresh SELECT, but the function returns void).
 */
export function grantStandingApproval(
  db: Database.Database,
  input: {
    ownerId: string;
    assetType: string;
    assetId: string;
  }
): void {
  if (!input.ownerId) throw new Error("grantStandingApproval: ownerId is required");
  if (!input.assetType) throw new Error("grantStandingApproval: assetType is required");
  if (!input.assetId) throw new Error("grantStandingApproval: assetId is required");

  const existing = db
    .prepare(
      `SELECT id FROM owner_gate_approvals
        WHERE owner_id = ?
          AND asset_type = ?
          AND asset_id = ?
          AND approval_mode = 'standing'
          AND revoked_at IS NULL
        LIMIT 1`
    )
    .get(input.ownerId, input.assetType, input.assetId);
  if (existing) return;

  db.prepare(
    `INSERT INTO owner_gate_approvals
       (tenant_id, owner_id, asset_type, asset_id, approval_mode, agent_id, created_at)
     VALUES (?, ?, ?, ?, 'standing', NULL, ?)`
  ).run(TENANT_ID, input.ownerId, input.assetType, input.assetId, nowIso());
}

/**
 * Owner grants per-use approval to a specific agent. Idempotent on the same
 * (owner, asset, agent) tuple when not revoked.
 */
export function grantPerUseApproval(
  db: Database.Database,
  input: {
    ownerId: string;
    assetType: string;
    assetId: string;
    agentId: string;
  }
): void {
  if (!input.ownerId) throw new Error("grantPerUseApproval: ownerId is required");
  if (!input.assetType) throw new Error("grantPerUseApproval: assetType is required");
  if (!input.assetId) throw new Error("grantPerUseApproval: assetId is required");
  if (!input.agentId) throw new Error("grantPerUseApproval: agentId is required");

  const existing = db
    .prepare(
      `SELECT id FROM owner_gate_approvals
        WHERE owner_id = ?
          AND asset_type = ?
          AND asset_id = ?
          AND approval_mode = 'per_use'
          AND agent_id = ?
          AND revoked_at IS NULL
        LIMIT 1`
    )
    .get(input.ownerId, input.assetType, input.assetId, input.agentId);
  if (existing) return;

  db.prepare(
    `INSERT INTO owner_gate_approvals
       (tenant_id, owner_id, asset_type, asset_id, approval_mode, agent_id, created_at)
     VALUES (?, ?, ?, ?, 'per_use', ?, ?)`
  ).run(
    TENANT_ID,
    input.ownerId,
    input.assetType,
    input.assetId,
    input.agentId,
    nowIso()
  );
}

/**
 * Revoke a previously-granted approval. Sets `revoked_at` on every matching
 * non-revoked row. Returns the number of rows affected.
 *
 * Provided for symmetry / tests; production callers should add this hook
 * to the user-facing admin API in a later phase.
 */
export function revokeOwnerGateApproval(
  db: Database.Database,
  input: {
    ownerId: string;
    assetType: string;
    assetId: string;
    approvalMode?: "standing" | "per-use";
    agentId?: string | null;
  }
): number {
  if (!input.ownerId || !input.assetType || !input.assetId) {
    throw new Error("revokeOwnerGateApproval: ownerId, assetType, assetId are required");
  }

  const parts = [
    `owner_id = ?`,
    `asset_type = ?`,
    `asset_id = ?`,
    `revoked_at IS NULL`,
  ];
  const params: Array<string | number> = [
    input.ownerId,
    input.assetType,
    input.assetId,
  ];

  if (input.approvalMode) {
    parts.push(`approval_mode = ?`);
    params.push(input.approvalMode);
  }
  if (input.agentId !== undefined) {
    if (input.agentId === null) {
      parts.push(`agent_id IS NULL`);
    } else {
      parts.push(`agent_id = ?`);
      params.push(input.agentId);
    }
  }

  const now = nowIso();
  const result = db
    .prepare(
      `UPDATE owner_gate_approvals
          SET revoked_at = ?
        WHERE ${parts.join(" AND ")}`
    )
    .run(now, ...params);
  return result.changes;
}

/**
 * Read-only: return every active approval for a (owner, asset) pair.
 * Useful for owner-facing UIs and tests.
 */
export function listOwnerGateApprovals(
  db: Database.Database,
  input: { ownerId: string; assetType: string; assetId: string }
): Array<{
  id: number;
  approvalMode: "standing" | "per-use";
  agentId: string | null;
  createdAt: string;
}> {
  if (!input.ownerId || !input.assetType || !input.assetId) {
    throw new Error("listOwnerGateApprovals: ownerId, assetType, assetId required");
  }
  const rows = db
    .prepare(
      `SELECT id, approval_mode, agent_id, created_at
         FROM owner_gate_approvals
        WHERE owner_id = ?
          AND asset_type = ?
          AND asset_id = ?
          AND revoked_at IS NULL
        ORDER BY created_at ASC, id ASC`
    )
    .all(input.ownerId, input.assetType, input.assetId) as {
    id: number;
    approval_mode: "standing" | "per-use";
    agent_id: string | null;
    created_at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    approvalMode: row.approval_mode,
    agentId: row.agent_id,
    createdAt: row.created_at,
  }));
}

// Suppress unused import warning for crypto (kept for future token generation
// in the same file; explicit discard is unnecessary but explicit):
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _cryptoRef = crypto;