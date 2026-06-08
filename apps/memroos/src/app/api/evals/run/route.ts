import type { NextRequest } from "next/server";

import { apiError } from "@/lib/api-error";
import { scoreAndMaybePersistEvalTrace } from "@/lib/evals/service";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import type { AgentEvalTrace } from "@/lib/evals/types";

export const dynamic = "force-dynamic";

function isTrace(value: unknown): value is AgentEvalTrace {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.traceId === "string" &&
    typeof record.agentId === "string" &&
    typeof record.input === "string" &&
    typeof record.output === "string"
  );
}

export async function POST(req: NextRequest) {
  if (!authorizeRegistryWrite(req)) {
    return registryWriteUnauthorizedResponse();
  }

  const body = (await req.json().catch(() => null)) as { trace?: unknown; persist?: boolean } | null;
  if (!isTrace(body?.trace)) {
    return apiError(400, "trace with traceId, agentId, input, and output is required");
  }

  try {
    const result = scoreAndMaybePersistEvalTrace(body.trace, { persist: body.persist !== false });
    return Response.json({ ok: true, result, timestamp: new Date().toISOString() });
  } catch (error) {
    return apiError(400, error instanceof Error ? error.message : "Eval run failed");
  }
}
