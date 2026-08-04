import crypto from "crypto";
import { authenticateAgentHeaders, recordToolOutcome } from "@/lib/agent/registry";
import { appendToolAttentionOutcome } from "@/lib/tool-attention";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function contentHash(value: string): string {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function sourceContent(value: Record<string, unknown>): string | null {
  for (const key of ["sourceContent", "sourceText", "rawContent"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}

function buildMetadata(body: Record<string, unknown>, agentId: string): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ...(isRecord(body.metadata) ? body.metadata : {}),
    ...(typeof body.taskId === "string" ? { taskId: body.taskId } : {}),
    agent_id: agentId,
  };

  const content = sourceContent(metadata);
  if (typeof metadata.sourceHash !== "string" && content) {
    metadata.sourceHash = contentHash(content);
  }

  delete metadata.sourceContent;
  delete metadata.sourceText;
  delete metadata.rawContent;
  return metadata;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  const agentIdHint = isRecord(body) && typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(request.headers, agentIdHint);
  if (!agent) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isRecord(body) || typeof body.toolId !== "string" || typeof body.outcome !== "string") {
    return Response.json({ ok: false, error: "toolId and outcome are required" }, { status: 400 });
  }

  const metadata = buildMetadata(body, agent.id);
  appendToolAttentionOutcome({
    timestamp: new Date().toISOString(),
    toolId: body.toolId,
    task: typeof body.task === "string" ? body.task : "",
    outcome: body.outcome,
    metadata,
  });
  recordToolOutcome(agent.id, { toolId: body.toolId, outcome: body.outcome, metadata });

  return Response.json({ ok: true, agentId: agent.id, timestamp: new Date().toISOString() });
}
