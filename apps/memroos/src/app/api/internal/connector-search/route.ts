/**
 * CORDANT-HERMES-RECALL-01: GET /api/internal/connector-search
 *
 * Loopback-only fallback for hosts where the host-side `memory_recall` MCP
 * process (scripts/memroos-mcp.sh, running outside Docker) cannot read
 * conversations.db directly because it lives inside a Docker-managed named
 * volume (e.g. cordant-hermes-01: /var/lib/docker/volumes/.../_data is
 * root-only, not traversable by the `ubuntu` host user). The container
 * already binds this app to 127.0.0.1, so the host process can reach it
 * over HTTP instead of the filesystem.
 *
 * Auth reuses `authorizeRegistryWrite` — the same loopback-or-operator-key
 * gate already used by GET /api/recall — rather than a bespoke scheme.
 * `MEMROOS_INTERNAL_API_KEY` is NOT used here: that key already has a
 * distinct meaning (hashed into `tenant_api_keys` for public-v1 tenant
 * auth in db-schema.ts); reusing it for raw internal message-content read
 * would silently widen what that key grants.
 *
 * Not part of the public API surface — deliberately outside /api/public/v1.
 * Returns raw matched rows; the Python caller (memory_recall.py) owns
 * source/title/id derivation so that formatting logic lives in exactly one
 * place, not duplicated across languages.
 */
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { authorizeRegistryWrite } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

interface ConnectorRow {
  id: number;
  session_id: string;
  request_id: string | null;
  content: string;
  timestamp: string;
  space_id: string | null;
  rank: number | null;
}

// The space gate is applied in SQL, before LIMIT — not by filtering the
// result set afterwards. Post-filtering would silently shrink a member's
// page: ask for 10, get however many of that top-10 happened to be visible.
const SQL = `
  SELECT m.id, m.session_id, m.request_id, m.content, m.timestamp, m.space_id,
         bm25(messages_fts) AS rank
  FROM messages_fts
  JOIN messages m ON m.id = messages_fts.rowid
  WHERE messages_fts MATCH ?
    AND m.role = 'connector'
    AND m.policy = 'indexable'
    AND m.visibility IN ('internal', 'public_safe', 'public_approved')
    AND (
      m.space_id IS NULL
      OR EXISTS (
        SELECT 1 FROM space_members sm
        WHERE sm.space_id = m.space_id AND sm.member_id = ?
      )
    )
  ORDER BY rank
  LIMIT ?
`;

export async function GET(req: NextRequest) {
  if (!authorizeRegistryWrite(req)) {
    return NextResponse.json({ status: "error", error: "unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").trim();
  if (!query) {
    return NextResponse.json({ status: "error", error: "q is required" }, { status: 400 });
  }
  const limitRaw = Number(searchParams.get("limit") ?? "10");
  const limit = Math.max(1, Math.min(20, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 10));

  // Space-scoped connector rows (e.g. per-connection Notion spaces) are only
  // readable by members. This endpoint bypasses the normal recall route, so it
  // must apply the same gate itself or it becomes the bypass — loopback auth
  // says "this process may ask", not "this process may read everything".
  //
  // Identity comes from the MCP caller (memory_recall passes its resolved
  // MEMROOS_USER_ID / MEMROOS_AGENT_ID). It is a self-asserted parameter from
  // a trusted loopback process, so this gate is defense-in-depth and scoping,
  // NOT a trust boundary against a hostile caller — anything able to reach
  // loopback could assert any id. The boundary is authorizeRegistryWrite above.
  //
  // Absent identity matches no space_members row, so space-scoped content
  // stays hidden — fail closed.
  const actorId = (searchParams.get("user_id") ?? searchParams.get("agent_id") ?? "").trim();

  try {
    const db = getDb();
    const stmt = db.prepare(SQL);
    // Same phrase-first, plain-fallback pattern as recallByKeyword (db-ingest.ts):
    // FTS5 raises on unbalanced quotes / bare metacharacters in the query text.
    let rows: ConnectorRow[];
    try {
      rows = stmt.all(`"${query}"`, actorId, limit) as ConnectorRow[];
      if (rows.length === 0) {
        rows = stmt.all(query, actorId, limit) as ConnectorRow[];
      }
    } catch {
      rows = stmt.all(query, actorId, limit) as ConnectorRow[];
    }

    return NextResponse.json({ status: "ok", results: rows });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
