/**
 * POST /api/skills/sync/proposals/:proposalId/reject
 *
 * Rejects a pending sync proposal by its UUID. Clears the pending
 * proposal fields without touching the skill_registry row (a future
 * scan can re-detect drift).
 *
 * Body:
 *   {
 *     operator: string,
 *     reason: string,
 *     expected_updated_at?: string
 *   }
 *
 * Auth: operator-only. Loopback is always authorized.
 *
 * Phase 149 (continued) / VAL-SKILL-029.
 */

import { getDb } from "@/lib/db";
import {
  rejectSyncProposalById,
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
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return Response.json({ ok: false, error: "Body must be an object" }, { status: 400 });
  }

  const operatorRaw = body["operator"];
  const operator = typeof operatorRaw === "string" ? operatorRaw.trim() : "";
  if (!operator) {
    return Response.json(
      { ok: false, error: "operator is required (string)" },
      { status: 400 }
    );
  }

  const reasonRaw = body["reason"];
  const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : "";
  if (!reason) {
    return Response.json(
      { ok: false, error: "reason is required (non-empty string)" },
      { status: 400 }
    );
  }

  const expectedRaw = body["expected_updated_at"];
  const expectedUpdatedAt =
    typeof expectedRaw === "string" && expectedRaw.trim()
      ? expectedRaw.trim()
      : undefined;

  const db = getDb();
  try {
    const result = rejectSyncProposalById(db, {
      proposal_id: proposalId,
      operator,
      reason,
      ...(expectedUpdatedAt ? { expected_updated_at: expectedUpdatedAt } : {}),
    });
    return Response.json({ ok: true, proposal: result });
  } catch (err) {
    if (err instanceof SkillSyncError) {
      const msg = err.message;
      const status = msg.includes("not found") || msg.includes("No pending sync proposal")
        ? 404
        : msg.includes("Stale concurrent") || msg.includes("already")
          ? 409
          : 400;
      return Response.json({ ok: false, error: msg }, { status });
    }
    return Response.json(
      {
        ok: false,
        error: `Rejection failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
