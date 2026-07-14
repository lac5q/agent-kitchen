import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import { getOrchestrationRunEvidence } from "@/lib/orchestration/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }

  const params = await context.params;
  try {
    const result = await getOrchestrationRunEvidence(params.id);
    return Response.json(result, { status: result.bundle ? 200 : 404 });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        success: false,
        status: "unavailable",
        error: error instanceof Error ? error.message : "Orchestration evidence unavailable",
      },
      { status: 502 }
    );
  }
}
