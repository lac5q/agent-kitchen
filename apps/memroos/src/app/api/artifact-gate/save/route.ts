import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent-registry";
import { saveArtifact } from "@/lib/artifact-gate";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const spaceId = typeof body.spaceId === "string" ? body.spaceId : typeof body.space_id === "string" ? body.space_id : "";
  const actorId = typeof body.actorId === "string" ? body.actorId : agent.id;
  const artifactName = typeof body.artifactName === "string" ? body.artifactName : typeof body.artifact_name === "string" ? body.artifact_name : "";
  const artifactType = typeof body.artifactType === "string" ? body.artifactType : typeof body.artifact_type === "string" ? body.artifact_type : "";
  const resourceId = typeof body.resourceId === "string" ? body.resourceId : typeof body.resource_id === "string" ? body.resource_id : "";
  const beliefStage = typeof body.beliefStage === "string" ? body.beliefStage : typeof body.belief_stage === "string" ? body.belief_stage : "";

  if (!spaceId.trim() || !artifactName.trim() || !artifactType.trim() || !resourceId.trim() || !beliefStage.trim()) {
    return Response.json({ ok: false, error: "spaceId, artifactName, artifactType, resourceId, and beliefStage are required" }, { status: 400 });
  }

  try {
    const result = saveArtifact(getDb(), {
      spaceId,
      artifactName,
      artifactType,
      resourceId,
      beliefStage,
      actorId,
      purpose: typeof body.purpose === "string" ? body.purpose : undefined,
    });
    return Response.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
