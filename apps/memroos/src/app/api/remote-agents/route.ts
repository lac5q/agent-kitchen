import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { getRemoteAgents, pollAllRemoteAgents } from "@/lib/agent-registry";

export const dynamic = "force-dynamic";

async function buildRemoteAgentsResponse() {
  const configs = getRemoteAgents();
  const polls = await pollAllRemoteAgents();

  const agents = configs.map((config) => {
    const poll = polls.find((p) => p.id === config.id);
    return {
      ...config,
      status: poll?.reachable ? "active" : "unreachable",
      latencyMs: poll?.latencyMs ?? null,
      healthData: poll?.data ?? null,
    };
  });

  return NextResponse.json({ agents, timestamp: new Date().toISOString() });
}

export async function GET() {
  try {
    return await buildRemoteAgentsResponse();
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
