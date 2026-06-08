import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api-error";
import { authenticateUser } from "@/lib/auth/session";
import { evaluateContextSources, loadContextSourceContracts } from "@/lib/context-sources";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) return apiError(401, "Unauthorized");
  try {
    const health = evaluateContextSources(loadContextSourceContracts());
    return Response.json(health);
  } catch (err) {
    return apiError(500, err instanceof Error ? err.message : "Failed to evaluate context sources");
  }
}
