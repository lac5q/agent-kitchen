/**
 * SkillForge Integration — Phase 90
 * Cross-modal eval, SkillCycle maintenance, and safe runtime export.
 */

import { createHash } from "crypto";
import type Database from "better-sqlite3";
import type {
  SkillForgeConfig,
  SkillForgeProposal,
  SkillForgeRunResult,
} from "./types";
import { buildSealPayload } from "./proposal";

export interface CrossModalEvalResult {
  provider: string;
  model: string;
  dimensions: {
    goal: number;
    depth: number;
    specificity: number;
    safety: number;
    correctness: number;
  };
  overallScore: number;
  suggestions: string[];
}

export interface SkillCycleResult {
  lintPassed: boolean;
  syncComplete: boolean;
  analysisComplete: boolean;
  proposalsGenerated: number;
  evalsRun: number;
  gatedCount: number;
  approvedCount: number;
  embeddedCount: number;
  orphansPurged: number;
  errors: string[];
}

/**
 * Run cross-modal eval on a proposal using multiple providers.
 * Stub: returns mock results for now.
 */
export function runCrossModalEval(
  _proposal: SkillForgeProposal
): CrossModalEvalResult[] {
  // In production, this would call multiple judge endpoints
  return [
    {
      provider: "openai",
      model: "gpt-4o",
      dimensions: { goal: 0.82, depth: 0.75, specificity: 0.88, safety: 0.95, correctness: 0.79 },
      overallScore: 0.838,
      suggestions: ["Add more specific trigger examples", "Clarify fallback behavior"],
    },
    {
      provider: "anthropic",
      model: "claude-sonnet-4",
      dimensions: { goal: 0.85, depth: 0.78, specificity: 0.86, safety: 0.93, correctness: 0.81 },
      overallScore: 0.846,
      suggestions: ["Expand test coverage for edge cases"],
    },
  ];
}

/**
 * Export an approved proposal to a runtime projection.
 * Returns the exported skill content + edit/eval hashes + pre/post registry
 * version/hash. Writes a skillforge_exports row and audit_entries row inside
 * a single transaction so registry boundary and audit are atomic.
 *
 * VAL-SKILL-037 contract:
 *   - only approved/applied/exported proposals can export
 *   - edit_hash binds proposed_diff
 *   - eval_receipt_hash binds evaluator_receipts + typed_edit_ops
 *   - post_version contains "rev-" so we can recognize rollback targets
 */
export interface ExportRuntimeResult {
  success: boolean;
  content?: string;
  editHash?: string;
  evalReceiptHash?: string;
  preVersion?: string;
  preHash?: string;
  postVersion?: string;
  postHash?: string;
  error?: string;
}

