import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { promptWorkspaceSelection } from "@/lib/workspace";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const agentHint = url.searchParams.get("agent") ?? undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const actorId = url.searchParams.get("actorId") ?? agent.id;

  try {
    const result = promptWorkspaceSelection(getDb(), actorId);
    return Response.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
