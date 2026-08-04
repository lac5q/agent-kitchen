import { listAllAgentsUnscoped } from "@/lib/agent/registry";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import {
  postOrchestrationTask,
  registeredAgentToOrchestrationAgent,
} from "@/lib/orchestration/client";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }

  const body = (await request.json().catch(() => null)) as unknown;
  if (!isRecord(body) || typeof body.taskSummary !== "string" || !body.taskSummary.trim()) {
    return Response.json({ ok: false, error: "taskSummary is required" }, { status: 400 });
  }

  try {
    // Unscoped: operator-key gated, and the orchestrator plans across the fleet.
    const agents = listAllAgentsUnscoped().map(registeredAgentToOrchestrationAgent);
    const result = await postOrchestrationTask({
      taskSummary: body.taskSummary.trim(),
      requiredCapability: typeof body.requiredCapability === "string" ? body.requiredCapability : undefined,
      correlationId: typeof body.correlationId === "string" ? body.correlationId : undefined,
      requiresApproval: body.requiresApproval === true,
      agents,
    });

    return Response.json({ ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Orchestration service unavailable" },
      { status: 502 }
    );
  }
}
