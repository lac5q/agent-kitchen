/**
 * SkillForge Operator Approval — Phase 89
 * Queue management, approval actions, and rollback for skill revision proposals.
 */

import { createHash } from "crypto";
import type Database from "better-sqlite3";
import type { SkillForgeProposal, SkillForgeProposalStatus } from "./types";

export interface ApprovalAction {
  proposalId: string;
  action: "approve" | "reject" | "request_changes" | "rollback";
  operator: string;
  reasoning?: string;
}

export interface ProposalQueue {
  pending: SkillForgeProposal[];
  gated: SkillForgeProposal[];
  approved: SkillForgeProposal[];
  rejected: SkillForgeProposal[];
}

type ProposalRow = {
  id: string;
  seal_proposal_id: string | null;
  source_skill_id: string;
  source_version: string;
  proposed_diff: string;
  status: string;
  edit_hash: string | null;
  train_split_id: string | null;
  validation_split_id: string | null;
  held_out_split_id: string | null;
  baseline_w: number | null;
  validation_w: number | null;
  held_out_w: number | null;
  validation_results: string | null;
  held_out_results: string | null;
  w_delta: number | null;
  evaluator_receipts: string | null;
  typed_edit_ops: string | null;
  rejected_edits: string;
  residual_risks: string;
  created_at: string;
  updated_at: string;
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToProposal(r: ProposalRow): SkillForgeProposal {
  return {
    id: r.id,
    sealProposalId: r.seal_proposal_id,
    sourceSkillId: r.source_skill_id,
    sourceVersion: r.source_version,
    proposedDiff: r.proposed_diff,
    status: r.status as SkillForgeProposalStatus,
    editHash: r.edit_hash,
    trainSplitId: r.train_split_id,
    validationSplitId: r.validation_split_id,
    heldOutSplitId: r.held_out_split_id,
    baselineW: r.baseline_w,
    validationW: r.validation_w,
    heldOutW: r.held_out_w,
    validationResults: parseJson(r.validation_results, null),
    heldOutResults: parseJson(r.held_out_results, null),
    wDelta: r.w_delta,
    evaluatorReceipts: parseJson(r.evaluator_receipts, []),
    typedEditOps: parseJson(r.typed_edit_ops, []),
    rejectedEdits: parseJson(r.rejected_edits, []),
    residualRisks: parseJson(r.residual_risks, []),
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

function ensureTraceabilityColumns(db: Database.Database): void {
  for (const statement of [
    "ALTER TABLE skillforge_proposals ADD COLUMN edit_hash TEXT",
    "ALTER TABLE skillforge_proposals ADD COLUMN validation_split_id TEXT",
    "ALTER TABLE skillforge_proposals ADD COLUMN held_out_split_id TEXT",
    "ALTER TABLE skillforge_proposals ADD COLUMN baseline_w REAL",
    "ALTER TABLE skillforge_proposals ADD COLUMN validation_w REAL",
    "ALTER TABLE skillforge_proposals ADD COLUMN held_out_w REAL",
    "ALTER TABLE skillforge_proposals ADD COLUMN evaluator_receipts TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE skillforge_proposals ADD COLUMN typed_edit_ops TEXT NOT NULL DEFAULT '[]'",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Column already exists.
    }
  }
}

/**
 * List all proposals grouped by status.
 */
export function listProposals(db: Database.Database): ProposalQueue {
  ensureTraceabilityColumns(db);
  const rows = db
    .prepare(
      `SELECT id, seal_proposal_id, source_skill_id, source_version, proposed_diff,
              status, edit_hash, train_split_id, validation_split_id, held_out_split_id,
              baseline_w, validation_w, held_out_w, validation_results, held_out_results,
              w_delta, evaluator_receipts, typed_edit_ops, rejected_edits, residual_risks,
              created_at, updated_at
       FROM skillforge_proposals
       ORDER BY created_at DESC`
    )
    .all() as ProposalRow[];

  const proposals = rows.map(rowToProposal);

  return {
    pending: proposals.filter((p) => p.status === "pending" || p.status === "analyzing" || p.status === "eval_running"),
    gated: proposals.filter((p) => p.status === "gated"),
    approved: proposals.filter((p) => p.status === "approved" || p.status === "applied" || p.status === "exported"),
    rejected: proposals.filter((p) => p.status === "rejected"),
  };
}

/**
 * Get a single proposal by ID.
 */
export function getProposal(db: Database.Database, proposalId: string): SkillForgeProposal | null {
  ensureTraceabilityColumns(db);
  const r = db
    .prepare(
      `SELECT id, seal_proposal_id, source_skill_id, source_version, proposed_diff,
              status, edit_hash, train_split_id, validation_split_id, held_out_split_id,
              baseline_w, validation_w, held_out_w, validation_results, held_out_results,
              w_delta, evaluator_receipts, typed_edit_ops, rejected_edits, residual_risks,
              created_at, updated_at
       FROM skillforge_proposals WHERE id = ?`
    )
    .get(proposalId) as ProposalRow | undefined;

  if (!r) return null;
  return rowToProposal(r);
}

/**
 * Apply an operator approval action.
 */
export interface ApplyApprovalResult {
  success: boolean;
  postState?: SkillForgeProposalStatus;
  /** When action === "rollback", restore result. */
  restored?: boolean;
  preVersion?: string;
  preHash?: string;
  postVersion?: string;
  postHash?: string;
  error?: string;
}

export function applyApprovalAction(
  db: Database.Database,
  action: ApprovalAction
): ApplyApprovalResult {
  const proposal = getProposal(db, action.proposalId);
  if (!proposal) {
    return { success: false, error: "Proposal not found" };
  }

  let newStatus: SkillForgeProposalStatus;
  let restored: boolean | undefined;
  let preVersion: string | undefined;
  let preHash: string | undefined;
  let postVersion: string | undefined;
  let postHash: string | undefined;

  switch (action.action) {
    case "approve":
      if (proposal.status !== "pending_approval" && proposal.status !== "gated") {
        return { success: false, error: `Cannot approve proposal in status ${proposal.status}` };
      }
      newStatus = "approved";
      break;
    case "reject":
      newStatus = "rejected";
      break;
    case "request_changes":
      newStatus = "pending";
      break;
    case "rollback":
      if (proposal.status !== "applied" && proposal.status !== "exported" && proposal.status !== "approved") {
        return { success: false, error: `Cannot rollback proposal in status ${proposal.status}` };
      }
      newStatus = "pending_approval";
      // Capture registry state BEFORE rollback for the audit
      const skillIdRollback = Number(proposal.sourceSkillId);
      if (Number.isInteger(skillIdRollback) && skillIdRollback > 0) {
        const reg = db.prepare(`SELECT version, content_hash FROM skill_registry WHERE id = ?`).get(skillIdRollback) as
          { version: string | null; content_hash: string | null } | undefined;
        preVersion = reg?.version ?? undefined;
        preHash = reg?.content_hash ?? undefined;
      }
      // Look up the most recent export to find the pre-export version/hash
      const lastExport = db.prepare(
        `SELECT pre_version, pre_hash FROM skillforge_exports
          WHERE proposal_id = ? ORDER BY created_at DESC LIMIT 1`
      ).get(proposal.id) as { pre_version: string | null; pre_hash: string | null } | undefined;

      if (lastExport && lastExport.pre_version) {
        // Restore registry to pre-export state
        if (Number.isInteger(skillIdRollback) && skillIdRollback > 0) {
          // Compute post_hash from prior raw_body if available
          const preRawBodyRow = db.prepare(
            `SELECT pre_raw_body FROM skillforge_exports WHERE proposal_id = ? ORDER BY created_at DESC LIMIT 1`
          ).get(proposal.id) as { pre_raw_body: string | null } | undefined;

          const restoreBody = preRawBodyRow?.pre_raw_body ?? "";
          const restoreHash = lastExport.pre_hash
            ?? createHash("sha256").update(restoreBody, "utf8").digest("hex");

          db.prepare(
            `UPDATE skill_registry SET version = ?, content_hash = ?, raw_body = ?, imported_at = ? WHERE id = ?`
          ).run(lastExport.pre_version, restoreHash, restoreBody, new Date().toISOString(), skillIdRollback);

          postVersion = lastExport.pre_version;
          postHash = restoreHash;
        } else {
          postVersion = lastExport.pre_version;
          postHash = lastExport.pre_hash ?? undefined;
        }
        restored = true;
      } else {
        // No export row: status-only honest result
        restored = false;
      }
      break;
    default:
      return { success: false, error: "Unknown action" };
  }

  try {
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE skillforge_proposals
         SET status = ?, updated_at = ?
         WHERE id = ?`
      ).run(newStatus, new Date().toISOString(), action.proposalId);

      // Log approval action to SEAL audit (if seal_proposal_id exists)
      if (proposal.sealProposalId) {
        try {
          db.prepare(
            `INSERT INTO seal_audit_log (proposal_id, event, detail, timestamp)
             VALUES (?, ?, ?, ?)`
          ).run(
            proposal.sealProposalId,
            action.action === "approve" ? "approved" : action.action === "reject" ? "rejected" : "rolled_back",
            JSON.stringify({ operator: action.operator, reasoning: action.reasoning }),
            new Date().toISOString()
          );
        } catch {
          // seal_audit_log may not exist
        }
      }

      // Rollback audit
      if (action.action === "rollback") {
        db.prepare(
          `INSERT INTO audit_entries
            (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          "default-tenant",
          (action.operator ?? "operator").slice(0, 120),
          "operator",
          "skillforge.rolled_back",
          "skillforge_proposal",
          `skillforge_proposal:${proposal.id}`,
          (action.reasoning ?? null),
          JSON.stringify({
            restored: restored ?? false,
            pre_version: preVersion ?? null,
            pre_hash: preHash ?? null,
            post_version: postVersion ?? null,
            post_hash: postHash ?? null,
            proposal_state: newStatus,
          }),
          new Date().toISOString()
        );
      }
    });
    tx();

    return {
      success: true,
      postState: newStatus,
      restored,
      preVersion,
      preHash,
      postVersion,
      postHash,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Rollback a proposal's runtime export. Reports truthfully:
 *   restored=true when the registry boundary is restored from skillforge_exports
 *   restored=false when no prior export row exists (status-only honesty)
 */
export interface RollbackProposalResult {
  success: boolean;
  restored: boolean;
  preVersion?: string;
  preHash?: string;
  postVersion?: string;
  postHash?: string;
  proposalState?: SkillForgeProposalStatus;
  error?: string;
}

export function rollbackProposal(
  db: Database.Database,
  proposalId: string,
  operator: string = "operator",
  reasoning?: string
): RollbackProposalResult {
  const proposal = getProposal(db, proposalId);
  if (!proposal) {
    return { success: false, restored: false, error: "Proposal not found" };
  }

  if (proposal.status !== "applied" && proposal.status !== "exported" && proposal.status !== "approved") {
    return { success: false, restored: false, error: `Cannot rollback proposal in status ${proposal.status}` };
  }

  const skillId = Number(proposal.sourceSkillId);
  const preRow = Number.isInteger(skillId) && skillId > 0
    ? db.prepare(`SELECT version, content_hash FROM skill_registry WHERE id = ?`).get(skillId) as
        { version: string | null; content_hash: string | null } | undefined
    : undefined;
  const preVersion = preRow?.version ?? undefined;
  const preHash = preRow?.content_hash ?? undefined;

  const lastExport = db.prepare(
    `SELECT pre_version, pre_hash, pre_raw_body FROM skillforge_exports
      WHERE proposal_id = ? ORDER BY created_at DESC LIMIT 1`
  ).get(proposalId) as { pre_version: string | null; pre_hash: string | null; pre_raw_body: string | null } | undefined;

  let restored = false;
  let postVersion: string | undefined;
  let postHash: string | undefined;

  try {
    const tx = db.transaction(() => {
      if (lastExport && lastExport.pre_version) {
        const restoreBody = lastExport.pre_raw_body ?? "";
        const restoreHash = lastExport.pre_hash ?? (restoreBody
          ? createHash("sha256").update(restoreBody, "utf8").digest("hex")
          : null);

        if (Number.isInteger(skillId) && skillId > 0) {
          db.prepare(
            `UPDATE skill_registry SET version = ?, content_hash = ?, raw_body = ?, imported_at = ? WHERE id = ?`
          ).run(
            lastExport.pre_version,
            restoreHash,
            restoreBody,
            new Date().toISOString(),
            skillId
          );
        }
        postVersion = lastExport.pre_version;
        postHash = restoreHash ?? undefined;
        restored = true;
      }
      // Always flip status to pending_approval for honest rollback visibility
      db.prepare(`UPDATE skillforge_proposals SET status = 'pending_approval', updated_at = ? WHERE id = ?`).run(
        new Date().toISOString(),
        proposalId
      );
      db.prepare(
        `INSERT INTO audit_entries
          (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        "default-tenant",
        (operator ?? "operator").slice(0, 120),
        "operator",
        "skillforge.rolled_back",
        "skillforge_proposal",
        `skillforge_proposal:${proposalId}`,
        reasoning ?? null,
        JSON.stringify({
          restored,
          pre_version: preVersion ?? null,
          pre_hash: preHash ?? null,
          post_version: postVersion ?? null,
          post_hash: postHash ?? null,
          proposal_state: "pending_approval",
        }),
        new Date().toISOString()
      );
    });
    tx();
    return { success: true, restored, preVersion, preHash, postVersion, postHash, proposalState: "pending_approval" };
  } catch (err) {
    return { success: false, restored: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Promote an approved proposal to applied status.
 * This is called after SEAL apply succeeds.
 */
export function markApplied(
  db: Database.Database,
  proposalId: string
): { success: boolean; error?: string } {
  const proposal = getProposal(db, proposalId);
  if (!proposal) {
    return { success: false, error: "Proposal not found" };
  }

  if (proposal.status !== "approved") {
    return { success: false, error: `Proposal must be approved before applying (current: ${proposal.status})` };
  }

  try {
    db.prepare(
      `UPDATE skillforge_proposals
       SET status = 'applied', updated_at = ?
       WHERE id = ?`
    ).run(new Date().toISOString(), proposalId);

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
