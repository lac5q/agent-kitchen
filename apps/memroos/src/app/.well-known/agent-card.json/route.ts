import { buildMemroosAgentCard } from "@/lib/a2a/agent-card";
import { a2aContractHeaders } from "@/lib/a2a/contract";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(buildMemroosAgentCard(), { headers: a2aContractHeaders() });
}
