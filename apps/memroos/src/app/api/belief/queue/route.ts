import type { NextRequest } from "next/server";

import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { listOpenReviews } from "@/lib/belief/promotion";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/belief/queue
 *
 * Lists open belief-review queue items for the operator console.
 * Operator or admin only.
 *
 * Query params:
 *   tenant: tenant id override (default: session tenant)
 *   limit:  1..200, default 50
 */
export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });

  const roleError = requireRole(session.role, "operator");
  if (roleError) return roleError;

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenant") || session.tenantId || "default-tenant";
  const limitParam = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? Math.min(200, Math.max(1, limitParam)) : 50;

  const items = listOpenReviews(getDb(), { tenantId, limit });
  return Response.json({ items, tenantId, timestamp: new Date().toISOString() });
}
