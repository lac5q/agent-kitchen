import { getDb } from "@/lib/db";
import { createLegalHold, releaseLegalHold, updateLegalHoldScope } from "@/lib/memory/retention-expiry";
import type { RetentionScope } from "@/lib/memory/retention-policy";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

type Body = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: Request): Promise<Response> {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  try {
    const body = (await request.json()) as Body;
    const action = asString(body.action, "action");
    const db = getDb();
    if (action === "create") {
      const hold = createLegalHold(db, {
        id: asOptionalString(body.id),
        tenantId: asOptionalString(body.tenantId),
        scope: asRecord(body.scope) as RetentionScope,
        reasonCode: asString(body.reasonCode, "reasonCode"),
        actorId: asString(body.actorId, "actorId"),
        expiresAt: asOptionalString(body.expiresAt) ?? null,
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      });
      return Response.json({ ok: true, hold });
    }
    if (action === "release") {
      const hold = releaseLegalHold(db, {
        tenantId: asOptionalString(body.tenantId),
        holdId: asString(body.holdId, "holdId"),
        actorId: asString(body.actorId, "actorId"),
        reason: asOptionalString(body.reason),
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      });
      return Response.json({ ok: true, hold });
    }
    if (action === "update_scope") {
      const hold = updateLegalHoldScope(db, {
        tenantId: asOptionalString(body.tenantId),
        holdId: asString(body.holdId, "holdId"),
        scope: asRecord(body.scope) as RetentionScope,
        actorId: asString(body.actorId, "actorId"),
        reason: asOptionalString(body.reason),
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      });
      return Response.json({ ok: true, hold });
    }
    return Response.json({ ok: false, error: `unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export function GET(request: Request): Response {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId") ?? "default-tenant";
  const rows = getDb()
    .prepare(
      `SELECT id, tenant_id, scope_json, reason_code, created_by, created_at, updated_by, updated_at,
              released_by, released_at, expires_at, status
       FROM memory_legal_holds
       WHERE tenant_id = ?
       ORDER BY created_at DESC, id DESC`
    )
    .all(tenantId);
  return Response.json({ ok: true, holds: rows });
}
