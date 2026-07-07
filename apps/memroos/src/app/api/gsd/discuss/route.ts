import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent-registry";
import { runBoundedDiscussCouncil } from "@/lib/gsd/discuss";
import { asGsdLane, gsdInputFromJson } from "@/lib/agent-gsd-control";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = gsdInputFromJson(await req.json().catch(() => ({})));
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const roles = Array.isArray(body.roles) ? body.roles : [];
    const contributions = Array.isArray(body.contributions) ? body.contributions : [];
    const verdict = gsdInputFromJson(body.verdict);
    const taskBudget = gsdInputFromJson(body.taskBudget);

    const result = runBoundedDiscussCouncil(getDb(), {
      goalId: typeof body.goalId === "string" ? body.goalId : typeof body.goal_id === "string" ? body.goal_id : "",
      actorAgentId: agent.id,
      topic: typeof body.topic === "string" ? body.topic : "",
      lane: asGsdLane(body.lane),
      roles: roles as never,
      taskBudget: {
        maxRounds: Number(taskBudget.maxRounds ?? 2),
        maxAgents: Number(taskBudget.maxAgents ?? (roles.length || 4)),
        maxTokens: typeof taskBudget.maxTokens === "number" ? taskBudget.maxTokens : undefined,
      },
      contributions: contributions as never,
      verdict: {
        decision:
          verdict.decision === "approve" ||
          verdict.decision === "revise" ||
          verdict.decision === "reject" ||
          verdict.decision === "needs_more_info"
            ? verdict.decision
            : "needs_more_info",
        summary: typeof verdict.summary === "string" ? verdict.summary : "",
        actionItems: Array.isArray(verdict.actionItems) ? verdict.actionItems.filter((item): item is string => typeof item === "string") : [],
        risks: Array.isArray(verdict.risks) ? verdict.risks.filter((item): item is string => typeof item === "string") : [],
        validatorPass: verdict.validatorPass === true,
        validatorNotes: typeof verdict.validatorNotes === "string" ? verdict.validatorNotes : undefined,
      },
    });

    const status = result.blockedReasons.length > 0 ? 400 : 200;
    return Response.json({ ok: result.blockedReasons.length === 0, ...result, timestamp: new Date().toISOString() }, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
