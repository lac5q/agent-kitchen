/**
 * POST /api/skills/proposals
 *
 * Records a cross-harness skill change detection as an import proposal.
 * Body:
 *   {
 *     source_harness: string,
 *     skill_name: string,
 *     version?: string | null,
 *     detected_content_hash?: string,       // 64-char SHA-256 hex
 *     detected_content_body?: string,       // alternative — hashed in-place
 *     proposed_by: string,
 *     diff_summary?: string,
 *     diff_payload?: object
 *   }
 *
 * Detection NEVER mutates skill_registry. A pending proposal is created
 * when the detected hash differs from the registry row's current hash;
 * identical-hash detections are recorded as approved (no-change) so the
 * audit trail still surfaces the scan, but no operator action is needed.
 *
 * Auth: operator-only.
 *
 * GET /api/skills/proposals
 *
 * Lists import proposals. Supports ?status=, ?source_harness=,
 * ?skill_name=, ?limit=, ?offset= filters. Read-only — no auth required
 * (mirrors the /api/skills/import GET convention).
 *
 * Phase 149 / SKILLTRUST-04 — Governed cross-harness auto-sync.
 */

import { getDb } from "@/lib/db";
import {
  detectSkillChange,
  listImportProposals,
  PROPOSAL_STATUSES,
  SyncGovernanceError,
  type ProposalStatus,
} from "@/lib/skills/skill-sync-governance";
import { authorizeSyncWrite } from "../_sync-auth";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isProposalStatus(value: string): value is ProposalStatus {
  return (PROPOSAL_STATUSES as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const statusRaw = url.searchParams.get("status");
  const sourceHarnessRaw = url.searchParams.get("source_harness");
  const skillNameRaw = url.searchParams.get("skill_name");
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  let status: ProposalStatus | undefined;
  if (statusRaw) {
    if (!isProposalStatus(statusRaw)) {
      return Response.json(
        {
          ok: false,
          error: `Invalid status '${statusRaw}'. Valid values: ${PROPOSAL_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }
    status = statusRaw;
  }

  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const db = getDb();
  const items = listImportProposals(db, {
    ...(status ? { status } : {}),
    ...(sourceHarnessRaw ? { source_harness: sourceHarnessRaw } : {}),
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
      status: status ?? null,
      source_harness: sourceHarnessRaw,
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

  const sourceHarness = body["source_harness"];
  const skillName = body["skill_name"];
  const proposedBy = body["proposed_by"];

  if (typeof sourceHarness !== "string" || !sourceHarness.trim()) {
    return Response.json(
      { ok: false, error: "source_harness is required (string)" },
      { status: 400 }
    );
  }
  if (typeof skillName !== "string" || !skillName.trim()) {
    return Response.json(
      { ok: false, error: "skill_name is required (string)" },
      { status: 400 }
    );
  }
  if (typeof proposedBy !== "string" || !proposedBy.trim()) {
    return Response.json(
      { ok: false, error: "proposed_by is required (string)" },
      { status: 400 }
    );
  }

  const versionRaw = body["version"];
  if (
    versionRaw !== undefined &&
    versionRaw !== null &&
    (typeof versionRaw !== "string" || !versionRaw.trim())
  ) {
    return Response.json(
      { ok: false, error: "version must be a non-empty string when present" },
      { status: 400 }
    );
  }

  const hashRaw = body["detected_content_hash"];
  const bodyRaw = body["detected_content_body"];
  if (hashRaw !== undefined && hashRaw !== null && typeof hashRaw !== "string") {
    return Response.json(
      { ok: false, error: "detected_content_hash must be a string when present" },
      { status: 400 }
    );
  }
  if (bodyRaw !== undefined && bodyRaw !== null && typeof bodyRaw !== "string") {
    return Response.json(
      { ok: false, error: "detected_content_body must be a string when present" },
      { status: 400 }
    );
  }
  if (
    (hashRaw === undefined || hashRaw === null) &&
    (bodyRaw === undefined || bodyRaw === null)
  ) {
    return Response.json(
      {
        ok: false,
        error:
          "Either detected_content_hash or detected_content_body is required",
      },
      { status: 400 }
    );
  }

  const diffPayloadRaw = body["diff_payload"];
  let diffPayload: Record<string, unknown> | undefined;
  if (diffPayloadRaw !== undefined && diffPayloadRaw !== null) {
    if (!isRecord(diffPayloadRaw)) {
      return Response.json(
        { ok: false, error: "diff_payload must be a JSON object when present" },
        { status: 400 }
      );
    }
    diffPayload = diffPayloadRaw;
  }

  const db = getDb();
  try {
    const result = detectSkillChange(db, {
      source_harness: sourceHarness.trim(),
      skill_name: skillName.trim(),
      ...(versionRaw !== undefined && versionRaw !== null
        ? { version: (versionRaw as string).trim() }
        : {}),
      ...(hashRaw !== undefined && hashRaw !== null
        ? { detected_content_hash: hashRaw as string }
        : {}),
      ...(bodyRaw !== undefined && bodyRaw !== null
        ? { detected_content_body: bodyRaw as string }
        : {}),
      proposed_by: proposedBy.trim(),
      ...(typeof body["diff_summary"] === "string"
        ? { diff_summary: body["diff_summary"] as string }
        : {}),
      ...(diffPayload ? { diff_payload: diffPayload } : {}),
    });

    return Response.json({
      ok: true,
      created: result.created,
      unchanged: result.unchanged,
      proposal: result.proposal,
    });
  } catch (err) {
    if (err instanceof SyncGovernanceError) {
      return Response.json({ ok: false, error: err.message }, { status: 400 });
    }
    return Response.json(
      {
        ok: false,
        error: `Proposal creation failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
