import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api-error";
import { getDb } from "@/lib/db";
import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { resolveEscalation } from "@/lib/audit/write";
import type { HilEscalation } from "@/lib/audit/schema";

export const dynamic = "force-dynamic";

/**
 * POST /api/escalations/:id/resolve
 *
 * Resolves an open HIL escalation. Operator and admin only (reviewer gets 403).
 *
 * Body: { note?: string }
 */
async function buildResolveEscalationResponse(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await authenticateUser(req);
  const roleError = requireRole(session?.role, "operator");
  if (roleError) return roleError;
  if (!session) return apiError(401, "authentication required");

  const { id } = await params;
  if (!id) {
    return apiError(400, "escalation id is required");
  }

  let note: string | undefined;
  try {
    const body = await req.json() as { note?: string };
    note = body.note;
  } catch {
    // Body is optional — empty body is acceptable
  }

  const db = getDb();

  // Verify escalation exists before attempting resolution
  type EscalationRow = HilEscalation;
  const escalation = db
    .prepare("SELECT * FROM hil_escalations WHERE id = ?")
    .get(id) as EscalationRow | undefined;

  if (!escalation) {
    return apiError(404, "escalation not found");
  }

  try {
    resolveEscalation(
      id,
      { actorId: session.userId, actorRole: session.role as "admin" | "operator", note },
      db
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "resolution failed";
    return apiError(409, message);
  }

  const updated = db
    .prepare("SELECT * FROM hil_escalations WHERE id = ?")
    .get(id) as EscalationRow;

  return Response.json({ escalation: updated, timestamp: new Date().toISOString() });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    return await buildResolveEscalationResponse(req, context);
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
