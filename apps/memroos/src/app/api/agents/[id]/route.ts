import type { NextRequest } from "next/server";
import {
  deregisterAgent,
  getRegisteredAgent,
} from "@/lib/agent-registry";
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = getRegisteredAgent(id);
  if (!agent) {
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }

  const { id } = await params;
  const agent = deregisterAgent(id);
  if (!agent) {
    return Response.json({ error: `Agent not found: ${id}` }, { status: 404 });
  }
  return Response.json({ ok: true, agent, timestamp: new Date().toISOString() });
}
