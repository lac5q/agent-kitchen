import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { a2aErrorResponse, A2aError } from "@/lib/a2a/errors";
import { subscribeA2aTask } from "@/lib/a2a/task-service";

export const dynamic = "force-dynamic";

function taskIdFromUrl(url: string): string {
  const segment = new URL(url).pathname.split("/").at(-1) ?? "";
  return decodeURIComponent(segment.replace(/:subscribe$/, ""));
}

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
  const id = taskIdFromUrl(request.url);
  try {
    const result = await subscribeA2aTask(agent, id);
    return sse([result.task, ...result.events]);
  } catch (error) {
    return error instanceof A2aError
      ? a2aErrorResponse(error)
      : a2aErrorResponse(new A2aError("INTERNAL", "A2A task subscription failed"));
  }
}
