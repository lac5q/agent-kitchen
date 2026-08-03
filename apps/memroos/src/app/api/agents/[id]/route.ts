import type { NextRequest } from "next/server";
import {
  agentOwnershipHistory,
  canManageAgent,
  deleteAgent,
  canViewAgent,
  deregisterAgent,
  getRegisteredAgent,
  updateAgentDetails,
  type AgentViewer,
} from "@/lib/agent-registry";
import { authenticateUser } from "@/lib/auth/session";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import { getLocalAgentRuntime } from "@/lib/local-agent-runtime";
import {
  classifyLiveness,
  type LivenessObservation,
} from "@/lib/agent-liveness";
import { metricEnvelope, type MetricEnvelope, type MetricScope } from "@/lib/metric-status";

export const dynamic = "force-dynamic";

interface AgentDetailLiveness extends LivenessObservation {
  /** Heartbeat metric envelope exposes the source/observedAt for the drawer. */
  heartbeat: MetricEnvelope<number | null>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await authenticateUser(request);
  if (!session) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }
  const viewer: AgentViewer = { userId: session.userId, role: session.role };

  const agent = getRegisteredAgent(id);
  // 404 rather than 403 when out of scope: a 403 would confirm that an agent
  // with this id exists, letting someone enumerate the fleet they cannot see.
  if (!agent || !canViewAgent(viewer, id)) {
    return Response.json({ error: `Agent not found: ${id}` }, { status: 404 });
  }

  let localRuntimeOk = true;
  let localRuntimeScannedAt: string | null = null;
  try {
    const localRuntime = getLocalAgentRuntime();
    localRuntimeScannedAt = localRuntime.scannedAt;
  } catch {
    localRuntimeOk = false;
  }

  const livenessScope: MetricScope = { window: "lifetime", workspace: "all" };
  const observation = classifyLiveness({
    lastHeartbeat: agent.lastHeartbeat,
  });
  const heartbeatEnvelope: MetricEnvelope<number | null> = metricEnvelope<number | null>({
    value: observation.state === "live" ? 0 : null,
    status:
      observation.state === "live"
        ? "live"
        : observation.state === "stale"
          ? "stale"
          : observation.state === "error"
            ? "error"
            : observation.observedAt
              ? "stale"
              : "empty",
    source: observation.source,
    observedAt: observation.observedAt,
    freshnessMs: observation.freshnessMs,
    scope: livenessScope,
    reason: observation.reason,
  });
  const livenessView: AgentDetailLiveness = {
    ...observation,
    heartbeat: heartbeatEnvelope,
  };
  void localRuntimeOk;
  void localRuntimeScannedAt;

  return Response.json({
    agent,
    liveness: livenessView,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Gate a mutation on this agent.
 *
 * A signed-in human is held to ownership: seeing an agent (it may be shared)
 * never implies being able to rename or deregister it. Returns 404 rather than
 * 403 so the response cannot be used to probe which ids exist.
 *
 * With no session we fall back to the operator-key / loopback path, which is
 * how the MCP server and local agents drive the registry.
 */
async function authorizeAgentMutation(
  request: Request,
  id: string
): Promise<Response | null> {
  const session = await authenticateUser(request);
  if (session) {
    const viewer: AgentViewer = { userId: session.userId, role: session.role };
    if (!canManageAgent(viewer, id)) {
      return Response.json({ error: `Agent not found: ${id}` }, { status: 404 });
    }
    return null;
  }
  if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }
  return null;
}

/**
 * Rename / re-describe an agent.
 *
 * Only display fields are accepted — see updateAgentDetails. Anything
 * describing where the agent physically is stays derived, so the registry
 * cannot be hand-edited into disagreeing with the machine.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const denied = await authorizeAgentMutation(request, id);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Body must be an object" }, { status: 400 });
  }

  const { name, role, company } = body as Record<string, unknown>;
  for (const [key, value] of Object.entries({ name, role })) {
    if (value !== undefined && typeof value !== "string") {
      return Response.json({ error: `${key} must be a string` }, { status: 400 });
    }
  }
  if (company !== undefined && company !== null && typeof company !== "string") {
    return Response.json({ error: "company must be a string or null" }, { status: 400 });
  }

  try {
    const agent = updateAgentDetails(id, {
      name: name as string | undefined,
      role: role as string | undefined,
      company: company as string | null | undefined,
    });
    if (!agent) {
      return Response.json({ error: `Agent not found: ${id}` }, { status: 404 });
    }
    return Response.json({ ok: true, agent, timestamp: new Date().toISOString() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const denied = await authorizeAgentMutation(request, id);
  if (denied) return denied;

  /**
   * Deregister keeps the row; ?hard=true removes it.
   *
   * Mirrors user removal: the reversible action is the default so a reflexive
   * DELETE cannot destroy a registration outright. Either way the ownership
   * trail is preserved in its own table.
   */
  const hard = new URL(request.url).searchParams.get("hard") === "true";
  const session = await authenticateUser(request);

  if (hard) {
    const history = agentOwnershipHistory(id);
    if (!deleteAgent(id, session?.userId ?? null)) {
      return Response.json({ error: `Agent not found: ${id}` }, { status: 404 });
    }
    return Response.json({
      ok: true,
      mode: "deleted",
      agentId: id,
      // Returned so the caller can show who held it, now that the row is gone.
      ownershipHistory: agentOwnershipHistory(id),
      previousHistoryCount: history.length,
      timestamp: new Date().toISOString(),
    });
  }

  const agent = deregisterAgent(id);
  if (!agent) {
    return Response.json({ error: `Agent not found: ${id}` }, { status: 404 });
  }
  return Response.json({ ok: true, mode: "deregistered", agent, timestamp: new Date().toISOString() });
}
