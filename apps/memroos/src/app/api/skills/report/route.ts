/**
 * POST /api/skills/report
 *
 * Agents report observations about skills (usage, success, failure, etc.).
 * Reports are OBSERVATIONS ONLY -- they cannot promote trust, enable skills,
 * pin versions, or approve quarantined skills. Only operators can mutate
 * the governed registry.
 *
 * Security contract (VAL-SKILL-020):
 *   - The reporter must authenticate with a valid non-revoked agent API key
 *     (enforced by authenticateAgentHeaders).
 *   - The reported skill must reference an existing registry row, OR be
 *     surfaced as 'unresolved' rather than creating or enabling a skill.
 *   - "Trust grant" actions (enable, trust, pin, approve, activate, certify,
 *     deploy, register, create) are rejected; only observation actions
 *     (observed, used, success, failure, error, retired) are accepted.
 *   - The endpoint never inserts into skill_registry or skill_quarantine,
 *     never updates dispatch_status, never writes to skill_version_pins or
 *     skill_import_proposals.
 *
 * Auth: agent API key (Bearer token).
 */
import {
  authenticateAgentHeaders,
  recordSkillReport,
} from "@/lib/agent/registry";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * VAL-SKILL-020: action vocabulary is restricted to observation verbs.
 * Any action that could mutate the registry (enable, trust, pin, approve,
 * activate, certify, deploy, register, create, etc.) is rejected.
 */
const ALLOWED_REPORT_ACTIONS = new Set<string>([
  "observed",
  "used",
  "success",
  "failure",
  "error",
  "retired",
  "deprecated",
  "missing",
  "ambiguous",
  "unresolved",
]);

const TRUST_GRANT_ACTIONS = new Set<string>([
  "enable",
  "enabled",
  "trust",
  "trusted",
  "verify",
  "verified",
  "approve",
  "approved",
  "pin",
  "pinned",
  "activate",
  "activated",
  "certify",
  "certified",
  "deploy",
  "deployed",
  "register",
  "registered",
  "create",
  "created",
  "promote",
  "promoted",
  "import",
  "imported",
]);

interface SkillLookupRow {
  id: number;
  name: string;
  source_harness: string;
  version: string | null;
}

/**
 * Look up a skill registry row by id, name, or (name, source_harness). Returns
 * the resolved identity or null when the report references an unknown skill.
 */
function resolveSkillIdentity(
  skillId: string,
  metadata: Record<string, unknown>
): SkillLookupRow | null {
  const db = getDb();

  // Prefer explicit skill_id (registry row id).
  const numericId = Number(skillId);
  if (Number.isFinite(numericId) && numericId > 0) {
    const row = db
      .prepare<[number], SkillLookupRow>(
        `SELECT id, name, source_harness, version
           FROM skill_registry
          WHERE id = ?`
      )
      .get(numericId);
    if (row) return row;
  }

  // Otherwise treat skillId as a skill name (most common agent-facing shape).
  const sourceHarness =
    typeof metadata["source_harness"] === "string"
      ? (metadata["source_harness"] as string)
      : null;

  if (sourceHarness) {
    const row = db
      .prepare<[string, string], SkillLookupRow>(
        `SELECT id, name, source_harness, version
           FROM skill_registry
          WHERE name = ? AND source_harness = ?`
      )
      .get(skillId, sourceHarness);
    if (row) return row;
  }

  const anyRow = db
    .prepare<[string], { count: number }>(
      `SELECT COUNT(*) AS count
         FROM skill_registry
        WHERE name = ?`
    )
    .get(skillId);
  if ((anyRow?.count ?? 0) > 0) {
    // Multiple harnesses share the name; resolve to the first row to
    // surface as ambiguous. The report itself is still an observation.
    const first = db
      .prepare<[string], SkillLookupRow>(
        `SELECT id, name, source_harness, version
           FROM skill_registry
          WHERE name = ?
          ORDER BY imported_at DESC
          LIMIT 1`
      )
      .get(skillId) ?? null;
    return first;
  }

  return null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const agentIdHint =
    isRecord(body) && typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(request.headers, agentIdHint);
  if (!agent) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (
    !isRecord(body) ||
    typeof body.skillId !== "string" ||
    typeof body.action !== "string"
  ) {
    return Response.json(
      { ok: false, error: "skillId and action are required" },
      { status: 400 }
    );
  }

  const skillId = body.skillId;
  const action = body.action;
  const metadata = isRecord(body.metadata) ? body.metadata : {};

  // VAL-SKILL-020: reject trust-grant actions. Reports cannot mutate the
  // registry; they are observations only.
  if (TRUST_GRANT_ACTIONS.has(action)) {
    return Response.json(
      {
        ok: false,
        error: `Action '${action}' is a trust grant and cannot be performed via /api/skills/report`,
        code: "TRUST_GRANT_REJECTED",
      },
      { status: 403 }
    );
  }

  // Allow only observation actions; reject anything else as untrusted input.
  if (!ALLOWED_REPORT_ACTIONS.has(action)) {
    return Response.json(
      {
        ok: false,
        error: `Action '${action}' is not a recognized observation verb`,
        code: "INVALID_ACTION",
      },
      { status: 400 }
    );
  }

  // VAL-SKILL-020: resolve the reported skill identity. Unknown skills are
  // recorded as 'unresolved' observations and never create registry rows.
  const resolved = resolveSkillIdentity(skillId, metadata);

  const enrichedMetadata = {
    ...metadata,
    agent_id: agent.id,
    resolved_skill_id: resolved?.id ?? null,
    resolved_skill_name: resolved?.name ?? null,
    resolved_source_harness: resolved?.source_harness ?? null,
    resolved_version: resolved?.version ?? null,
    observation_status: resolved ? "resolved" : "unresolved",
  };

  recordSkillReport(agent.id, {
    skillId,
    action,
    metadata: enrichedMetadata,
  });

  return Response.json({
    ok: true,
    agentId: agent.id,
    timestamp: new Date().toISOString(),
    observation: {
      skill_id: skillId,
      action,
      status: resolved ? "resolved" : "unresolved",
      resolved_identity: resolved ?? null,
    },
  });
}
