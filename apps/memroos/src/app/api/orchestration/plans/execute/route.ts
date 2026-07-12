import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import { executeOrchestrationPlan } from "@/lib/orchestration/client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ ok: false, success: false, status: "plan_invalid", error: "JSON object body is required" }, { status: 400 });
  }

  try {
    const result = await executeOrchestrationPlan(body as Record<string, unknown>);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        success: false,
        status: "unavailable",
        error: error instanceof Error ? error.message : "Orchestration execution unavailable",
      },
      { status: 502 }
    );
  }
}
