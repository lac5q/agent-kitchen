import { getDb } from "@/lib/db";
import {
  computeDsarVerificationHash,
  executeDsarDelete,
  submitDsarRequest,
  type DsarRequestInput,
  type DsarRequestType,
  type DsarVerificationMethod,
} from "@/lib/memory/dsar";
import type { SubjectSelector } from "@/lib/memory/subject-erasure";
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

function asSubjectSelector(value: unknown): SubjectSelector {
  if (!value || typeof value !== "object") throw new Error("subject is required");
  return asRecord(value) as SubjectSelector;
}

export async function POST(request: Request): Promise<Response> {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  try {
    const body = (await request.json()) as Body;
    const action = asString(body.action, "action");

    if (action === "verification_hash") {
      const tenantId = asString(asOptionalString(body.tenantId) ?? "default-tenant", "tenantId");
      const subject = asSubjectSelector(body.subject);
      const method = asString(body.verificationMethod, "verificationMethod") as DsarVerificationMethod;
      const actorId = asString(body.actorId, "actorId");
      const verificationHash = computeDsarVerificationHash({
        subject,
        verificationMethod: method,
        actorId,
        tenantId,
      });
      return Response.json({ ok: true, verificationHash });
    }

    if (action === "submit") {
      const input: DsarRequestInput = {
        tenantId: asOptionalString(body.tenantId),
        requestType: asString(body.requestType, "requestType") as DsarRequestType,
        subject: asSubjectSelector(body.subject),
        scope: asRecord(body.scope) as RetentionScope,
        verificationMethod: asString(body.verificationMethod, "verificationMethod") as DsarVerificationMethod,
        verificationHash: asString(body.verificationHash, "verificationHash"),
        actorId: asString(body.actorId, "actorId"),
        requestId: asOptionalString(body.requestId),
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      };
      const result = submitDsarRequest(getDb(), input);
      return Response.json({ ok: result.ok, result }, { status: result.ok ? 200 : result.status === "denied" ? 403 : 409 });
    }

    if (action === "execute_delete") {
      const result = await executeDsarDelete(getDb(), {
        tenantId: asOptionalString(body.tenantId),
        requestId: asString(body.requestId, "requestId"),
        planHash: asString(body.planHash, "planHash"),
        actorId: asString(body.actorId, "actorId"),
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      });
      return Response.json({ ok: result.ok, result }, { status: result.ok ? 200 : 409 });
    }

    return Response.json({ ok: false, error: `unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
