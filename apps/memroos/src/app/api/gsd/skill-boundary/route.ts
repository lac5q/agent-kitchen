import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent-registry";
import { loadSkillBoundaryManifest } from "@/lib/gsd/skill-boundary";
import { gsdInputFromJson } from "@/lib/agent-gsd-control";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const agent = authenticateAgentHeaders(req.headers);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  return Response.json({ ok: true, actorAgentId: agent.id, manifest: loadSkillBoundaryManifest(), timestamp: new Date().toISOString() });
}
