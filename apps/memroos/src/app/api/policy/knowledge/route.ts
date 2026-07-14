import type { NextRequest } from "next/server";

import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { evaluateKnowledgePolicy } from "@/lib/policy/engine";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/policy/knowledge
 *
 * v8.10 round-3 (ONTO-25 follow-up): knowledge-domain policy decision
 * endpoint. Always requires caller-supplied `ontologyReference`
 * coordinates; the server resolves the ontology context via
 * `resolveRequiredKnowledgeOntologyContext` and fails closed when the
 * context is absent / forged / foreign / stale / revoked / unreachable.
 *
 * Body:
 *   action:               string (required)
 *   metadata:             record (optional, ids only — never content)
 *   ontologyReference:    { tenantId, spaceId, recordType, recordId } (optional)
 *   ontologyContext:      rejected — caller-supplied hashes are not accepted
 *
 * Responses:
 *   200  + receipt        — evaluation succeeded (allow or deny).
 *   400  + error          — caller-supplied ontology context, missing
 *                           action, or invalid input shape.
 *   401 / 403             — authentication or authorization failure.
 */
export async function POST(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });
  const roleError = requireRole(session.role, "operator");
  if (roleError) return roleError;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : null;
  if (!action) {
    return Response.json({ error: "action is required" }, { status: 400 });
  }

  // Caller-supplied ontology context is always rejected — the server is the
  // sole authoritative source of the ontology hash. Return a deterministic
  // 400 so callers can detect the rejected contract.
  if (body.ontologyContext !== undefined && body.ontologyContext !== null) {
    return Response.json(
      { error: "caller-supplied ontology context is not accepted" },
      { status: 400 },
    );
  }

  // ontologyReference is optional in this surface (the route is the
  // canonical "absence is denied" endpoint), but the engine itself
  // treats an absent reference as a non-ontology-sensitive call. For
  // knowledge policy we treat absence as a deterministic deny: the
  // engine still returns an allow receipt in that mode (declarative
  // pass-through) but the route enforces "absence is denied" by
  // requiring the reference for any ontology-sensitive call.
  const reference = body.ontologyReference as
    | { tenantId?: unknown; spaceId?: unknown; recordType?: unknown; recordId?: unknown }
    | undefined;
  if (
    !reference
    || typeof reference.tenantId !== "string"
    || typeof reference.spaceId !== "string"
    || typeof reference.recordType !== "string"
    || typeof reference.recordId !== "string"
  ) {
    return Response.json(
      { error: "ontology_reference_required", reason: "ontology_context_unavailable" },
      { status: 400 },
    );
  }

  const metadata = typeof body.metadata === "object" && body.metadata !== null
    ? body.metadata as Record<string, unknown>
    : undefined;

  try {
    const evaluation = evaluateKnowledgePolicy(
      {
        action,
        actor: {
          id: session.userId,
          role: session.role === "admin" || session.role === "operator" || session.role === "reviewer"
            ? session.role
            : "system",
          tenantId: session.tenantId ?? "default-tenant",
        },
        metadata,
        ontologyReference: {
          tenantId: reference.tenantId,
          spaceId: reference.spaceId,
          recordType: reference.recordType,
          recordId: reference.recordId,
        },
      },
      getDb(),
    );

    // If the engine returned a deny receipt for any reason, surface it as
    // a 403 so callers can distinguish an allow from a deny.
    if (evaluation.receipt.outcome === "deny") {
      return Response.json(
        {
          ok: false,
          outcome: evaluation.receipt.outcome,
          reason: evaluation.receipt.reason,
          ruleMatched: evaluation.receipt.ruleMatched,
          ontology: evaluation.receipt.ontology ?? null,
          timestamp: new Date().toISOString(),
        },
        { status: 403 },
      );
    }

    return Response.json({
      ok: true,
      outcome: evaluation.receipt.outcome,
      reason: evaluation.receipt.reason,
      ruleMatched: evaluation.receipt.ruleMatched,
      ontology: evaluation.receipt.ontology ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { ok: false, error: message },
      { status: 400 },
    );
  }
}
