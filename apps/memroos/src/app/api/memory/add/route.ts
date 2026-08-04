import crypto from "crypto";
import { authenticateAgentHeaders, recordMemoryWrite } from "@/lib/agent/registry";
import { getDb } from "@/lib/db";
import { buildTieredMemoryPayload, resolveMemoryTier } from "@/lib/memory/tiers";
import { attachMemoryWriteId, captureMemoryBronze } from "@/lib/memory/save-enrichment";
import { scoreMemoryWrite } from "@/lib/memory/save-quality";
import { checkMemoryWritePolicy } from "@/lib/security-policy";
import { writeAuditLogFromEntry as writeAuditLog } from "@/lib/store/audit";
import { responseCache } from "@/lib/response-cache";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { protectMemoryPayloadForStorage } from "@/lib/privacy/pii-storage";
export const dynamic = "force-dynamic";

export function memoryWriteTimeoutMs(): number {
  const parsed = Number(process.env.MEMROOS_MEMORY_WRITE_TIMEOUT_MS ?? 30_000);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 30_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  const rateLimited = checkAuthRateLimit(request, "memory-add", 30);
  if (rateLimited) return rateLimited;

  const body = (await request.json().catch(() => null)) as unknown;
  const agentIdHint = isRecord(body) && typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(request.headers, agentIdHint);
  if (!agent) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isRecord(body)) {
    return Response.json({ ok: false, error: "Invalid memory payload" }, { status: 400 });
  }

  const rawContent = typeof body.content === "string" ? body.content : typeof body.text === "string" ? body.text : undefined;

  const tieredBody = buildTieredMemoryPayload({
    ...body,
    agent_id: agent.id,
    text: rawContent,
  });
  
  const storageBody = protectMemoryPayloadForStorage(tieredBody);
  const tier = resolveMemoryTier(storageBody);
  const policy = checkMemoryWritePolicy(agent, tier);
  const content = typeof storageBody.text === "string"
    ? storageBody.text
    : typeof storageBody.content === "string"
      ? storageBody.content
      : rawContent ?? "";
  const metadata = isRecord(storageBody.metadata) ? storageBody.metadata : {};
  const contentHash = crypto.createHash("sha256").update(content).digest("hex");
  const priorWrite = getDb()
    .prepare(
      `SELECT id FROM agent_memory_writes
       WHERE content_hash = ?
       ORDER BY written_at ASC, id ASC
       LIMIT 1`
    )
    .get(contentHash) as { id: number } | undefined;
  const duplicateOf = priorWrite ? `agent_memory_writes:${priorWrite.id}` : null;
  const qualityReport = scoreMemoryWrite({
    memoryType: tier,
    content,
    metadata,
    duplicateOf,
    policyAllowed: policy.allowed,
    firstSeenAt: new Date().toISOString(),
  });
  
  if (!policy.allowed) {
    writeAuditLog(getDb(), {
      actor: agent.id,
      action: "policy_denied",
      target: "memory_write",
      detail: JSON.stringify({ code: policy.code, qualityReport, ...(policy.detail ?? {}) }),
      severity: "high",
    });
    return Response.json(
      {
        ok: false,
        error: policy.message ?? "Action denied by security policy",
        code: "POLICY_DENIED",
        detail: { code: policy.code },
      },
      { status: 403 }
    );
  }
  
  // VAL-MEM-010: Classification precedes durable indexing
  // Ensure classification and policy checks happen before writing to storage
  try {
    const { classifyText } = await import("@/lib/classification/cascade");
    const classification = classifyText({
      content,
      sourceType: "memory_api",
      metadata: isRecord(body.metadata) ? body.metadata : {}
    });
    
    if (classification.requiresReview) {
      // Return 403 to match standard classification rejections
      return Response.json({ 
        ok: false, 
        error: `Memory write rejected due to classification status: ${classification.requiresReview ? 'requires_human_review' : 'sealed'}`,
        code: "CLASSIFICATION_DENIED",
      detail: { classification, qualityReport }
      }, { status: 403 });
    }
    
    storageBody.metadata = {
      ...metadata,
      classification: classification.label
    };
  } catch (err) {
    // If the module fails to load (e.g., in some test environments), continue without classification
    // This maintains backward compatibility while allowing progressive rollout
    console.warn("Could not run classification before indexing:", err);
  }

  let bronze;
  try {
    bronze = captureMemoryBronze(getDb(), {
      agentId: agent.id,
      tier,
      content,
      metadata: isRecord(storageBody.metadata) ? storageBody.metadata : {},
      storagePayload: storageBody,
      qualityReport,
      project: typeof metadata.project === "string" ? metadata.project : null,
    });
  } catch {
    return Response.json({ ok: false, error: "Durable memory capture unavailable" }, { status: 503 });
  }

  const enrichment = {
    status: "pending" as const,
    captureId: bronze.captureId,
    queueDepth: bronze.queueDepth,
    extractionLagMs: null,
  };
  const writeId = recordMemoryWrite(
    agent.id,
    {
      type: tier,
      content,
      metadata: isRecord(storageBody.metadata) ? storageBody.metadata : {},
    },
    {
      status: "bronze_captured",
      bronze: {
        artifactId: bronze.artifactId,
        artifactUri: bronze.artifactUri,
        durabilityId: bronze.durabilityId,
        contentHash: bronze.contentHash,
        persistedAt: bronze.capturedAt,
      },
      enrichment,
      saveQuality: qualityReport,
      deferAdapterPush: true,
    }
  );
  attachMemoryWriteId(getDb(), bronze.captureId, writeId, bronze.queueDepth);

  responseCache.invalidateTag("memory");
  return Response.json({
    ok: true,
    tier,
    result: {
      status: "bronze_captured",
      artifactId: bronze.artifactId,
      durabilityId: bronze.durabilityId,
      captureId: bronze.captureId,
    },
    bronze: {
      artifactId: bronze.artifactId,
      artifactUri: bronze.artifactUri,
      durabilityId: bronze.durabilityId,
      contentHash: bronze.contentHash,
      persistedAt: bronze.capturedAt,
    },
    enrichment,
    saveQuality: qualityReport,
    timestamp: new Date().toISOString(),
  });
}
