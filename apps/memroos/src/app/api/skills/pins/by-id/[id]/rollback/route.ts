/**
 * POST /api/skills/pins/[id]/rollback
 *
 * Performs a one-step rollback on the pin: the immediately prior
 * version/hash becomes the new current; the previous current is
 * discarded. An audit entry is written so the rollback is traceable.
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
  rollbackAgentVersionPin,
  SyncGovernanceError,
} from "@/lib/skills/skill-sync-governance";
import { authorizeSyncWrite } from "../../../../_sync-auth";

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
  const pinId = Number(id);
  if (!Number.isInteger(pinId) || pinId <= 0) {
    return Response.json(
      { ok: false, error: "Pin id must be a positive integer" },
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

  const db = getDb();
  try {
    const rolled = rollbackAgentVersionPin(db, {
      pin_id: pinId,
      operator,
      reason,
    });
    return Response.json({ ok: true, pin: rolled });
  } catch (err) {
    if (err instanceof SyncGovernanceError) {
      const status = err.message.includes("not found") ? 404 : 409;
      return Response.json({ ok: false, error: err.message }, { status });
    }
    return Response.json(
      {
        ok: false,
        error: `Rollback failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