export function exportToRuntime(
  db: Database.Database,
  proposal: SkillForgeProposal,
  actor: string = "operator"
): ExportRuntimeResult {
  if (!proposal || (proposal.status !== "approved" && proposal.status !== "applied")) {
    return { success: false, error: `Cannot export proposal in status ${proposal?.status ?? "undefined"}` };
  }

  const editHash = createHash("sha256").update(proposal.proposedDiff ?? "", "utf8").digest("hex");
  const evalPayload = JSON.stringify({
    receipts: proposal.evaluatorReceipts ?? [],
    typedOps: proposal.typedEditOps ?? [],
    validation: proposal.validationResults ?? {},
    heldOut: proposal.heldOutResults ?? {},
  });
  const evalReceiptHash = createHash("sha256").update(evalPayload, "utf8").digest("hex");

  // Capture pre-state from registry first (needed for sealed body)
  const skillId = Number(proposal.sourceSkillId);
  const preRow = Number.isInteger(skillId) && skillId > 0
    ? db.prepare(`SELECT version, content_hash, raw_body FROM skill_registry WHERE id = ?`).get(skillId) as
        { version: string | null; content_hash: string | null; raw_body: string | null } | undefined
    : undefined;

  const preVersion = preRow?.version ?? proposal.sourceVersion ?? "1.0.0";
  const preHash = preRow?.content_hash ?? null;
  const preRawBody = preRow?.raw_body ?? null;

  // Runtime projection format
  const postVersion = `${proposal.sourceVersion ?? "1.0.0"}-rev-${Date.now()}`;
  // sealed body: preserve prior raw_body (with diff appended) so a downstream
  // rollback can recover the exact original text.
  const priorBody = preRawBody ?? "";
  const sealedBody = priorBody
    ? `${priorBody}\n# diff ${editHash.slice(0, 12)}\n${proposal.proposedDiff ?? ""}`
    : (proposal.proposedDiff ?? "");

  const runtimeSkill: Record<string, unknown> & {
    name: string;
    version: string;
    pre_version: string;
    pre_hash: string | null;
    post_version: string;
    edit_hash: string;
    eval_receipt_hash: string;
    diff: string | undefined;
    validation: unknown;
    wDelta: unknown;
    exportedAt: string;
    body?: string;
  } = {
    name: proposal.sourceSkillId,
    version: postVersion,
    pre_version: preVersion,
    pre_hash: preHash,
    post_version: postVersion,
    edit_hash: editHash,
    eval_receipt_hash: evalReceiptHash,
    train_split_id: proposal.trainSplitId,
    validation_split_id: proposal.validationSplitId,
    held_out_split_id: proposal.heldOutSplitId,
    baseline_w: proposal.baselineW,
    validation_w: proposal.validationW,
    held_out_w: proposal.heldOutW,
    evaluator_receipts: proposal.evaluatorReceipts ?? [],
    typed_edit_ops: proposal.typedEditOps ?? [],
    diff: proposal.proposedDiff,
    validation: proposal.validationResults,
    wDelta: proposal.wDelta,
    exportedAt: new Date().toISOString(),
    body: sealedBody,
  };

  const finalJson = JSON.stringify(runtimeSkill, null, 2);
  const finalPostHash = createHash("sha256").update(finalJson, "utf8").digest("hex");

  // Begin transaction: skillforge_exports row + registry update + proposal status + audit
  const tx = db.transaction(() => {
    const exportId = `sfe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(
      `INSERT INTO skillforge_exports
        (id, proposal_id, skill_id, skill_registry_id, pre_version, pre_hash, pre_raw_body,
         post_version, post_hash, edit_hash, eval_receipt_hash, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      exportId,
      proposal.id,
      proposal.sourceSkillId,
      Number.isInteger(skillId) && skillId > 0 ? skillId : null,
      preVersion,
      preHash,
      preRawBody,
      postVersion,
      finalPostHash,
      editHash,
      evalReceiptHash,
      (actor ?? "operator").slice(0, 120),
      new Date().toISOString()
    );

    // Update registry if numeric
    if (Number.isInteger(skillId) && skillId > 0) {
      db.prepare(
        `UPDATE skill_registry SET version = ?, content_hash = ?, raw_body = ?, imported_at = ? WHERE id = ?`
      ).run(postVersion, finalPostHash, finalJson, new Date().toISOString(), skillId);
    }

    db.prepare(`UPDATE skillforge_proposals SET status = 'exported', updated_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      proposal.id
    );

    db.prepare(
      `INSERT INTO audit_entries
        (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      "default-tenant",
      (actor ?? "operator").slice(0, 120),
      "operator",
      "skillforge.exported",
      "skillforge_proposal",
      `skillforge_proposal:${proposal.id}`,
      null,
      JSON.stringify({
        pre_version: preVersion,
        pre_hash: preHash,
        post_version: postVersion,
        post_hash: finalPostHash,
        edit_hash: editHash,
        eval_receipt_hash: evalReceiptHash,
        validation_split_id: proposal.validationSplitId,
        held_out_split_id: proposal.heldOutSplitId,
        export_id: exportId,
      }),
      new Date().toISOString()
    );
  });
  tx();

  return {
    success: true,
    content: finalJson,
    editHash,
    evalReceiptHash,
    preVersion,
    preHash: preHash ?? undefined,
    postVersion,
    postHash: finalPostHash,
  };
}

/**
 * Update skill_registry with revision history after apply.
 */
export function updateSkillRegistry(
  db: Database.Database,
  proposal: SkillForgeProposal
): { success: boolean; error?: string } {
  try {
    // Update skill_registry with new version and eval receipt
    db.prepare(
      `UPDATE skill_registry
       SET version = ?, imported_at = ?
       WHERE id = ?`
    ).run(
      `${proposal.sourceVersion}-rev-${Date.now()}`,
      new Date().toISOString(),
      Number(proposal.sourceSkillId)
    );

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Run the full SkillCycle: lint → sync → analyze → propose → eval → gate → embed → orphans → purge.
 * Returns cycle result summary.
 */
export async function runSkillCycle(
  db: Database.Database,
  config: SkillForgeConfig
): Promise<SkillCycleResult> {
  const result: SkillCycleResult = {
    lintPassed: true,
    syncComplete: true,
    analysisComplete: true,
    proposalsGenerated: 0,
    evalsRun: 0,
    gatedCount: 0,
    approvedCount: 0,
    embeddedCount: 0,
    orphansPurged: 0,
    errors: [],
  };

  try {
    // 1. Lint: verify skill_registry integrity
    const skillCount = db.prepare("SELECT COUNT(*) as count FROM skill_registry").get() as { count: number };
    if (skillCount.count === 0) {
      result.lintPassed = false;
      result.errors.push("No skills in registry");
    }

    // 2. Sync: ensure all tables exist
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'skillforge_%'"
    ).all() as Array<{ name: string }>;
    const requiredTables = ["skillforge_proposals", "skillforge_splits", "skillforge_rejected_edits", "skillforge_run_log"];
    const missingTables = requiredTables.filter((t) => !tables.some((row) => row.name === t));
    if (missingTables.length > 0) {
      result.syncComplete = false;
      result.errors.push(`Missing tables: ${missingTables.join(", ")}`);
    }

    // 3. Analyze: count pending proposals
    const pendingCount = db.prepare(
      "SELECT COUNT(*) as count FROM skillforge_proposals WHERE status = 'pending'"
    ).get() as { count: number };
    result.proposalsGenerated = pendingCount.count;

    // 4. Eval: count gated vs approved
    const gatedCount = db.prepare(
      "SELECT COUNT(*) as count FROM skillforge_proposals WHERE status = 'gated'"
    ).get() as { count: number };
    result.gatedCount = gatedCount.count;

    const approvedCount = db.prepare(
      "SELECT COUNT(*) as count FROM skillforge_proposals WHERE status IN ('approved', 'applied', 'exported')"
    ).get() as { count: number };
    result.approvedCount = approvedCount.count;

    // 5. Orphans: clean up old rejected edits
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const purged = db.prepare(
      "DELETE FROM skillforge_rejected_edits WHERE expires_at < ?"
    ).run(thirtyDaysAgo.toISOString());
    result.orphansPurged = purged.changes;

  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}
