import { getLatestMemoryEvalRun } from "@/lib/memory/recall-evals";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }

  return Response.json(getLatestMemoryEvalRun());
}
