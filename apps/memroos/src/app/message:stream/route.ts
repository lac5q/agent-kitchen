import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { a2aErrorResponse, A2aError } from "@/lib/a2a/errors";
import { streamA2aMessage } from "@/lib/a2a/task-service";

export const dynamic = "force-dynamic";

function sse(payloads: unknown[]): Response {
  const body = payloads.map((payload) => `event: task.update\ndata: ${JSON.stringify(payload)}\n\n`).join("");
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

export async function POST(request: Request) {
  const agent = authenticateAgentHeaders(request.headers);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  try {
    const result = await streamA2aMessage(agent, {
      message: body?.message as never,
      targetAgentId: typeof body?.targetAgentId === "string" ? body.targetAgentId : null,
      contextId: typeof body?.contextId === "string" ? body.contextId : undefined,
      taskId: typeof body?.taskId === "string" ? body.taskId : undefined,
      metadata: body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {},
    });
    return sse([result.task, ...result.events]);
  } catch (error) {
    return error instanceof A2aError
      ? a2aErrorResponse(error)
      : a2aErrorResponse(new A2aError("INTERNAL", "A2A message stream failed"));
  }
}
