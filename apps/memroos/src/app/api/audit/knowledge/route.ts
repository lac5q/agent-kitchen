/**
 * Phase 125 / ENTOPS-03: Central knowledge-audit ingest.
 *
 * POST /api/audit/knowledge
 *
 * Called by the Python knowledge MCP server on every write/read/delete in
 * OPERATOR MODE (`MEMROOS_APP_URL` + `MEMROOS_AGENT_API_KEY` set). The
 * endpoint authenticates the caller via the shared MEMROOS_AGENT_API_KEY
 * (same key the MCP carries as Authorization: Bearer), builds a
 * per-tenant hash-chained audit_entries row (mirrors agent-checkpoints),
 * and returns 201 + the entryHash.
 *
 * The MCP treats a non-201 response as fail-closed -- the knowledge op
 * is rejected, so audit cannot be silently dropped.
 *
 * Auth note:
 *   The request is `Authorization: Bearer ${MEMROOS_AGENT_API_KEY}`.
 *   We verify it matches `process.env.MEMROOS_AGENT_API_KEY` (same env
 *   var the MCP uses). This is the same secret-matching shape as
 *   apps/memroos/src/lib/operator-auth.ts:hasOperatorKey, applied here
 *   to the agent-level key the MCP carries.
 */

import { NextRequest } from "next/server";
import { z } from "zod";

import { buildKnowledgeAuditEntry } from "@/lib/audit/knowledge-chain";
import { writeAuditEntry } from "@/lib/audit/write";
import type { NewAuditEntry } from "@/lib/audit/schema";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tenant_id: z.string().min(1).max(128),
  user_id: z.string().min(1).max(128).optional(),
  agent_id: z.string().min(1).max(128),
  operation: z.enum(["write", "read", "delete", "search"]),
  path: z.string().min(1).max(2048),
  op_hash: z.string().min(8).max(128),
});

function extractBearer(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Validates the caller presents the same MEMROOS_AGENT_API_KEY the MCP
 * server is configured with. Both must be non-empty.
 */
function verifyAgentApiKey(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.MEMROOS_AGENT_API_KEY?.trim() ?? "";
  if (!expected) {
    // Operator mode disabled -- the MCP should not be posting in solo.
    return { ok: false, status: 503, error: "central audit disabled (no MEMROOS_AGENT_API_KEY)" };
  }
  const presented = extractBearer(req);
  if (!presented) {
    return { ok: false, status: 401, error: "missing bearer token" };
  }
  if (!safeEqual(presented, expected)) {
    return { ok: false, status: 403, error: "invalid api key" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const auth = verifyAgentApiKey(req);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: "validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;
  const db = getDb();

  // Ensure the tenant row exists before the audit INSERT -- audit_entries.tenant_id
  // REFERENCES tenants(id), and a knowledge op may be the first event for a tenant
  // that the core app has not seeded yet (e.g. a vault-only tenant). INSERT OR IGNORE
  // is idempotent and never clobbers an existing named tenant.
  db.prepare("INSERT OR IGNORE INTO tenants (id, name) VALUES (?, ?)").run(
    body.tenant_id,
    body.tenant_id
  );

  const entry = buildKnowledgeAuditEntry(db, {
    tenantId: body.tenant_id,
    actorId: body.agent_id,
    actorRole: "system",
    agentId: body.agent_id,
    userId: body.user_id ?? null,
    operation: body.operation,
    path: body.path,
    opHash: body.op_hash,
    reason: `knowledge ${body.operation} on ${body.path} by ${body.agent_id}`,
  });

  const newEntry: NewAuditEntry = {
    id: entry.id,
    tenant_id: entry.tenantId,
    actor_id: entry.actorId,
    actor_role: entry.actorRole as NewAuditEntry["actor_role"],
    event_type: entry.eventType as NewAuditEntry["event_type"],
    entity_type: entry.entityType as NewAuditEntry["entity_type"],
    entity_id: entry.entityId,
    reason: entry.reason,
    metadata_json: entry.metadata_json,
    created_at: entry.created_at,
  };

  try {
    writeAuditEntry(newEntry, db);
  } catch (err) {
    // INSERT failures in this table are exclusively due to the
    // append-only triggers or schema mismatches. Both are permanent --
    // do not retry silently.
    return Response.json(
      { error: "audit write failed", detail: String((err as Error)?.message ?? err) },
      { status: 500 }
    );
  }

  // Extract entryHash from the stored metadata for caller confirmation.
  let entryHash = "";
  try {
    const stored = JSON.parse(entry.metadata_json) as Record<string, unknown>;
    if (typeof stored.entryHash === "string") entryHash = stored.entryHash;
  } catch {
    // unreachable -- buildKnowledgeAuditEntry always produces valid JSON
  }

  return Response.json(
    { ok: true, id: entry.id, entryHash, tenantId: entry.tenantId },
    { status: 201 }
  );
}
