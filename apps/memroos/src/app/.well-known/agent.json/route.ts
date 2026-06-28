import { buildMemroosAgentCard } from "@/lib/a2a/agent-card";
import { a2aContractHeaders } from "@/lib/a2a/contract";

export const dynamic = "force-dynamic";

export async function GET() {
  const card = buildMemroosAgentCard();

  return Response.json(
    {
      ...card,
      extensions: {
        ...card.extensions,
        memroos: {
          ...card.extensions.memroos,
          compatibilityAlias: true,
        },
      },
    },
    { headers: a2aContractHeaders() }
  );
}
