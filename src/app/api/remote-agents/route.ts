import { NextResponse } from "next/server";
import { getRemoteAgents, pollAllRemoteAgents } from "@/lib/agent-registry";

export const dynamic = "force-dynamic";

export async function GET() {
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
