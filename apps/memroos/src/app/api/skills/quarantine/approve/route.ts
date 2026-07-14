/**
 * POST /api/skills/quarantine/approve
 *
 * Approves a quarantined skill: transitions stage -> 'enabled', sets
 * approval_status -> 'approved', records approved_by / approved_at, and
 * flips `skill_registry.dispatch_status` from 'quarantined' to 'enabled'.
 *
 * Body:
 *   { skill_id: number, operator: string, notes?: string }
 *
 * Auth: operator-only — 401 when no operator key is configured,
 * 403 when a key is configured but not supplied / mismatched.
 *
 * Phase 149 / SKILLTRUST-03 — Quarantine Lane.
 */

import { getDb } from "@/lib/db";
import {
  approveQuarantine,
  getQuarantineRecord,
  QuarantineTransitionError,
} from "@/lib/skills/skill-quarantine";
import { authorizeQuarantineWrite } from "../_auth";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export async function POST(request: Request) {
  const auth = authorizeQuarantineWrite(request);
  if (!auth.ok) {
    return auth.response;
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

  const skillIdRaw = body["skill_id"];
  const skillId = typeof skillIdRaw === "number" ? skillIdRaw : Number(skillIdRaw);
  if (!Number.isInteger(skillId) || skillId <= 0) {
    return Response.json({ ok: false, error: "skill_id must be a positive integer" }, { status: 400 });
  }

  const operatorRaw = body["operator"];
  const operator = typeof operatorRaw === "string" ? operatorRaw.trim() : "";
  if (!operator) {
    return Response.json(
      { ok: false, error: "operator is required (string)" },
      { status: 400 }
    );
  }

  const db = getDb();

  // Pre-check: ensure the skill exists and is in pending_approval. We
  // delegate the actual transition to approveQuarantine which enforces
  // the same invariant in code (the pre-check here only produces a
  // friendlier 404 / 409 response for callers).
  const existing = getQuarantineRecord(db, skillId);
  if (!existing) {
    return Response.json(
      { ok: false, error: `No quarantine record for skill_id=${skillId}` },
      { status: 404 }
    );
  }
  if (existing.stage !== "pending_approval") {
    return Response.json(
      {
        ok: false,
        error: `Cannot approve skill_id=${skillId} from stage '${existing.stage}' — must be 'pending_approval'`,
      },
      { status: 409 }
    );
  }

  try {
    const updated = approveQuarantine(db, skillId, operator);

    // Surface the new dispatch_status for operator confirmation.
    const registryRow = db
      .prepare(`SELECT dispatch_status FROM skill_registry WHERE id = ?`)
      .get(skillId) as { dispatch_status: string } | undefined;

    return Response.json({
      ok: true,
      approved_by: updated.approved_by,
      approved_at: updated.approved_at,
      stage: updated.stage,
      approval_status: updated.approval_status,
      skill_id: skillId,
      dispatch_status: registryRow?.dispatch_status ?? null,
      record: updated,
    });
  } catch (err) {
    if (err instanceof QuarantineTransitionError) {
      return Response.json(
        { ok: false, error: err.message },
        { status: 409 }
      );
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
