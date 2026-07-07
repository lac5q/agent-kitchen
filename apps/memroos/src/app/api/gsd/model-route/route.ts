import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent-registry";
import { getGsdModelRoutingPolicy, routeGsdModel } from "@/lib/gsd/model-routing-policy";
import { gsdInputFromJson } from "@/lib/agent-gsd-control";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const agent = authenticateAgentHeaders(req.headers);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  return Response.json({
    ok: true,
    actorAgentId: agent.id,
    policy: getGsdModelRoutingPolicy(),
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const body = gsdInputFromJson(await req.json().catch(() => ({})));
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const overrideTier =
    body.overrideTier === "cheap_local" ||
    body.overrideTier === "frontier" ||
    body.overrideTier === "private_customer_bound" ||
    body.overrideTier === "vision" ||
    body.overrideTier === "validator"
      ? body.overrideTier
      : undefined;

  const result = routeGsdModel(getDb(), {
    taskClass: typeof body.taskClass === "string" ? body.taskClass : typeof body.task_class === "string" ? body.task_class : "hard_reasoning",
    agentId: agent.id,
    taskId: typeof body.taskId === "string" ? body.taskId : typeof body.task_id === "string" ? body.task_id : undefined,
    overrideTier,
    overrideReason: typeof body.overrideReason === "string" ? body.overrideReason : undefined,
    sensitive: body.sensitive === true,
    multimodal: body.multimodal === true,
    highRisk: body.highRisk === true,
    latencyMs: typeof body.latencyMs === "number" ? body.latencyMs : undefined,
    inputTokens: typeof body.inputTokens === "number" ? body.inputTokens : undefined,
    outputTokens: typeof body.outputTokens === "number" ? body.outputTokens : undefined,
    estimatedCostUsd: typeof body.estimatedCostUsd === "number" ? body.estimatedCostUsd : undefined,
    actualCostUsd: typeof body.actualCostUsd === "number" ? body.actualCostUsd : undefined,
    qualityScore: typeof body.qualityScore === "number" ? body.qualityScore : undefined,
    success: body.success !== false,
    error: typeof body.error === "string" ? body.error : undefined,
  });

  return Response.json({ ok: true, actorAgentId: agent.id, route: result, timestamp: new Date().toISOString() });
}
