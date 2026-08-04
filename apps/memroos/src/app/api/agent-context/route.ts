import type { NextRequest } from "next/server";
import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { buildAgentContextPacket, type AgentContextLane } from "@/lib/agent/context-packet";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function asLane(value: string | null): AgentContextLane | undefined {
  if (
    value === "research" ||
    value === "code" ||
    value === "memory" ||
    value === "deployment" ||
    value === "email_doc" ||
    value === "gtm" ||
    value === "safety" ||
    value === "ops"
  ) {
    return value;
  }
  return undefined;
}

function csv(value: string | null): string[] {
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const agentId = url.searchParams.get("agent") ?? undefined;
  const agent = authenticateAgentHeaders(req.headers, agentId);
  if (!agent) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const goalId = url.searchParams.get("goal_id") ?? url.searchParams.get("goalId");
  const topic = url.searchParams.get("topic") ?? url.searchParams.get("task");
  if (!goalId?.trim() && !topic?.trim()) {
    return Response.json({ ok: false, error: "goal_id or topic parameter is required" }, { status: 400 });
  }

  const lane = asLane(url.searchParams.get("lane"));
  const requestedLane = url.searchParams.get("lane");
  if (requestedLane && !lane) {
    return Response.json({ ok: false, error: `Invalid lane: ${requestedLane}` }, { status: 400 });
  }

  const result = buildAgentContextPacket(getDb(), {
    goalId: goalId?.trim() || undefined,
    topic: topic?.trim() || undefined,
    actorAgentId: agent.id,
    lane,
    goalTitle: url.searchParams.get("title") ?? undefined,
    acceptanceCriteria: csv(url.searchParams.get("acceptance")),
    scope: {
      project: url.searchParams.get("project") ?? undefined,
      repo: url.searchParams.get("repo") ?? undefined,
      client: url.searchParams.get("client") ?? undefined,
      cwd: url.searchParams.get("cwd") ?? undefined,
    },
  });

  return Response.json({ ok: true, ...result, timestamp: new Date().toISOString() });
}
