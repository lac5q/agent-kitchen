/**
 * POST /api/skills/pins
 *
 * Creates or updates a version pin for (agent_id, skill_name). Pin
 * replacement rotates the previous current -> prior. The skill must
 * already be approved/dispatchable — pin creation refuses to point at
 * a registry row whose dispatch_status is not 'enabled' (with
 * completeness_pct=100) or 'quarantined'.
 *
 * Body:
 *   {
 *     agent_id: string,
 *     skill_name: string,
 *     skill_id?: number | null,
 *     current_version: string,
 *     current_content_hash: string,  // 64-char SHA-256 hex
 *     actor: string
 *   }
 *
 * Auth: operator-only.
 *
 * GET /api/skills/pins
 *
 * Lists version pins. Supports ?agent_id=, ?skill_name=, ?limit=,
 * ?offset= filters. Read-only — no auth required (mirrors the
 * public-read convention used by /api/skills/import GET).
 *
 * Phase 149 / SKILLTRUST-04 — Governed cross-harness auto-sync.
 */

import { getDb } from "@/lib/db";
import {
  createOrUpdateAgentVersionPin,
  listAgentVersionPins,
  SyncGovernanceError,
} from "@/lib/skills/skill-sync-governance";
import { authorizeSyncWrite } from "../_sync-auth";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const agentIdRaw = url.searchParams.get("agent_id");
  const skillNameRaw = url.searchParams.get("skill_name");
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const db = getDb();
  const items = listAgentVersionPins(db, {
    ...(agentIdRaw ? { agent_id: agentIdRaw } : {}),
    ...(skillNameRaw ? { skill_name: skillNameRaw } : {}),
    limit,
    offset,
  });

  return Response.json({
    ok: true,
    items,
    total: items.length,
    limit,
    offset,
    filters: {
      agent_id: agentIdRaw,
      skill_name: skillNameRaw,
    },
  });
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

  const agentId = body["agent_id"];
  const skillName = body["skill_name"];
  const currentVersion = body["current_version"];
  const currentHash = body["current_content_hash"];
  const actor = body["actor"];
  const skillIdRaw = body["skill_id"];
  // SKILLTRUST-04 / VAL-SKILL-030 — optional optimistic-concurrency
  // and idempotency-key fields. The library functions fail closed on
  // mismatched updated_at or key reuse with a different request body.
  const expectedUpdatedAtRaw = body["expected_current_updated_at"];
  const expectedCurrentUpdatedAt =
    typeof expectedUpdatedAtRaw === "string" && expectedUpdatedAtRaw.trim()
      ? expectedUpdatedAtRaw.trim()
      : undefined;
  const idempotencyKeyRaw = body["idempotency_key"];
  const idempotencyKey =
    typeof idempotencyKeyRaw === "string" && idempotencyKeyRaw.trim()
      ? idempotencyKeyRaw.trim()
      : undefined;

  if (typeof agentId !== "string" || !agentId.trim()) {
    return Response.json(
      { ok: false, error: "agent_id is required (string)" },
      { status: 400 }
    );
  }
  if (typeof skillName !== "string" || !skillName.trim()) {
    return Response.json(
      { ok: false, error: "skill_name is required (string)" },
      { status: 400 }
    );
  }
  if (typeof currentVersion !== "string" || !currentVersion.trim()) {
    return Response.json(
      { ok: false, error: "current_version is required (non-empty string)" },
      { status: 400 }
    );
  }
  if (typeof currentHash !== "string" || !/^[0-9a-f]{64}$/i.test(currentHash)) {
    return Response.json(
      {
        ok: false,
        error: "current_content_hash is required (64-char SHA-256 hex)",
      },
      { status: 400 }
    );
  }
  if (typeof actor !== "string" || !actor.trim()) {
    return Response.json(
      { ok: false, error: "actor is required (string)" },
      { status: 400 }
    );
  }
  let skillId: number | null = null;
  if (skillIdRaw !== undefined && skillIdRaw !== null) {
    const asNumber = typeof skillIdRaw === "number" ? skillIdRaw : Number(skillIdRaw);
    if (!Number.isInteger(asNumber) || asNumber <= 0) {
      return Response.json(
        { ok: false, error: "skill_id must be a positive integer or null" },
        { status: 400 }
      );
    }
    skillId = asNumber;
  }

  const db = getDb();
  try {
    const pin = createOrUpdateAgentVersionPin(db, {
      agent_id: agentId.trim(),
      skill_name: skillName.trim(),
      skill_id: skillId,
      current_version: currentVersion.trim(),
      current_content_hash: currentHash,
      actor: actor.trim(),
      ...(expectedCurrentUpdatedAt
        ? { expected_current_updated_at: expectedCurrentUpdatedAt }
        : {}),
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    });
    return Response.json({ ok: true, pin });
  } catch (err) {
    if (err instanceof SyncGovernanceError) {
      const msg = err.message;
      const status = msg.includes("Stale concurrent") ||
        msg.includes("Idempotency key") ||
        msg.includes("previously used with a different")
        ? 409
        : 400;
      return Response.json({ ok: false, error: msg }, { status });
    }
    return Response.json(
      {
        ok: false,
        error: `Pin creation failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
