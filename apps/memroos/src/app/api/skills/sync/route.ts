/**
 * GET /api/skills/sync
 *
 * Per-skill sync observability. Returns one entry per (skill_name,
 * source_harness) tracked in `skill_sync_state`, including:
 *   - skill_name, source_harness
 *   - last_synced_hash: hash of the last accepted sync
 *   - pending_proposal_id: UUID of a pending proposal, or null
 *   - drift: true when a pending proposal exists AND the detected hash
 *            differs from the last_synced hash
 *   - version_pinned_to: version pin, or null (suppresses drift)
 *   - last_check_at: ISO timestamp of the most recent scan
 *   - status: pending | approved | rejected | no_change
 *
 * Filters:
 *   ?pending_only=1   — only show rows with a pending proposal
 *   ?pinned_only=1    — only show rows with an active version pin
 *   ?limit=           — 1..200 (default 50)
 *   ?offset=          — default 0
 *
 * Read-only — no auth required (mirrors /api/skills/quarantine GET).
 *
 * Phase 149 / SKILLTRUST-04 — Governed cross-harness auto-sync.
 */

import { getDb } from "@/lib/db";
import { listSyncObservability } from "@/lib/skills/skill-sync";

export const dynamic = "force-dynamic";

function parseBoolean(raw: string | null): boolean {
  if (!raw) return false;
  const norm = raw.trim().toLowerCase();
  return norm === "1" || norm === "true" || norm === "yes" || norm === "on";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pendingOnly = parseBoolean(url.searchParams.get("pending_only"));
  const pinnedOnly = parseBoolean(url.searchParams.get("pinned_only"));
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
  const offset =
    Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const db = getDb();
  const items = listSyncObservability(db, {
    pending_only: pendingOnly,
    pinned_only: pinnedOnly,
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
      pending_only: pendingOnly,
      pinned_only: pinnedOnly,
    },
  });
}
