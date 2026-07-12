import { getDb } from "@/lib/db";
import {
  listTombstones,
  verifyTombstoneContinuity,
  writeTombstoneForErasure,
  type TombstoneInput,
} from "@/lib/memory/offboarding";
import type { RetentionScope } from "@/lib/memory/retention-policy";
import type { SubjectDerivativeInventory } from "@/lib/memory/subject-erasure";
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

function asDerivativeInventory(value: unknown): SubjectDerivativeInventory[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, idx) => {
    const rec = asRecord(item);
    const sourceHash = typeof rec.sourceHash === "string" && rec.sourceHash.trim() ? rec.sourceHash : "";
    const provenance = typeof rec.provenance === "string" && rec.provenance.trim() ? rec.provenance : `tombstone:${idx}`;
    return {
      storeId: asString(rec.storeId, `derivativeInventory[${idx}].storeId`),
      action: (asString(rec.action, `derivativeInventory[${idx}].action`) as SubjectDerivativeInventory["action"]),
      reason: asString(rec.reason, `derivativeInventory[${idx}].reason`),
      provenance,
      sourceHash,
      metadata: asRecord(rec.metadata),
    };
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  try {
    const body = (await request.json()) as Body;
    const action = asString(body.action, "action");
    if (action === "write") {
      const input: TombstoneInput = {
        tenantId: asOptionalString(body.tenantId),
        subjectHash: asString(body.subjectHash, "subjectHash"),
        canonicalId: asString(body.canonicalId, "canonicalId"),
        recordType: asString(body.recordType, "recordType"),
        recordId: asString(body.recordId, "recordId"),
        recordIdHash: asString(body.recordIdHash, "recordIdHash"),
        derivativeInventory: asDerivativeInventory(body.derivativeInventory),
        policyId: asOptionalString(body.policyId) ?? null,
        policyVersion: asOptionalString(body.policyVersion) ?? null,
        erasureId: asString(body.erasureId, "erasureId"),
        scope: asRecord(body.scope) as RetentionScope,
        outcome: asString(body.outcome, "outcome") as TombstoneInput["outcome"],
        actorId: asString(body.actorId, "actorId"),
        createdAt: asOptionalString(body.createdAt),
        now: body.now ? new Date(asString(body.now, "now")) : undefined,
      };
      const tombstone = writeTombstoneForErasure(getDb(), input);
      return Response.json({ ok: true, tombstone });
    }
    if (action === "verify") {
      const report = verifyTombstoneContinuity(getDb(), {
        tenantId: asOptionalString(body.tenantId),
        subjectHash: asOptionalString(body.subjectHash),
      });
      return Response.json({ ok: report.valid, report });
    }
    return Response.json({ ok: false, error: `unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  try {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId") ?? "default-tenant";
    const subjectHash = url.searchParams.get("subjectHash");
    if (!subjectHash) {
      return Response.json({ ok: false, error: "subjectHash is required" }, { status: 400 });
    }
    const tombstones = listTombstones(getDb(), { tenantId, subjectHash });
    const report = verifyTombstoneContinuity(getDb(), { tenantId, subjectHash });
    return Response.json({ ok: report.valid, tombstones, report });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
