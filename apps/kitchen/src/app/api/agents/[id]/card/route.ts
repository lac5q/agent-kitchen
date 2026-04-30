import type { NextRequest } from "next/server";
import { getRemoteAgents } from "@/lib/agent-registry";
import { buildAgentCard } from "@/lib/dispatch/build-agent-card";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agents = getRemoteAgents();
  const agent = agents.find((a) => a.id === id);
  if (!agent) {
    return Response.json({ error: `Agent not found: ${id}` }, { status: 404 });
  }
  return Response.json(buildAgentCard(agent));
}
