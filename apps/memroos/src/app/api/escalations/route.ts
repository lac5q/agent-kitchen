import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api-error";
import { getDb } from "@/lib/db";
import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { queryEscalations } from "@/lib/audit/query";
import { checkSlaBreaches } from "@/lib/audit/sla";

export const dynamic = "force-dynamic";

/**
 * GET /api/escalations
 *
 * Returns HIL escalations with SLA countdown. Lazy SLA breach check on each request.
 * Accessible by reviewer, operator, admin.
 *
 * Query params: status=open|resolved|sla_breached|all, tenantId, limit
 */
async function buildEscalationsResponse(req: NextRequest) {
  const session = await authenticateUser(req);
  const roleError = requireRole(session?.role, "reviewer");
  if (roleError) return roleError;
  if (!session) return apiError(401, "authentication required");

  const url = req.nextUrl ?? new URL(req.url);
  const sp = url.searchParams;
  const rawStatus = sp.get("status");
  const status =
    rawStatus === "open" ||
    rawStatus === "resolved" ||
    rawStatus === "sla_breached" ||
    rawStatus === "all"
      ? rawStatus
      : "open";

  const db = getDb();

  // Lazy SLA breach check before responding
  try {
    checkSlaBreaches(db);
  } catch (err) {
    // Non-fatal — log and continue with current data
    console.error("[escalations] SLA breach check failed:", err);
  }

  const escalations = queryEscalations(
    {
      status,
      tenantId: sp.get("tenantId") ?? session.tenantId,
      limit: sp.has("limit") ? Math.min(200, Math.max(1, parseInt(sp.get("limit")!, 10))) : 50,
    },
    db
  );

  const now = Date.now();
  const withCountdown = escalations.map((e) => ({
    ...e,
    slaRemainingMs: new Date(e.sla_deadline).getTime() - now,
  }));

  return Response.json({ escalations: withCountdown, timestamp: new Date().toISOString() });
}

export async function GET(req: NextRequest) {
  try {
    return await buildEscalationsResponse(req);
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
