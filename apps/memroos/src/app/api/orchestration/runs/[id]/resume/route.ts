import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import { resumeOrchestrationRun } from "@/lib/orchestration/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }

  const params = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ ok: false, success: false, status: "missing_receipt", error: "JSON object body is required" }, { status: 400 });
  }

  try {
    const result = await resumeOrchestrationRun(params.id, body as Record<string, unknown>);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        success: false,
        status: "unavailable",
        error: error instanceof Error ? error.message : "Orchestration resume unavailable",
      },
      { status: 502 }
    );
  }
}
