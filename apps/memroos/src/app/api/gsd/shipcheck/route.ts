import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent-registry";
import { asGsdLane, gsdInputFromJson, runGsdShipcheck } from "@/lib/agent-gsd-control";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = gsdInputFromJson(await req.json().catch(() => ({})));
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const result = runGsdShipcheck(getDb(), {
      goalId: typeof body.goalId === "string" ? body.goalId : typeof body.goal_id === "string" ? body.goal_id : "",
      actorAgentId: agent.id,
      lane: asGsdLane(body.lane),
      proof: gsdInputFromJson(body.proof),
      bypassReason: typeof body.bypassReason === "string" ? body.bypassReason : typeof body.bypass_reason === "string" ? body.bypass_reason : undefined,
    });
    const status = result.status === "blocked" ? 400 : 200;
    return Response.json({ ok: result.status !== "blocked", ...result, timestamp: new Date().toISOString() }, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
