import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { asGsdLane, buildGsdStandup } from "@/lib/agent/gsd-control";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const agent = authenticateAgentHeaders(req.headers, url.searchParams.get("agent") ?? undefined);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const limitParam = Number(url.searchParams.get("limit") ?? "20");
  const result = buildGsdStandup(getDb(), {
    goalId: url.searchParams.get("goal_id") ?? url.searchParams.get("goalId") ?? undefined,
    actorAgentId: agent.id,
    lane: asGsdLane(url.searchParams.get("lane")),
    limit: Number.isFinite(limitParam) ? limitParam : 20,
  });
  return Response.json({ ok: true, ...result, timestamp: new Date().toISOString() });
}
