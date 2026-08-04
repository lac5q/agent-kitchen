import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { a2aErrorResponse, A2aError } from "@/lib/a2a/errors";
import { listA2aTasks } from "@/lib/a2a/task-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const agent = authenticateAgentHeaders(request.headers);
  try {
    const tasks = await listA2aTasks(agent);
    return Response.json({ tasks, timestamp: new Date().toISOString() });
  } catch (error) {
    return error instanceof A2aError
      ? a2aErrorResponse(error)
      : a2aErrorResponse(new A2aError("INTERNAL", "A2A task listing failed"));
  }
}
