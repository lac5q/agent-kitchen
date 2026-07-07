import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent-registry";
import { auditRegisteredSkills } from "@/lib/gsd/skill-boundary";
import { gsdInputFromJson } from "@/lib/agent-gsd-control";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = gsdInputFromJson(await req.json().catch(() => ({})));
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const result = auditRegisteredSkills(getDb(), {
    persistProposals: body.persistProposals !== false,
  });
  return Response.json({ ok: true, actorAgentId: agent.id, ...result, timestamp: new Date().toISOString() });
}
