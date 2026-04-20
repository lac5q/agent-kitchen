import { getRemoteAgents } from "@/lib/agent-registry";
import { buildAgentCard } from "@/lib/dispatch/build-agent-card";

export const dynamic = "force-dynamic";

export async function GET() {
  const agents = getRemoteAgents();
  const cards = agents.map((a) => buildAgentCard(a));
  return Response.json({ cards, timestamp: new Date().toISOString() });
}
