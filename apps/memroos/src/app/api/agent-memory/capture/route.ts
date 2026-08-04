import { captureCodingAgentSession, type CodingAgentCaptureInput } from "@/lib/agent/memory-continuity";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { recordCronHealthRun } from "@/lib/cron-health";
import { getDb } from "@/lib/db";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

const CAPTURE_RATE_LIMIT = 30;

function runtimePlatform(runtime: CodingAgentCaptureInput["runtime"]): string | null {
  switch (runtime) {
    case "claude-code":
      return "claude";
    case "gemini-cli":
      return "gemini";
    case "qwen-cli":
      return "qwen";
    case "codex":
    case "hermes":
    case "openclaw":
    case "opencode":
    case "pi":
    case "cursor":
    case "droid":
      return runtime;
    default:
      return null;
  }
}

function isAgentBearer(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  return bearer !== process.env.MEMROOS_OPERATOR_API_KEY && /^ak_/i.test(bearer);
}

export async function POST(request: Request) {
  const agentIdHint = request.headers.get("x-agent-id") ?? undefined;
  const agent = authenticateAgentHeaders(request.headers, agentIdHint);
  // An invalid agent key must not fall through to the legacy loopback
  // authorization. The operator key remains available for the sidecar and
  // local operator workflows.
  const operatorAuthorized = !agent && !isAgentBearer(request) && authorizeRegistryWrite(request);

  const rateLimit = checkAuthRateLimit(
    request,
    agent
      ? `memory-capture-agent:${agent.id}`
      : operatorAuthorized
        ? "memory-capture-operator"
        : "memory-capture-unauthenticated",
    CAPTURE_RATE_LIMIT
  );
  if (rateLimit) return rateLimit;

  if (!agent && !operatorAuthorized) return registryWriteUnauthorizedResponse();

  let body: CodingAgentCaptureInput;
  try {
    body = (await request.json()) as CodingAgentCaptureInput;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  if (agent) {
    if (body.sourceAgentId !== agent.id) {
      return Response.json(
        { ok: false, error: "Agent keys may capture only their own sessions", code: "AGENT_CAPTURE_SCOPE_DENIED" },
        { status: 403 }
      );
    }

    const expectedPlatform = runtimePlatform(body.runtime);
    if (!expectedPlatform || agent.platform !== expectedPlatform) {
      return Response.json(
        { ok: false, error: "Agent key is not registered for this capture runtime", code: "AGENT_RUNTIME_SCOPE_DENIED" },
        { status: 403 }
      );
    }

    // Full transcript sealing is vault-only. Agent callers cannot elevate the
    // policy through the request body or MEMROOS_CAPTURE_DEPTH environment.
    if (body.captureDepth?.toLowerCase() === "full") {
      body = { ...body, captureDepth: "relevant" };
    }
  }

  const db = getDb();
  let capture: ReturnType<typeof captureCodingAgentSession>;
  try {
    capture = captureCodingAgentSession(db, body);
  } catch (error) {
    try {
      recordCronHealthRun(db, "observe-capture-gate", {
        success: false,
        warning: `capture-gate failed: ${error instanceof Error ? error.message : "capture failed"}`,
        metadata: { attention: "NOC", source: "capture-route" },
      });
    } catch {
      // A health receipt must never turn a capture failure into a blocked hook.
    }
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "capture failed" },
      { status: 400 }
    );
  }

  try {
    recordCronHealthRun(db, "observe-capture-gate", {
      success: true,
      itemsProcessed: 1,
      metadata: { source: "capture-route" },
    });
  } catch {
    // Health is additive; a successful capture remains successful if the
    // optional NOC heartbeat cannot be recorded.
  }
  return Response.json({ ok: true, capture }, { status: capture.duplicate ? 200 : 201 });
}
