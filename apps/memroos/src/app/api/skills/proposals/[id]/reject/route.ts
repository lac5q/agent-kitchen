/**
 * POST /api/skills/proposals/[id]/reject
 *
 * Rejects a pending import proposal. Sets status='rejected' and records
 * the operator + reason. The proposal body is left intact for audit;
 * no skill_registry mutation occurs.
 *
 * Body:
 *   { operator: string, reason: string }
 *
 * Auth: operator-only — 401 when no operator key is configured,
 * 403 when a key is configured but not supplied / mismatched.
 *
 * Phase 149 / SKILLTRUST-04 — Governed cross-harness auto-sync.
 */

import { getDb } from "@/lib/db";
import {
  rejectImportProposal,
  SyncGovernanceError,
} from "@/lib/skills/skill-sync-governance";
import { authorizeSyncWrite } from "../../../_sync-auth";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = authorizeSyncWrite(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  if (!id || typeof id !== "string") {
    return Response.json(
      { ok: false, error: "Proposal id is required" },
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
      { ok: false, error: "reason is required (string, non-empty)" },
      { status: 400 }
    );
  }

  const db = getDb();
  try {
    const updated = rejectImportProposal(db, id, operator, reason);
    return Response.json({
      ok: true,
      proposal: updated,
    });
  } catch (err) {
    if (err instanceof SyncGovernanceError) {
      const status = err.message.includes("not found") ? 404 : 409;
      return Response.json({ ok: false, error: err.message }, { status });
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
