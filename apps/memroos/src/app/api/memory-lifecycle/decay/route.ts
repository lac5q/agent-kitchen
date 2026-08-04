import { runDecay } from "@/lib/memory/decay";
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
    const summary = runDecay({
      tenantId: asOptionalString(body.tenantId),
      runKey: asOptionalString(body.runKey),
      actorId: asOptionalString(body.actorId),
      scope: asRecord(body.scope) as RetentionScope,
      now: body.now ? new Date(asString(body.now, "now")) : undefined,
    });
    return Response.json({ ok: summary.status === "completed", summary }, { status: summary.status === "lease_held" ? 409 : 200 });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
