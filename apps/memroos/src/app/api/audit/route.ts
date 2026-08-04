import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { authenticateUser } from "@/lib/auth/session";
import { CAPABILITY, requireCapability } from "@/lib/auth/capabilities";
import { queryAuditEntries } from "@/lib/audit/query";
import type { AuditQueryFilter } from "@/lib/audit/schema";
import type { AuditEventType } from "@/lib/audit/event-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit
 *
 * Returns paginated audit entries. Accessible by reviewer, operator, admin.
 *
 * Query params: agentId, eventType, actorId, tenantId, from, to, limit, cursor
 */
export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  const capabilityError = requireCapability(session, CAPABILITY.AUDIT_READ);
  if (capabilityError) return capabilityError;
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });

  const url = req.nextUrl ?? new URL(req.url);
  const sp = url.searchParams;

  const filter: AuditQueryFilter = {
    agentId: sp.get("agentId") ?? undefined,
    eventType: (sp.get("eventType") ?? undefined) as AuditEventType | undefined,
    actorId: sp.get("actorId") ?? undefined,
    tenantId: sp.get("tenantId") ?? session.tenantId,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    limit: sp.has("limit") ? Math.min(200, Math.max(1, parseInt(sp.get("limit")!, 10))) : 50,
    cursor: sp.get("cursor") ?? undefined,
  };

  // Handle multi-value eventType (comma-separated)
  const rawEventType = sp.get("eventType");
  if (rawEventType && rawEventType.includes(",")) {
    filter.eventType = rawEventType.split(",").map((s) => s.trim()) as AuditEventType[];
  }

  const db = getDb();
  const { entries, nextCursor } = queryAuditEntries(filter, db);

  return Response.json({ entries, nextCursor, total: entries.length });
}
