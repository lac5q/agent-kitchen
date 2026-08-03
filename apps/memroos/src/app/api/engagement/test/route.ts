import type { NextRequest } from "next/server";
import {
  buildAgentContext,
  chatRuntimeStatus,
  resolveChatRuntimePlan,
  type ChatRuntimeCandidate,
} from "@/app/api/chat/chat-runtime";
import { apiError } from "@/lib/api-error";
import { getRemoteAgents, listAllAgentsUnscoped } from "@/lib/agent-registry";
import { selectAdapter } from "@/lib/dispatch/adapter-factory";
import type { RegisteredAgent, RemoteAgentConfig } from "@/types";

export const dynamic = "force-dynamic";

type CheckStatus = "ready" | "blocked" | "warning";

interface AgentEngagementCheck {
  agentId: string;
  name: string;
  status: RegisteredAgent["status"];
  chat: {
    status: CheckStatus;
    runner: "anthropic" | "opencode";
    model: string;
    source: string;
    fallbackRunner: "anthropic" | "opencode" | null;
    fallbackModel: string | null;
    detail: string;
    lastError?: string;
  };
  dispatch: {
    status: CheckStatus;
    adapter: string;
    detail: string;
  };
  voice: {
    status: CheckStatus;
    detail: string;
  };
}

function toDispatchConfig(agent: RegisteredAgent, remote?: RemoteAgentConfig): RemoteAgentConfig {
  if (remote) return remote;

  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    platform: agent.platform,
    protocol: agent.protocol,
    location: agent.location ?? "local",
    host: agent.host ?? "localhost",
    port: agent.port ?? 0,
    healthEndpoint: agent.healthEndpoint ?? "/health",
    tunnelUrl: agent.tunnelUrl ?? undefined,
    metadata: agent.metadata,
    skills: agent.capabilities.map((capability) => ({
      id: capability.id,
      name: capability.name,
      description: capability.description,
      tags: capability.tags,
      inputModes: ["text"],
      outputModes: ["text"],
    })),
  };
}

async function chatCheck(agent: RegisteredAgent): Promise<AgentEngagementCheck["chat"]> {
  const context = await buildAgentContext(agent.id);
  const plan = await resolveChatRuntimePlan(agent.id, context);
  const primary = plan.primary;
  const primaryStatus = chatRuntimeStatus(primary);
  const fallback = plan.candidates
    .slice(1)
    .find((candidate) => chatRuntimeStatus(candidate).status !== "blocked") ?? null;
  const status = primaryStatus.status === "blocked" && fallback ? "warning" : primaryStatus.status;
  const fallbackDetail = fallback
    ? ` Fallback ready: ${runtimeLabel(fallback)}.`
    : plan.candidates.length > 1
      ? " No ready fallback is currently available."
      : "";

  return {
    status,
    runner: primary.runner,
    model: primary.model,
    source: primary.source,
    fallbackRunner: fallback?.runner ?? null,
    fallbackModel: fallback?.model ?? null,
    detail: `${runtimeLabel(primary)} via ${primary.source}. ${primaryStatus.detail}${fallbackDetail}`,
    lastError: primaryStatus.lastError,
  };
}

function runtimeLabel(runtime: Pick<ChatRuntimeCandidate, "runner" | "model">): string {
  return `${runtime.runner}/${runtime.model}`;
}

function voiceCheck(): AgentEngagementCheck["voice"] {
  const configured = Boolean(process.env.ELEVENLABS_API_KEY);
  return {
    status: configured ? "ready" : "warning",
    detail: configured
      ? "TTS key is configured. Browser speech recognition is checked in the UI."
      : "ELEVENLABS_API_KEY is missing, so spoken replies will be muted.",
  };
}

function dispatchCheck(agent: RegisteredAgent, remote?: RemoteAgentConfig): AgentEngagementCheck["dispatch"] {
  const dispatchAgent = toDispatchConfig(agent, remote);
  const adapter = selectAdapter(dispatchAgent);
  const hasPush = adapter.name === "openclaw" || adapter.name === "a2a";
  const remoteDetail = remote
    ? "Remote transport is registered."
    : "Local agent will receive a queued hive delegation.";

  return {
    status: hasPush || !remote ? "ready" : "warning",
    adapter: adapter.name,
    detail: `${remoteDetail} Delivery mode: ${hasPush ? "push/queue file" : "poll queue"}.`,
  };
}

async function buildEngagementTestResponse(req: NextRequest | Request) {
  const body = (await req.json().catch(() => ({}))) as { agentIds?: string[] };
  const requested = new Set((body.agentIds ?? []).filter(Boolean));
  const remotes = new Map(getRemoteAgents().map((agent) => [agent.id, agent]));
  // Unscoped: operator-gated connectivity harness over the whole fleet.
  const agents = listAllAgentsUnscoped().filter((agent) => requested.size === 0 || requested.has(agent.id));

  return Response.json({
    ok: true,
    results: await Promise.all(agents.map(async (agent): Promise<AgentEngagementCheck> => ({
      agentId: agent.id,
      name: agent.name,
      status: agent.status,
      chat: await chatCheck(agent),
      dispatch: dispatchCheck(agent, remotes.get(agent.id)),
      voice: voiceCheck(),
    }))),
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest | Request) {
  try {
    return await buildEngagementTestResponse(req);
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
