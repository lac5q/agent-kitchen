import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent-registry";
import { asGsdLane, createOrResumeGsdGoal, gsdInputFromJson, gsdStringArray } from "@/lib/agent-gsd-control";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = gsdInputFromJson(await req.json().catch(() => ({})));
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const result = createOrResumeGsdGoal(getDb(), {
      goalId: typeof body.goalId === "string" ? body.goalId : typeof body.goal_id === "string" ? body.goal_id : undefined,
      title: typeof body.title === "string" ? body.title : typeof body.goal === "string" ? body.goal : "",
      actorAgentId: agent.id,
      ownerAgentId: typeof body.ownerAgentId === "string" ? body.ownerAgentId : typeof body.owner === "string" ? body.owner : undefined,
      lane: asGsdLane(body.lane),
      acceptanceCriteria: gsdStringArray(body.acceptanceCriteria),
      requiredVerification: gsdStringArray(body.requiredVerification),
      forbiddenActions: gsdStringArray(body.forbiddenActions),
      approvalRequired: gsdStringArray(body.approvalRequired),
      scope: gsdInputFromJson(body.scope),
    });

    return Response.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
