import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { a2aErrorResponse, A2aError } from "@/lib/a2a/errors";
import { cancelA2aTask } from "@/lib/a2a/task-service";

export const dynamic = "force-dynamic";

function taskIdFromUrl(url: string): string {
  const segment = new URL(url).pathname.split("/").at(-1) ?? "";
  return decodeURIComponent(segment.replace(/:cancel$/, ""));
}

export async function POST(request: Request) {
  const agent = authenticateAgentHeaders(request.headers);
  const id = taskIdFromUrl(request.url);
  try {
    const task = await cancelA2aTask(agent, id);
    return Response.json(task);
  } catch (error) {
    return error instanceof A2aError
      ? a2aErrorResponse(error)
      : a2aErrorResponse(new A2aError("INTERNAL", "A2A task cancellation failed"));
  }
}
