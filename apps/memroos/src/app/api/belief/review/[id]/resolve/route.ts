import type { NextRequest } from "next/server";

import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { resolveReview } from "@/lib/belief/promotion";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

type Resolution = "approved" | "rejected";

function isResolution(value: unknown): value is Resolution {
  return value === "approved" || value === "rejected";
}

/**
 * POST /api/belief/review/[id]/resolve
 *
 * Resolves an open review queue item. Operator or admin only.
 * Body: { resolution: 'approved' | 'rejected', note?: string, category?: string }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await authenticateUser(req);
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });

  const roleError = requireRole(session.role, "operator");
  if (roleError) return roleError;

  const { id } = await ctx.params;
  if (!id) return Response.json({ error: "queue id is required" }, { status: 400 });

  let body: { resolution?: unknown; note?: string | null; category?: string };
  try {
    body = (await req.json()) as { resolution?: unknown; note?: string | null; category?: string };
  } catch {
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!isResolution(body.resolution)) {
    return Response.json({ error: "resolution must be approved or rejected" }, { status: 400 });
  }

  try {
    const result = resolveReview(getDb(), {
      queueId: id,
      tenantId: session.tenantId || "default-tenant",
      resolution: body.resolution,
      operatorId: session.userId,
      note: body.note ?? null,
      category: body.category,
    });
    return Response.json({
      resolution: result.resolution,
      decisionId: result.decisionId,
      admission: result.admission
        ? {
            kind: result.admission.kind,
            decisionId: result.admission.decisionId,
            queueId: result.admission.kind === "queued_for_review" ? result.admission.queueId : null,
            receipt: result.admission.receipt,
          }
        : null,
      receipt: result.receipt,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : message.includes("already") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
