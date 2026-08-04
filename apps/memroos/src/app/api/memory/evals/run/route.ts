import { runMemoryRecallEvalSuite, type MemoryEvalMode } from "@/lib/memory/recall-evals";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

function parseMode(raw: string | null): MemoryEvalMode {
  return raw === "canary" || raw === "full" || raw === "gold" ? raw : "gold";
}

export async function POST(request: Request) {
  if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }

  const url = new URL(request.url);
  const run = await runMemoryRecallEvalSuite({ mode: parseMode(url.searchParams.get("mode")) });
  return Response.json({ ok: true, run, timestamp: new Date().toISOString() });
}
