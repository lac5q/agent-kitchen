import { parseAgents } from "@/lib/parsers";
import { AGENT_CONFIGS_PATH } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  const agents = await parseAgents(AGENT_CONFIGS_PATH);
  return Response.json({ agents, timestamp: new Date().toISOString() });
}
