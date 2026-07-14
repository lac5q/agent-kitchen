/**
 * POST /api/skills/lifecycle
 *
 * Applies a lifecycle state transition to a skill. Body:
 *   {
 *     skill_id: number,
 *     to_state: 'enabled' | 'deprecated' | 'retired',
 *     actor:    string,
 *     reason?:  string  (required for enabled->deprecated)
 *   }
 *
 * Phase 150 / SKILLTRUST-05 — Skill Lifecycle Manager.
 *
 * Auth: operator-only — 401 when no operator key is configured,
 * 403 when a key is configured but not supplied / mismatched.
 * Loopback requests (127.0.0.1 / localhost) are always authorized.
 */

import { getDb } from "@/lib/db";
import {
  SKILL_LIFECYCLE_STATES,
  transitionLifecycleState,
  LifecycleTransitionError,
  type SkillLifecycleState,
} from "@/lib/skills/skill-lifecycle";
import { authorizeQuarantineWrite } from "../quarantine/_auth";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isLifecycleState(value: unknown): value is SkillLifecycleState {
  return (
    typeof value === "string" &&
    (SKILL_LIFECYCLE_STATES as readonly string[]).includes(value)
  );
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
    return Response.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }
  if (!isRecord(body)) {
    return Response.json(
      { ok: false, error: "Body must be an object" },
      { status: 400 }
    );
  }

  const skillIdRaw = body["skill_id"];
  const skillId =
    typeof skillIdRaw === "number" ? skillIdRaw : Number(skillIdRaw);
  if (!Number.isInteger(skillId) || skillId <= 0) {
    return Response.json(
      { ok: false, error: "skill_id must be a positive integer" },
      { status: 400 }
    );
  }

  if (!isLifecycleState(body["to_state"])) {
    return Response.json(
      {
        ok: false,
        error:
          `to_state must be one of ${SKILL_LIFECYCLE_STATES.join(", ")} ` +
          "(from_state is read from the registry; draft is the initial state)",
      },
      { status: 400 }
    );
  }
  const toState = body["to_state"] as SkillLifecycleState;

  if (typeof body["actor"] !== "string" || !body["actor"].trim()) {
    return Response.json(
      { ok: false, error: "actor is required (non-empty string)" },
      { status: 400 }
    );
  }
  const actor = body["actor"].trim();

  const reason =
    typeof body["reason"] === "string" ? body["reason"].trim() : "";

  const db = getDb();
  try {
    const result = transitionLifecycleState(db, skillId, toState, actor, reason);
    return Response.json({
      ok: true,
      skill_id: result.skill_id,
      previous_state: result.previous_state,
      lifecycle_state: result.lifecycle_state,
      notifications: result.notifications,
      audit: {
        id: result.audit.id,
        actor: result.audit.actor,
        reason: result.audit.reason,
        from_state: result.audit.from_state,
        to_state: result.audit.to_state,
        transitioned_at: result.audit.transitioned_at,
      },
    });
  } catch (err) {
    if (err instanceof LifecycleTransitionError) {
      return Response.json(
        { ok: false, error: err.message, code: "lifecycle_transition" },
        { status: 409 }
      );
    }
    return Response.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Internal error during lifecycle transition",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/skills/lifecycle
 *
 * Read-only observability endpoint for the lifecycle subsystem:
 *   ?skill_id=N         -- lifecycle audit trail for a single skill
 *   ?state=deprecated   -- list of skills currently in a given state
 *   ?include_dependents=1 -- include the dependent list per skill
 *
 * No auth required (matches /api/skills/quarantine and /api/skills/sync
 * which are also read-only and used by the operator dashboard).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const skillIdRaw = url.searchParams.get("skill_id");
  const state = url.searchParams.get("state");
  const includeDependents =
    url.searchParams.get("include_dependents") === "1";

  const db = getDb();

  const { getLifecycleAuditTrail, getDependents, listDeprecatedSkills } =
    await import("@/lib/skills/skill-lifecycle");

  if (skillIdRaw) {
    const skillId = Number(skillIdRaw);
    if (!Number.isInteger(skillId) || skillId <= 0) {
      return Response.json(
        { ok: false, error: "skill_id must be a positive integer" },
        { status: 400 }
      );
    }
    const audit = getLifecycleAuditTrail(db, { skillId });
    const current = db
      .prepare<[number], { lifecycle_state: string; dispatch_status: string }>(
        `SELECT lifecycle_state, dispatch_status FROM skill_registry WHERE id = ? LIMIT 1`
      )
      .get(skillId);
    return Response.json({
      ok: true,
      skill_id: skillId,
      lifecycle_state: current?.lifecycle_state ?? null,
      dispatch_status: current?.dispatch_status ?? null,
      audit_trail: audit,
      dependents: includeDependents ? getDependents(db, skillId) : undefined,
    });
  }

  if (state === "deprecated") {
    const list = listDeprecatedSkills(db);
    return Response.json({
      ok: true,
      state: "deprecated",
      items: list,
      total: list.length,
    });
  }

  if (state && (SKILL_LIFECYCLE_STATES as readonly string[]).includes(state)) {
    const rows = db
      .prepare<[string], { id: number; name: string | null; source_harness: string; dispatch_status: string }>(
        `SELECT id, name, source_harness, dispatch_status
           FROM skill_registry
          WHERE lifecycle_state = ?
          ORDER BY id DESC
          LIMIT 200`
      )
      .all(state);
    return Response.json({
      ok: true,
      state,
      items: rows,
      total: rows.length,
    });
  }

  return Response.json({
    ok: true,
    lifecycle_states: SKILL_LIFECYCLE_STATES,
    note:
      "Pass ?skill_id=N for a per-skill audit trail or ?state=<state> to list skills in that state.",
  });
}
