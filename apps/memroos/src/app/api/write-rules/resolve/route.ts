import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { resolveWriteTarget } from "@/lib/write-rules";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const spaceId = typeof body.spaceId === "string" ? body.spaceId : typeof body.space_id === "string" ? body.space_id : "";
  const dataType = typeof body.dataType === "string" ? body.dataType : typeof body.data_type === "string" ? body.data_type : "";

  if (!spaceId.trim() || !dataType.trim()) {
    return Response.json({ ok: false, error: "spaceId and dataType are required" }, { status: 400 });
  }

  try {
    const result = resolveWriteTarget(getDb(), spaceId, dataType);
    return Response.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
