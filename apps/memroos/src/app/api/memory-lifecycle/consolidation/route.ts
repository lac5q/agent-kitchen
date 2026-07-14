import { getDb } from "@/lib/db";
import {
  runConsolidationCycle,
  type ConsolidationSourceRow,
  type ConsolidationSummaryInput,
} from "@/lib/memory/consolidation";
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

function asSources(value: unknown): ConsolidationSourceRow[] {
  if (!Array.isArray(value)) throw new Error("sources must be an array");
  return value.map((item, idx) => {
    const rec = asRecord(item);
    return {
      canonicalId: asString(rec.canonicalId, `sources[${idx}].canonicalId`),
      recordType: asString(rec.recordType, `sources[${idx}].recordType`),
      recordId: asString(rec.recordId, `sources[${idx}].recordId`),
      content: typeof rec.content === "string" ? rec.content : "",
      contentHash: asString(rec.contentHash, `sources[${idx}].contentHash`),
      ontologyType: asString(rec.ontologyType, `sources[${idx}].ontologyType`),
      tier: asString(rec.tier, `sources[${idx}].tier`),
      classification: asRecord(rec.classification),
    };
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  try {
    const body = (await request.json()) as Body;
    const runKey = asString(body.runKey, "runKey");
    const scope = asRecord(body.scope) as RetentionScope;
    const actorId = asString(body.actorId, "actorId");
    const sources = asSources(body.sources);
    const providerOverride = asRecord(body.providerOverride) as Record<string, unknown>;
    let provider: ((input: { sources: ConsolidationSourceRow[]; promptSafe: string }) => Promise<ConsolidationSummaryInput>) | undefined;
    if (Object.keys(providerOverride).length > 0) {
      provider = async (input) => {
        if (typeof providerOverride.summary === "string") {
          return {
            type: "episodic_summary",
            content: providerOverride.summary as string,
          };
        }
        return { type: "episodic_summary", content: `episodic_summary:${input.promptSafe}` };
      };
    }
    const result = await runConsolidationCycle(getDb(), {
      runKey,
      scope,
      sources,
      actorId,
      tenantId: asOptionalString(body.tenantId),
      modelId: asOptionalString(body.modelId),
      modelVersion: asOptionalString(body.modelVersion),
      policyId: asOptionalString(body.policyId),
      policyVersion: asOptionalString(body.policyVersion),
      provider,
      now: body.now ? new Date(asString(body.now, "now")) : undefined,
    });
    return Response.json({ ok: result.status === "completed" || result.status === "completed_replayed", result }, { status: 200 });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
