import { getDb } from "@/lib/db";
import {
  attachPendingPlanToReview,
  completeOffboardingReview,
  triggerOffboardingPendingErasure,
  type OffboardingTriggerInput,
} from "@/lib/memory/offboarding";
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
    if (action === "trigger") {
      const input: OffboardingTriggerInput = {
        tenantId: asOptionalString(body.tenantId),
        subjectHash: asString(body.subjectHash, "subjectHash"),
        userId: asOptionalString(body.userId) ?? null,
        scope: asRecord(body.scope) as RetentionScope,
        actorId: asString(body.actorId, "actorId"),
        slaSeconds: typeof body.slaSeconds === "number" ? body.slaSeconds : undefined,
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      };
      const receipt = triggerOffboardingPendingErasure(getDb(), input);
      return Response.json({ ok: receipt.status === "pending" || receipt.status === "in_progress" || receipt.status === "completed", receipt });
    }
    if (action === "attach_plan") {
      const receipt = attachPendingPlanToReview(getDb(), {
        tenantId: asOptionalString(body.tenantId),
        reviewId: asString(body.reviewId, "reviewId"),
        planId: asString(body.planId, "planId"),
        actorId: asString(body.actorId, "actorId"),
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      });
      if (!receipt) return Response.json({ ok: false, error: "review_not_found" }, { status: 404 });
      return Response.json({ ok: true, receipt });
    }
    if (action === "complete") {
      const receipt = completeOffboardingReview(getDb(), {
        tenantId: asOptionalString(body.tenantId),
        reviewId: asString(body.reviewId, "reviewId"),
        actorId: asString(body.actorId, "actorId"),
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      });
      if (!receipt) return Response.json({ ok: false, error: "review_not_found" }, { status: 404 });
      return Response.json({ ok: true, receipt });
    }
    return Response.json({ ok: false, error: `unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
