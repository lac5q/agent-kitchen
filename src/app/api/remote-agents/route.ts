import { NextResponse } from "next/server";
import { REMOTE_AGENTS, pollAllRemoteAgents } from "@/lib/agent-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const polls = await pollAllRemoteAgents();

  const agents = REMOTE_AGENTS.map((config) => {
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
