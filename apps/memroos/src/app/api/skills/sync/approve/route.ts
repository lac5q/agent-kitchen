/**
 * POST /api/skills/sync/approve
 *
 * Approves a pending sync proposal. The approval:
 *   - updates skill_registry content (raw_body, version, content_hash)
 *     to reflect the approved content,
 *   - sets dispatch_status='quarantined' so the skill must still pass
 *     the quarantine pipeline before becoming dispatchable
 *     (SKILLTRUST-03 + SKILLTRUST-04),
 *   - records approved_by/approved_at and clears the pending proposal.
 *
 * Body:
 *   {
 *     skill_name: string,
 *     source_harness: string,
 *     operator: string
 *   }
 *
 * Auth: operator-only. Loopback is always authorized.
 *
 * Phase 149 / SKILLTRUST-04 — Governed cross-harness auto-sync.
 */

import { getDb } from "@/lib/db";
import { authorizeSyncWrite } from "@/app/api/skills/_sync-auth";
import {
  approveImportProposal,
  requireHarness,
  SkillSyncError,
} from "@/lib/skills/skill-sync";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export async function POST(request: Request) {
  const auth = authorizeSyncWrite(request);
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

  const skillName = body["skill_name"];
  const sourceHarness = body["source_harness"];
  const operator = body["operator"];

  if (typeof skillName !== "string" || !skillName.trim()) {
    return Response.json(
      { ok: false, error: "skill_name is required (non-empty string)" },
      { status: 400 }
    );
  }
  if (typeof sourceHarness !== "string" || !sourceHarness.trim()) {
    return Response.json(
      { ok: false, error: "source_harness is required (non-empty string)" },
      { status: 400 }
    );
  }
  if (typeof operator !== "string" || !operator.trim()) {
    return Response.json(
      { ok: false, error: "operator is required (non-empty string)" },
      { status: 400 }
    );
  }

  const db = getDb();
  try {
    const updated = approveImportProposal(db, {
      skill_name: skillName.trim(),
      source_harness: requireHarness(sourceHarness.trim()),
      operator: operator.trim(),
    });
    return Response.json({ ok: true, proposal: updated });
  } catch (err) {
    if (err instanceof SkillSyncError) {
      return Response.json({ ok: false, error: err.message }, { status: 409 });
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
