/**
 * POST /api/skills/quarantine/reject
 *
 * Rejects a quarantined skill: transitions stage -> 'rejected', sets
 * approval_status -> 'rejected', records approved_by (the rejecting
 * operator) / approved_at, and rejection_reason. The skill_registry
 * row stays at dispatch_status='quarantined' so lookupSkillContract
 * continues to deny the skill.
 *
 * Body:
 *   { skill_id: number, operator: string, reason: string }
 *
 * Auth: operator-only — 401 when no operator key is configured,
 * 403 when a key is configured but not supplied / mismatched.
 *
 * Phase 149 / SKILLTRUST-03 — Quarantine Lane.
 */

import { getDb } from "@/lib/db";
import {
  getQuarantineRecord,
  QuarantineTransitionError,
  rejectQuarantine,
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

  const reasonRaw = body["reason"];
  const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : "";
  if (!reason) {
    return Response.json(
      { ok: false, error: "reason is required (string, non-empty)" },
      { status: 400 }
    );
  }

  const db = getDb();

  const existing = getQuarantineRecord(db, skillId);
  if (!existing) {
    return Response.json(
      { ok: false, error: `No quarantine record for skill_id=${skillId}` },
      { status: 404 }
    );
  }
  if (existing.stage === "enabled") {
    return Response.json(
      {
        ok: false,
        error: `Cannot reject skill_id=${skillId} — already approved (stage='enabled')`,
      },
      { status: 409 }
    );
  }

  try {
    const updated = rejectQuarantine(db, skillId, operator, reason);

    const registryRow = db
      .prepare(`SELECT dispatch_status FROM skill_registry WHERE id = ?`)
      .get(skillId) as { dispatch_status: string } | undefined;

    return Response.json({
      ok: true,
      rejected_by: updated.approved_by,
      rejected_at: updated.approved_at,
      rejection_reason: updated.rejection_reason,
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
        error: `Rejection failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
