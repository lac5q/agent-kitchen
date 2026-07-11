import { getDb } from "@/lib/db";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import {
  createRetentionPolicy,
  evaluateRetentionPolicy,
  listRetentionReceipts,
  registerRetentionRecord,
  type RetentionScope,
  type RetentionSecurityLabel,
} from "@/lib/memory/retention-policy";

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

function asInt(value: unknown, field: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n)) throw new Error(`${field} must be an integer`);
  return n;
}

export async function POST(request: Request): Promise<Response> {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  try {
    const body = (await request.json()) as Body;
    const action = asString(body.action, "action");
    const db = getDb();

    if (action === "create_policy") {
      const policy = createRetentionPolicy(db, {
        id: asOptionalString(body.id),
        tenantId: asOptionalString(body.tenantId),
        name: asString(body.name, "name"),
        version: asOptionalString(body.version),
        ontologyType: asString(body.ontologyType, "ontologyType"),
        securityLabel: asRecord(body.securityLabel) as RetentionSecurityLabel,
        purpose: asString(body.purpose, "purpose"),
        scope: asRecord(body.scope) as RetentionScope,
        priority: asInt(body.priority, "priority", 0),
        durationDays: asInt(body.durationDays, "durationDays"),
        action: body.retentionAction === "tombstone" || body.retentionAction === "review" ? body.retentionAction : "expire",
        enabled: body.enabled !== false,
        actorId: asString(body.actorId, "actorId"),
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      });
      return Response.json({ ok: true, policy });
    }

    if (action === "evaluate") {
      const evaluation = evaluateRetentionPolicy(db, {
        tenantId: asOptionalString(body.tenantId),
        ontologyType: asOptionalString(body.ontologyType),
        securityLabel: asRecord(body.securityLabel) as RetentionSecurityLabel,
        purpose: asOptionalString(body.purpose),
        scope: asRecord(body.scope) as RetentionScope,
        createdAt: asOptionalString(body.createdAt),
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      });
      return Response.json({ ok: evaluation.decision === "selected", evaluation }, { status: evaluation.decision === "selected" ? 200 : 409 });
    }

    if (action === "register_record") {
      const result = registerRetentionRecord(db, {
        id: asOptionalString(body.id),
        tenantId: asOptionalString(body.tenantId),
        recordType: asString(body.recordType, "recordType"),
        recordId: asString(body.recordId, "recordId"),
        ontologyType: asString(body.ontologyType, "ontologyType"),
        securityLabel: asRecord(body.securityLabel) as RetentionSecurityLabel,
        purpose: asString(body.purpose, "purpose"),
        scope: asRecord(body.scope) as RetentionScope,
        createdAt: asOptionalString(body.createdAt),
        contentHash: asOptionalString(body.contentHash) ?? null,
        actorId: asString(body.actorId, "actorId"),
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      });
      return Response.json({ ok: result.evaluation.decision === "selected", ...result }, { status: result.evaluation.decision === "selected" ? 200 : 409 });
    }

    return Response.json({ ok: false, error: `unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export function GET(request: Request): Response {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  const url = new URL(request.url);
  const receipts = listRetentionReceipts(getDb(), {
    tenantId: url.searchParams.get("tenantId") ?? undefined,
    recordId: url.searchParams.get("recordId") ?? undefined,
    runKey: url.searchParams.get("runKey") ?? undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  });
  return Response.json({ ok: true, receipts });
}
