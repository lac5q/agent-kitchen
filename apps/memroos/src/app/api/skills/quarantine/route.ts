/**
 * GET /api/skills/quarantine
 *
 * Lists quarantine records. Supports ?stage=, ?approval_status=,
 * ?limit=, ?offset= filters. Read-only — no auth required so the
 * operator dashboard can poll the queue without operator key rotation.
 *
 * Phase 149 / SKILLTRUST-03 — Quarantine Lane.
 */

import { getDb } from "@/lib/db";
import {
  listQuarantineRecords,
  QUARANTINE_STAGES,
  type ApprovalStatus,
  type QuarantineStage,
} from "@/lib/skills/skill-quarantine";
import { authorizeQuarantineWrite } from "./_auth";

export const dynamic = "force-dynamic";

function isQuarantineStage(value: string): value is QuarantineStage {
  return (QUARANTINE_STAGES as readonly string[]).includes(value);
}

function isApprovalStatus(value: string): value is ApprovalStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const stageRaw = url.searchParams.get("stage");
  const approvalRaw = url.searchParams.get("approval_status");
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  let stage: QuarantineStage | undefined;
  if (stageRaw) {
    if (!isQuarantineStage(stageRaw)) {
      return Response.json(
        {
          ok: false,
          error: `Invalid stage '${stageRaw}'. Valid values: ${QUARANTINE_STAGES.join(", ")}`,
        },
        { status: 400 }
      );
    }
    stage = stageRaw;
  }

  let approvalStatus: ApprovalStatus | undefined;
  if (approvalRaw) {
    if (!isApprovalStatus(approvalRaw)) {
      return Response.json(
        {
          ok: false,
          error: `Invalid approval_status '${approvalRaw}'. Valid values: pending, approved, rejected`,
        },
        { status: 400 }
      );
    }
    approvalStatus = approvalRaw;
  }

  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const db = getDb();
  const items = listQuarantineRecords(db, {
    ...(stage ? { stage } : {}),
    ...(approvalStatus ? { approvalStatus } : {}),
    limit,
    offset,
  });

  // Join the skill_registry row for operator context (name, source_harness,
  // risk_tier). We do this in JS rather than SQL to keep the quarantine
  // module free of skill_registry assumptions.
  const skillIds = items.map((it) => it.skill_id);
  const skillMap = new Map<
    number,
    { name: string | null; source_harness: string; risk_tier: string | null }
  >();
  if (skillIds.length > 0) {
    const placeholders = skillIds.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT id, name, source_harness, risk_tier FROM skill_registry WHERE id IN (${placeholders})`
      )
      .all(...skillIds) as Array<{
      id: number;
      name: string | null;
      source_harness: string;
      risk_tier: string | null;
    }>;
    for (const row of rows) {
      skillMap.set(row.id, {
        name: row.name,
        source_harness: row.source_harness,
        risk_tier: row.risk_tier,
      });
    }
  }

  const enriched = items.map((it) => ({
    ...it,
    skill: skillMap.get(it.skill_id) ?? null,
  }));

  return Response.json({
    ok: true,
    items: enriched,
    total: enriched.length,
    limit,
    offset,
    filters: {
      stage: stage ?? null,
      approval_status: approvalStatus ?? null,
    },
  });
}

/**
 * POST /api/skills/quarantine
 *
 * Runs the quarantine pipeline for a skill_id. Body:
 *   { skill_id: number, raw_body?: string, verification_checks?: string }
 *
 * When `raw_body` and `verification_checks` are omitted, the route loads
 * them from skill_registry. Auth: operator-only (matches approve/reject).
 */
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

  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, name, source_harness, raw_body, verification_checks,
              dispatch_status, completeness_pct
         FROM skill_registry
        WHERE id = ?`
    )
    .get(skillId) as
    | {
        id: number;
        name: string | null;
        source_harness: string;
        raw_body: string;
        verification_checks: string | null;
        dispatch_status: string;
        completeness_pct: number;
      }
    | undefined;

  if (!row) {
    return Response.json(
      { ok: false, error: `Skill id=${skillId} not found in registry` },
      { status: 404 }
    );
  }

  // Optional body overrides for re-running the pipeline against
  // experimental content (used by integration tests + by the operator
  // when re-evaluating after a manual fix).
  const overrideBody =
    typeof body["raw_body"] === "string" ? (body["raw_body"] as string) : null;
  const overrideChecks =
    typeof body["verification_checks"] === "string"
      ? (body["verification_checks"] as string)
      : null;

  const rawBody = overrideBody ?? row.raw_body ?? "";
  const checks = overrideChecks ?? row.verification_checks ?? null;

  const { runQuarantinePipeline } = await import("@/lib/skills/skill-quarantine");
  const result = runQuarantinePipeline(db, row.id, rawBody, checks);

  return Response.json({
    ok: true,
    skill_id: row.id,
    name: row.name,
    source_harness: row.source_harness,
    advanced_to: result.advancedTo,
    blocked: result.blocked,
    reason: result.reason ?? null,
    record: result.record,
  });
}

// ---------------------------------------------------------------------------
// Auth helper moved to ./auth so the GET route file does not export a
// non-handler symbol (Next.js route files only allow GET/POST/PUT/etc.).
// ---------------------------------------------------------------------------
