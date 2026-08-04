import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { a2aErrorResponse, A2aError } from "@/lib/a2a/errors";
import { getA2aTaskForAgent } from "@/lib/a2a/task-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const agent = authenticateAgentHeaders(request.headers);
  const { id } = await params;
  try {
    const task = await getA2aTaskForAgent(agent, id);
    return Response.json(task);
  } catch (error) {
    return error instanceof A2aError
      ? a2aErrorResponse(error)
      : a2aErrorResponse(new A2aError("INTERNAL", "A2A task lookup failed"));
  }
}
