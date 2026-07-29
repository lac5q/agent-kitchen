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
import { authenticateAgentKey } from "@/lib/agent-registry";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tenant_id: z.string().min(1).max(128),
  // "No user" reaches this endpoint in two shapes and BOTH were rejected,
  // failing closed and killing every agent-initiated knowledge_search/read:
  //   - `null`, which `.optional()` refuses (it permits only `undefined`)
  //   - `""`, which store.py sends via `user_id=user_id or ""` and which
  //     `.min(1)` refuses
  // Normalize both to undefined before validating; the consumer below already
  // finishes the job with `?? null`.
  user_id: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.string().min(1).max(128).optional(),
  ),
  agent_id: z.string().min(1).max(128),
  operation: z.enum(["write", "read", "delete", "search"]),
  path: z.string().min(1).max(2048),
  op_hash: z.string().min(8).max(128),
});

/**
 * The audit bridge is an internal, host-local endpoint: its only caller is the
 * MCP server running beside the app, which reaches it over loopback.
 *
 * It sits in ROUTE_LOCAL_AUTH_API_ROUTES so the proxy lets it past the JWT
 * gate — necessary, because a server-side MCP process has no user session.
 * On a Tailscale-only host that is unremarkable, but oracle-1 is published to
 * the internet through a Cloudflare Tunnel, so without this check the route
 * would be reachable from anywhere with only a bearer key in front of it.
 *
 * Tunnelled and proxied traffic always arrives with forwarding headers; a
 * loopback call from the sibling MCP process does not. So the presence of
 * those headers is the signal that a request came from outside the host.
 *
 * Escape hatch for deployments that genuinely front this with their own proxy:
 * MEMROOS_AUDIT_ALLOW_REMOTE=1.
 */
function isHostLocalRequest(req: NextRequest): boolean {
  if (process.env.MEMROOS_AUDIT_ALLOW_REMOTE === "1") return true;

  // Any of these means the request traversed a proxy/tunnel to get here.
  for (const h of ["x-forwarded-for", "x-real-ip", "cf-connecting-ip", "cf-ray"]) {
    if (req.headers.get(h)) return false;
  }

  try {
    const host = new URL(req.url).hostname;
    return (
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "localhost" ||
      // Compose service name — the MCP and app share a Docker network.
      host === "memroos"
    );
  } catch {
    // An unparseable URL is not something to fail open on.
    return false;
  }
}

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
  const presented = extractBearer(req);
  if (!presented) {
    return { ok: false, status: 401, error: "missing bearer token" };
  }

  // Per-agent keys are the real deployment shape: onboarding issues one
  // `ak_…` per agent per host (cordant-hermes-01:pi, :claude, :codex, …) and
  // memroos-mcp.sh loads that agent's own key into MEMROOS_AGENT_API_KEY. A
  // single shared server-side secret cannot match five distinct agent keys,
  // so comparing against one env value rejected every real caller. This path
  // is also strictly stronger: keys are stored hashed, checked against
  // revoked_at, and resolve to a named agent for the audit row.
  if (presented.startsWith("ak_") && authenticateAgentKey(presented)) {
    return { ok: true };
  }

  // Shared-secret fallback, retained for deployments that configure one.
  const expected = process.env.MEMROOS_AGENT_API_KEY?.trim() ?? "";
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "central audit disabled (no per-agent key matched and no MEMROOS_AGENT_API_KEY)",
    };
  }
  if (!safeEqual(presented, expected)) {
    return { ok: false, status: 403, error: "invalid api key" };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  // Origin check first: a remote caller should learn nothing about whether a
  // key is valid, so this runs before the bearer is even inspected.
  if (!isHostLocalRequest(req)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

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

  // The chain tip read (buildKnowledgeAuditEntry -> previousKnowledgeEntryHash)
  // and the INSERT must be atomic and serialized: two concurrent same-tenant
  // POSTs must not both read the same tip and fork the chain. `.immediate()`
  // takes the SQLite write lock at BEGIN so the read+write is a single critical
  // section across connections, not a TOCTOU window.
  let entry: ReturnType<typeof buildKnowledgeAuditEntry>;
  try {
    entry = db.transaction(() => {
      // Ensure the tenant row exists before the audit INSERT -- audit_entries.tenant_id
      // REFERENCES tenants(id), and a knowledge op may be the first event for a tenant
      // that the core app has not seeded yet (e.g. a vault-only tenant). INSERT OR IGNORE
      // is idempotent and never clobbers an existing named tenant.
      db.prepare("INSERT OR IGNORE INTO tenants (id, name) VALUES (?, ?)").run(
        body.tenant_id,
        body.tenant_id
      );

      const built = buildKnowledgeAuditEntry(db, {
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
        id: built.id,
        tenant_id: built.tenantId,
        actor_id: built.actorId,
        actor_role: built.actorRole as NewAuditEntry["actor_role"],
        event_type: built.eventType as NewAuditEntry["event_type"],
        entity_type: built.entityType as NewAuditEntry["entity_type"],
        entity_id: built.entityId,
        reason: built.reason,
        metadata_json: built.metadata_json,
        created_at: built.created_at,
      };

      writeAuditEntry(newEntry, db);
      return built;
    }).immediate();
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
