import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { a2aErrorResponse, A2aError } from "@/lib/a2a/errors";
import { sendA2aMessage } from "@/lib/a2a/task-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const agent = authenticateAgentHeaders(request.headers);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  try {
    const task = await sendA2aMessage(agent, {
      message: body?.message as never,
      targetAgentId: typeof body?.targetAgentId === "string" ? body.targetAgentId : null,
      contextId: typeof body?.contextId === "string" ? body.contextId : undefined,
      taskId: typeof body?.taskId === "string" ? body.taskId : undefined,
      callerAgentId: typeof body?.callerAgentId === "string" ? body.callerAgentId : undefined,
      metadata: body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {},
    });
    return Response.json(task);
  } catch (error) {
    return error instanceof A2aError
      ? a2aErrorResponse(error)
      : a2aErrorResponse(new A2aError("INTERNAL", "A2A message send failed"));
  }
}
