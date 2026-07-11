/**
 * POST /api/skills/proposals/[id]/approve
 *
 * Approves a pending import proposal. Sets status='approved' and records
 * the operator + reason. The skill_registry row is NOT mutated here —
 * the quarantine pipeline (Phase 149 / SKILLTRUST-03) remains the sole
 * path to dispatch_status='enabled'.
 *
 * Body:
 *   { operator: string, reason?: string }
 *
 * Auth: operator-only — 401 when no operator key is configured,
 * 403 when a key is configured but not supplied / mismatched.
 *
 * Phase 149 / SKILLTRUST-04 — Governed cross-harness auto-sync.
 */

import { getDb } from "@/lib/db";
import {
  approveImportProposal,
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
    // Empty body is allowed — only operator is required.
    body = {};
  }
  if (body !== undefined && !isRecord(body) && body !== null) {
    return Response.json(
      { ok: false, error: "Body must be an object" },
      { status: 400 }
    );
  }
  const bodyRecord = (body ?? {}) as Record<string, unknown>;

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

  const db = getDb();
  try {
    const updated = approveImportProposal(db, id, operator, reason);
    return Response.json({
      ok: true,
      proposal: updated,
    });
  } catch (err) {
    if (err instanceof SyncGovernanceError) {
      // Distinguish missing (404) from transition errors (409).
      const status = err.message.includes("not found") ? 404 : 409;
      return Response.json({ ok: false, error: err.message }, { status });
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
