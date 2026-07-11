/**
 * POST /api/skills/pins/:agent/rollback
 *
 * Rolls back the version pin for (agent_id, skill_name) using the
 * agent id in the URL path (the validation contract uses
 * `:agent` in the route name). The skill_name is supplied in the
 * request body because a single agent can have multiple pins.
 *
 * Body:
 *   {
 *     skill_name: string,
 *     operator: string,
 *     reason?: string
 *   }
 *
 * Auth: operator-only. Loopback is always authorized.
 *
 * Phase 149 (continued) / VAL-SKILL-031 — pinned dispatch and rollback.
 */

import { getDb } from "@/lib/db";
import {
  rollbackAgentVersionPinByAgent,
  SyncGovernanceError,
} from "@/lib/skills/skill-sync-governance";
import { authorizeSyncWrite } from "@/app/api/skills/_sync-auth";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ agent: string }> }
) {
  const auth = authorizeSyncWrite(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { agent } = await context.params;
  if (!agent || typeof agent !== "string") {
    return Response.json(
      { ok: false, error: "agent is required" },
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

  const skillNameRaw = body["skill_name"];
  const skillName = typeof skillNameRaw === "string" ? skillNameRaw.trim() : "";
  if (!skillName) {
    return Response.json(
      { ok: false, error: "skill_name is required (string)" },
      { status: 400 }
    );
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
  const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : undefined;

  const db = getDb();
  try {
    const pin = rollbackAgentVersionPinByAgent(db, {
      agent_id: agent.trim(),
      skill_name: skillName,
      operator,
      ...(reason ? { reason } : {}),
    });
    return Response.json({ ok: true, pin });
  } catch (err) {
    if (err instanceof SyncGovernanceError) {
      const msg = err.message;
      const status = msg.includes("not found") || msg.includes("No version pin found")
        ? 404
        : msg.includes("prior") || msg.includes("tamper") || msg.includes("policy-invalid")
          ? 409
          : 400;
      return Response.json({ ok: false, error: msg }, { status });
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
