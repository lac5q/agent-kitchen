import { getDb } from "@/lib/db";
import {
  approveSubjectErasurePlan,
  createSubjectErasurePlan,
  executeSubjectErasurePlan,
  listSubjectErasurePlans,
  type SubjectSelector,
} from "@/lib/memory/subject-erasure";
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

    if (action === "create_plan") {
      const result = createSubjectErasurePlan(db, {
        id: asOptionalString(body.id),
        tenantId: asOptionalString(body.tenantId),
        subject: asRecord(body.subject) as SubjectSelector,
        scope: asRecord(body.scope) as RetentionScope,
        actorId: asString(body.actorId, "actorId"),
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      });
      return Response.json(result, { status: result.ok ? 200 : 409 });
    }

    if (action === "approve_plan") {
      const plan = approveSubjectErasurePlan(db, {
        tenantId: asOptionalString(body.tenantId),
        planId: asString(body.planId, "planId"),
        planHash: asString(body.planHash, "planHash"),
        actorId: asString(body.actorId, "actorId"),
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      });
      return Response.json({ ok: true, plan });
    }

    if (action === "execute_plan") {
      const result = await executeSubjectErasurePlan(db, {
        tenantId: asOptionalString(body.tenantId),
        planId: asString(body.planId, "planId"),
        planHash: asString(body.planHash, "planHash"),
        actorId: asString(body.actorId, "actorId"),
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      });
      return Response.json(result, { status: result.ok ? 200 : 409 });
    }

    return Response.json({ ok: false, error: `unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export function GET(request: Request): Response {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  const url = new URL(request.url);
  const plans = listSubjectErasurePlans(getDb(), {
    tenantId: url.searchParams.get("tenantId") ?? undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  });
  return Response.json({ ok: true, plans });
}
