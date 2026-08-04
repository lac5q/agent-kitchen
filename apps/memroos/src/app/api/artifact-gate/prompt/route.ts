import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { promptSaveArtifact } from "@/lib/artifact-gate";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const spaceId = typeof body.spaceId === "string" ? body.spaceId : typeof body.space_id === "string" ? body.space_id : "";
  const artifactName = typeof body.artifactName === "string" ? body.artifactName : typeof body.artifact_name === "string" ? body.artifact_name : "";
  const artifactType = typeof body.artifactType === "string" ? body.artifactType : typeof body.artifact_type === "string" ? body.artifact_type : "";

  if (!spaceId.trim() || !artifactName.trim() || !artifactType.trim()) {
    return Response.json({ ok: false, error: "spaceId, artifactName, and artifactType are required" }, { status: 400 });
  }

  try {
    const result = promptSaveArtifact(getDb(), { spaceId, artifactName, artifactType });
    return Response.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
