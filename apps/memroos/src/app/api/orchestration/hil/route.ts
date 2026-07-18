import { authenticateUser } from "@/lib/auth/session";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import { listOrchestrationHil } from "@/lib/orchestration/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Console operators authenticate with the session cookie; automation still
  // uses the operator API key / loopback path.
  const session = await authenticateUser(request);
  if (!session && !authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }

  try {
    const result = await listOrchestrationHil();
    return Response.json({ ok: true, decisions: result.decisions, timestamp: new Date().toISOString() });
  } catch {
    // Orchestration service is optional on cloud operators — empty is healthy.
    return Response.json({
      ok: true,
      decisions: [],
      status: "unavailable",
      detail: "Orchestration HIL service not configured on this host",
      timestamp: new Date().toISOString(),
    });
  }
}
