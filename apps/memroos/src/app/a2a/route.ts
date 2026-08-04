import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { dispatchA2aJsonRpc } from "@/lib/a2a/bindings";
import { a2aErrorResponse, A2aError } from "@/lib/a2a/errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const agent = authenticateAgentHeaders(request.headers);
  const body = (await request.json().catch(() => null)) as unknown;

  try {
    const response = await dispatchA2aJsonRpc(agent, body);
    return Response.json(response);
  } catch (error) {
    return error instanceof A2aError
      ? a2aErrorResponse(error)
      : a2aErrorResponse(new A2aError("INTERNAL", "A2A jsonrpc request failed"));
  }
}
