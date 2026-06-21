import { authenticateAgentHeaders, recordMemoryWrite } from "@/lib/agent-registry";
import { MEM0_URL } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { buildTieredMemoryPayload, resolveMemoryTier } from "@/lib/memory/tiers";
import { checkMemoryWritePolicy } from "@/lib/security-policy";
import { writeAuditLog } from "@/lib/audit";
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

  let mem0Response: Response;
  let result: Record<string, unknown>;
  const rawContent = typeof body.content === "string" ? body.content : typeof body.text === "string" ? body.text : undefined;
  const tieredBody = buildTieredMemoryPayload({
    ...body,
    agent_id: agent.id,
    text: rawContent,
  });
  const storageBody = protectMemoryPayloadForStorage(tieredBody);
  const tier = resolveMemoryTier(storageBody);
  const policy = checkMemoryWritePolicy(agent, tier);
  if (!policy.allowed) {
    writeAuditLog(getDb(), {
      actor: agent.id,
      action: "policy_denied",
      target: "memory_write",
      detail: JSON.stringify({ code: policy.code, ...(policy.detail ?? {}) }),
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

  try {
    mem0Response = await fetch(`${MEM0_URL}/memory/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(storageBody),
      signal: AbortSignal.timeout(memoryWriteTimeoutMs()),
    });
    result = (await mem0Response.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Memory backend unavailable" }, { status: 502 });
  }

  if (!mem0Response.ok) {
    return Response.json({ ok: false, error: "Memory backend unavailable" }, { status: 502 });
  }

  recordMemoryWrite(
    agent.id,
    {
      type: tier,
      content: typeof storageBody.content === "string" ? storageBody.content : undefined,
      metadata: isRecord(storageBody.metadata) ? storageBody.metadata : {},
    },
    result
  );

  responseCache.invalidateTag("memory");
  return Response.json({ ok: true, tier, result, timestamp: new Date().toISOString() });
}
