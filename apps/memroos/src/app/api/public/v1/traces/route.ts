/**
 * POST /api/public/v1/traces
 *
 * Phase 62: Public trace submission endpoint.
 * Accepts MemroOS JSON (AgentEvalTrace) or OpenInference flat attribute bag.
 * Returns { runId, w, layers, proposalIds, tenantId }.
 *
 * Auth: Authorization: Bearer <api_key>
 * Rate limiting: token-bucket per tenant_id, config from memroos.eval.yaml
 */
import type { NextRequest } from "next/server";

import { authenticateTenantRequest } from "@/lib/public-api/auth";
import { checkRateLimit } from "@/lib/public-api/rate-limiter";
import { scoreAndMaybePersistEvalTrace } from "@/lib/evals/service";
import { loadEvalConfig } from "@/lib/evals/config";
import {
  isOpenInferenceTrace,
  mapOpenInferenceToAgentEvalTrace,
} from "@/lib/evals/openinference-mapper";
import {
  isAgentEvalTrace,
  parseAgentEvalTrace,
  parseEvalSubmitResult,
  publicEvalContractHeaders,
} from "@/lib/public-api/eval-contract";
import type { AgentEvalTrace } from "@/lib/evals/types";

export const dynamic = "force-dynamic";

function rateLimitHeaders(
  limit: number,
  remaining: number,
  resetAt: number
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(resetAt),
  };
}

export async function POST(req: NextRequest) {
  // --- Authentication ---
  const tenant = authenticateTenantRequest(req);
  if (!tenant) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Rate limiting ---
  const config = loadEvalConfig();
  const rateLimitConfig = config.publicApi?.rateLimit ?? {
    requestsPerMinute: 60,
    burst: 10,
  };
  const rl = checkRateLimit(tenant.tenantId, rateLimitConfig);
  const rlHeaders = rateLimitHeaders(
    rateLimitConfig.requestsPerMinute,
    rl.remaining,
    rl.resetAt
  );
  const responseHeaders = publicEvalContractHeaders(rlHeaders);

  if (!rl.allowed) {
    return Response.json(
      { error: "Too Many Requests" },
      {
        status: 429,
        headers: {
          ...responseHeaders,
          "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 1000) / 1000)),
        },
      }
    );
  }

  // --- Parse body ---
  const body = (await req.json().catch(() => null)) as unknown;
  if (!body) {
    return Response.json(
      { error: "Request body is required" },
      { status: 400, headers: responseHeaders }
    );
  }

  // --- Format detection and normalization ---
  let trace: AgentEvalTrace;
  if (isOpenInferenceTrace(body)) {
    trace = mapOpenInferenceToAgentEvalTrace(body);
  } else if (isAgentEvalTrace(body)) {
    trace = parseAgentEvalTrace(body);
  } else {
    return Response.json(
      {
        error:
          "Payload must be an AgentEvalTrace (MemroOS JSON) or an OpenInference span (requires openinference.span.kind)",
      },
      { status: 400, headers: responseHeaders }
    );
  }

  // Inject tenant context into metadata so the run is scoped.
  trace = {
    ...trace,
    metadata: { ...(trace.metadata ?? {}), tenantId: tenant.tenantId },
  };

  // --- Score and persist ---
  try {
    const result = scoreAndMaybePersistEvalTrace(trace, { persist: true });
    const responseBody = parseEvalSubmitResult({
      runId: result.id,
      w: result.compositeW,
      layers: result.layers,
      proposalIds: [],
      tenantId: tenant.tenantId,
    });

    return Response.json(
      responseBody,
      { status: 200, headers: responseHeaders }
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Eval scoring failed" },
      { status: 500, headers: responseHeaders }
    );
  }
}
