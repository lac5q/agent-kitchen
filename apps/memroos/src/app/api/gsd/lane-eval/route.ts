import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent-registry";
import { runGsdLaneEvalSuite } from "@/lib/gsd/lane-evals";
import { gsdInputFromJson } from "@/lib/agent-gsd-control";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = gsdInputFromJson(await req.json().catch(() => ({})));
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const caseIds = Array.isArray(body.caseIds)
    ? body.caseIds.filter((item): item is string => typeof item === "string")
    : undefined;

  const result = runGsdLaneEvalSuite(getDb(), {
    caseIds,
    persistReceipts: body.persistReceipts !== false,
  });

  return Response.json({ ok: result.failedCases === 0, actorAgentId: agent.id, ...result, timestamp: new Date().toISOString() });
}

export async function GET(req: NextRequest) {
  const agent = authenticateAgentHeaders(req.headers);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const result = runGsdLaneEvalSuite(getDb(), { persistReceipts: false });
  return Response.json({ ok: true, actorAgentId: agent.id, ...result, timestamp: new Date().toISOString() });
}
