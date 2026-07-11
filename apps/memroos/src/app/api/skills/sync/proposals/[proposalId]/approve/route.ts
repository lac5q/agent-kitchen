/**
 * POST /api/skills/sync/proposals/:proposalId/approve
 *
 * Approves a pending sync proposal by its UUID. The approval:
 *
 *   1. Loads the sync_state row by proposal_id and refuses to act on
 *      rows that are not in the pending state.
 *   2. Optional optimistic-concurrency check via
 *      `expected_updated_at`.
 *   3. Re-reads the source file from disk (when source_file_path +
 *      source_root were captured during the scan) and re-verifies the
 *      SHA-256 against pending_detected_hash. Stale / foreign
 *      content between scan and approval fails closed.
 *   4. Writes the allowlisted projection into skill_registry
 *      (raw_body, version, content_hash, dispatch_status='quarantined')
 *      atomically with the skill_sync_state update + audit entry. No
 *      other columns are touched and the row stays in the quarantine
 *      state so the operator must pass it through the quarantine
 *      pipeline (SKILLTRUST-03) before dispatch.
 *
 * Body:
 *   {
 *     operator: string,
 *     reason?: string,
 *     expected_updated_at?: string,
 *     apply_to_registry?: boolean   // default true
 *   }
 *
 * Auth: operator-only. Loopback is always authorized.
 *
 * Phase 149 (continued) / VAL-SKILL-028 / VAL-SKILL-029.
 */

import { getDb } from "@/lib/db";
import {
  approveSyncProposalById,
  SkillSyncError,
} from "@/lib/skills/skill-sync";
import { authorizeSyncWrite } from "@/app/api/skills/_sync-auth";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ proposalId: string }> }
) {
  const auth = authorizeSyncWrite(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { proposalId } = await context.params;
  if (!proposalId || typeof proposalId !== "string") {
    return Response.json(
      { ok: false, error: "proposalId is required" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const bodyRecord =
    body !== undefined && body !== null && isRecord(body)
      ? body
      : ({} as Record<string, unknown>);

  const operatorRaw = bodyRecord["operator"];
  const operator = typeof operatorRaw === "string" ? operatorRaw.trim() : "";
  if (!operator) {
    return Response.json(
      { ok: false, error: "operator is required (string)" },
      { status: 400 }
    );
  }

  const reasonRaw = bodyRecord["reason"];
  const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : undefined;
  const expectedRaw = bodyRecord["expected_updated_at"];
  const expectedUpdatedAt =
    typeof expectedRaw === "string" && expectedRaw.trim()
      ? expectedRaw.trim()
      : undefined;
  const applyRaw = bodyRecord["apply_to_registry"];
  const applyToRegistry = applyRaw === undefined ? true : Boolean(applyRaw);

  const db = getDb();
  try {
    const result = approveSyncProposalById(db, {
      proposal_id: proposalId,
      operator,
      ...(reason ? { reason } : {}),
      ...(expectedUpdatedAt ? { expected_updated_at: expectedUpdatedAt } : {}),
      apply_to_registry: applyToRegistry,
    });
    return Response.json({ ok: true, proposal: result });
  } catch (err) {
    if (err instanceof SkillSyncError) {
      const msg = err.message;
      const status = msg.includes("not found") || msg.includes("No pending sync proposal")
        ? 404
        : msg.includes("Stale concurrent")
          ? 409
          : msg.includes("Source hash mismatch") ||
              msg.includes("already approved")
            ? 409
            : 400;
      return Response.json({ ok: false, error: msg }, { status });
    }
    return Response.json(
      {
        ok: false,
        error: `Approval failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
