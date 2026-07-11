/**
 * GET /api/skills/sync/proposals
 *
 * Lists pending sync proposals from `skill_sync_state`. Each proposal
 * carries the operator-visible state: skill_name, source_harness,
 * base/candidate hashes, the diff summary/payload, the operator who
 * proposed it, and the pending detected hash for re-verification on
 * approval.
 *
 * Filters:
 *   ?status=pending|approved|rejected|no_change (default: all rows with
 *     pending_proposal_id IS NOT NULL).
 *   ?source_harness=claude|codex|hermes|opencode
 *   ?skill_name=...
 *   ?limit= (1..200, default 50)
 *   ?offset= (default 0)
 *
 * Read-only — no auth required (mirrors the public-read convention
 * used by /api/skills/import GET and /api/skills/quarantine GET).
 *
 * Phase 149 (continued) / SKILLTRUST-04 — Governed cross-harness auto-sync.
 */

import { getDb } from "@/lib/db";
import {
  listSyncObservability,
  SkillSyncError,
} from "@/lib/skills/skill-sync";

export const dynamic = "force-dynamic";

interface ProposalViewRow {
  proposal_id: string;
  skill_name: string;
  source_harness: string;
  status: string;
  pending_detected_hash: string | null;
  last_synced_hash: string | null;
  pending_diff_summary: string | null;
  pending_diff_payload: string | null;
  pending_proposed_by: string | null;
  pending_proposed_at: string | null;
  version_pinned_to: string | null;
  last_check_at: string;
  updated_at: string;
}

function parseStatusFilter(raw: string | null): string | null {
  if (!raw) return null;
  const norm = raw.trim().toLowerCase();
  if (["pending", "approved", "rejected", "no_change"].includes(norm)) {
    return norm;
  }
  throw new SkillSyncError(
    `Invalid status '${raw}'. Valid: pending|approved|rejected|no_change`
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  let statusFilter: string | null;
  try {
    statusFilter = parseStatusFilter(url.searchParams.get("status"));
  } catch (err) {
    if (err instanceof SkillSyncError) {
      return Response.json({ ok: false, error: err.message }, { status: 400 });
    }
    throw err;
  }
  const sourceHarness = url.searchParams.get("source_harness");
  const skillName = url.searchParams.get("skill_name");
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
  const offset =
    Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const db = getDb();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (statusFilter === "pending") {
    conditions.push(
      "pending_proposal_id IS NOT NULL AND approved_at IS NULL AND rejected_at IS NULL"
    );
  } else if (statusFilter === "approved") {
    conditions.push("approved_at IS NOT NULL");
  } else if (statusFilter === "rejected") {
    conditions.push("rejected_at IS NOT NULL");
  } else if (statusFilter === "no_change") {
    conditions.push(
      "pending_proposal_id IS NULL AND approved_at IS NULL AND rejected_at IS NULL"
    );
  }
  if (sourceHarness) {
    conditions.push("source_harness = ?");
    params.push(sourceHarness);
  }
  if (skillName) {
    conditions.push("skill_name = ?");
    params.push(skillName);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare<unknown[], ProposalViewRow>(
      `SELECT pending_proposal_id AS proposal_id,
              skill_name,
              source_harness,
              CASE
                WHEN pending_proposal_id IS NOT NULL AND approved_at IS NULL AND rejected_at IS NULL
                  THEN 'pending'
                WHEN approved_at IS NOT NULL THEN 'approved'
                WHEN rejected_at IS NOT NULL THEN 'rejected'
                ELSE 'no_change'
              END AS status,
              pending_detected_hash,
              last_synced_hash,
              pending_diff_summary,
              pending_diff_payload,
              pending_proposed_by,
              pending_proposed_at,
              version_pinned_to,
              last_check_at,
              updated_at
         FROM skill_sync_state
         ${where}
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  const items = rows.map((row) => {
    let diffSummaryObject: Record<string, unknown> | null = null;
    if (row.pending_diff_payload) {
      try {
        const parsed = JSON.parse(row.pending_diff_payload) as unknown;
        if (isRecord(parsed)) {
          diffSummaryObject = {
            detected_hash:
              typeof parsed["detected_hash"] === "string"
                ? (parsed["detected_hash"] as string)
                : row.pending_detected_hash,
            current_hash:
              typeof parsed["current_hash"] === "string"
                ? (parsed["current_hash"] as string)
                : null,
            detected_version:
              typeof parsed["detected_version"] === "string"
                ? (parsed["detected_version"] as string)
                : null,
            current_version:
              typeof parsed["current_version"] === "string"
                ? (parsed["current_version"] as string)
                : null,
            source_file_path:
              typeof parsed["source_file_path"] === "string"
                ? (parsed["source_file_path"] as string)
                : null,
            source_root:
              typeof parsed["source_root"] === "string"
                ? (parsed["source_root"] as string)
                : null,
          };
        }
      } catch {
        /* ignore malformed payload */
      }
    }
    return {
      proposal_id: row.proposal_id,
      skill_name: row.skill_name,
      source_harness: row.source_harness,
      status: row.status,
      base_hash: row.last_synced_hash,
      candidate_hash: row.pending_detected_hash,
      summary: row.pending_diff_summary,
      diff: diffSummaryObject,
      proposed_by: row.pending_proposed_by,
      proposed_at: row.pending_proposed_at,
      version_pinned_to: row.version_pinned_to,
      last_check_at: row.last_check_at,
      updated_at: row.updated_at,
    };
  });

  const observability = listSyncObservability(db, { limit: 200 });
  const driftCount = observability.filter((o) => o.drift).length;
  const pinnedCount = observability.filter(
    (o) => o.version_pinned_to !== null
  ).length;

  return Response.json({
    ok: true,
    items,
    total: items.length,
    limit,
    offset,
    filters: {
      status: statusFilter,
      source_harness: sourceHarness,
      skill_name: skillName,
    },
    counters: {
      drifting: driftCount,
      pinned: pinnedCount,
    },
  });
}
