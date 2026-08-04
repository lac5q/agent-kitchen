import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { checkWriteRuleDrift } from "@/lib/write-rules";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const agentHint = url.searchParams.get("agent") ?? undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const spaceId = url.searchParams.get("spaceId") ?? url.searchParams.get("space_id") ?? "";
  const agentKnownVersion = Number(url.searchParams.get("agentKnownVersion") ?? url.searchParams.get("agent_known_version") ?? NaN);

  if (!spaceId.trim()) {
    return Response.json({ ok: false, error: "spaceId is required" }, { status: 400 });
  }
  if (!Number.isFinite(agentKnownVersion)) {
    return Response.json({ ok: false, error: "agentKnownVersion is required" }, { status: 400 });
  }

  try {
    const result = checkWriteRuleDrift(getDb(), spaceId, agentKnownVersion);
    return Response.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
