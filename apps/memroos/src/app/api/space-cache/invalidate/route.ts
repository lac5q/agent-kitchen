import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { invalidateResource, invalidateSpace } from "@/lib/space-cache";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const spaceId = typeof body.spaceId === "string" ? body.spaceId : typeof body.space_id === "string" ? body.space_id : "";
  const actorId = typeof body.actorId === "string" ? body.actorId : agent.id;
  const reason = typeof body.reason === "string" ? body.reason : undefined;

  if (!spaceId.trim()) {
    return Response.json({ ok: false, error: "spaceId is required" }, { status: 400 });
  }

  try {
    if (typeof body.resourceId === "string" && body.resourceId.trim()) {
      invalidateResource(getDb(), { spaceId, resourceId: body.resourceId, actorId, reason });
    } else {
      invalidateSpace(getDb(), { spaceId, actorId, reason });
    }
    return Response.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
