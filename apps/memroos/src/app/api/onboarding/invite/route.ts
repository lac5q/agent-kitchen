import crypto from "crypto";
import {
  createAgentOnboardingToken,
  OnboardingMintError,
  shellQuote,
} from "@/lib/agent/onboarding";
import { apiError } from "@/lib/api-error";
import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { getDb } from "@/lib/db";
import {
  resolvePublicMemroosUrlDetailed,
} from "@/lib/http/public-base-url";
import { recordOnboardingBaseUrlFallback } from "@/lib/store/onboarding-base-url-audit";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import type { AgentPlatform, AgentProtocol, RegisteredAgentCapability } from "@/types";

export const dynamic = "force-dynamic";

const PLATFORMS = new Set(["cursor", "claude", "cowork", "cline", "codex", "qwen", "pi", "gemini", "opencode", "zcode", "hermes", "openclaw", "chatgpt", "grok", "droid"]);
const PROTOCOLS = new Set(["rest", "a2a", "ui", "local"]);
export const MAX_ONBOARDING_TTL_MINUTES = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseCapabilities(value: unknown): RegisteredAgentCapability[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter(isRecord)
    .map((capability) => ({
      id: String(capability.id ?? ""),
      name: String(capability.name ?? capability.id ?? ""),
      description: String(capability.description ?? ""),
      tags: Array.isArray(capability.tags) ? capability.tags.map(String) : [],
    }))
    .filter((capability) => capability.id && capability.name);
}

async function buildInviteResponse(request: Request) {
  const session = await authenticateUser(request);
  if (session) {
    const roleError = requireRole(session.role, "operator");
    if (roleError) return roleError;
  } else if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const input = isRecord(body) ? body : {};
  const resolvedPublicUrl = resolvePublicMemroosUrlDetailed(request);
  const callerMemroosUrl = typeof input.memroosUrl === "string" ? input.memroosUrl : undefined;
  if (callerMemroosUrl === undefined && resolvedPublicUrl.source !== "env") {
    recordOnboardingBaseUrlFallback(resolvedPublicUrl);
  }
  const memroosUrl = callerMemroosUrl ?? resolvedPublicUrl.url;
  const requestedTtlMinutes = typeof input.ttlMinutes === "number" ? input.ttlMinutes : 15;
  const ttlMinutes = Number.isFinite(requestedTtlMinutes) ? requestedTtlMinutes : 15;
  const effectiveTtlMinutes = Math.min(Math.max(1, ttlMinutes), MAX_ONBOARDING_TTL_MINUTES);
  const requestedAgentId = typeof input.agentId === "string" ? input.agentId.trim() : "";
  const agentId = requestedAgentId || `onboarding-${crypto.randomUUID()}`;
  const defaultPlatform =
    typeof input.platform === "string" && PLATFORMS.has(input.platform)
      ? (input.platform as AgentPlatform)
      : undefined;
  const defaultProtocol =
    typeof input.protocol === "string" && PROTOCOLS.has(input.protocol)
      ? (input.protocol as AgentProtocol)
      : "rest";

  /**
   * Whose agent this will be.
   *
   * Defaults to the person creating the invite — the self-service case, "set up
   * my own laptop". An operator inviting on someone else's behalf passes
   * `ownerUserId` explicitly, so the agent lands owned by them rather than by
   * whoever happened to click the button.
   *
   * Without this the agent registers unowned, and unowned agents are visible
   * only to admins — so the person it was meant for cannot see their own agent.
   */
  const requestedOwner =
    typeof input.ownerUserId === "string" && input.ownerUserId.trim()
      ? input.ownerUserId.trim()
      : undefined;

  // Naming a different owner is an admin act. Otherwise an operator could mint a
  // token that registers an agent owned by anyone — which is the transfer
  // authorization on /ownership routed around rather than enforced.
  if (requestedOwner && session && requestedOwner !== session.userId && session.role !== "admin") {
    return apiError(403, "only an admin can create an invite owned by someone else");
  }
  const ownerUserId = requestedOwner || session?.userId;
  if (!ownerUserId) {
    return Response.json({ ok: false, error: "ownerUserId is required" }, { status: 400 });
  }
  if (!getDb().prepare("SELECT 1 FROM users WHERE id = ?").get(ownerUserId)) {
    return Response.json({ ok: false, error: "ownerUserId must reference an existing user" }, { status: 400 });
  }

  const { token, payload } = createAgentOnboardingToken({
    ownerUserId,
    memroosUrl,
    mcpUrl: typeof input.mcpUrl === "string" ? input.mcpUrl : undefined,
    ttlSeconds: effectiveTtlMinutes * 60,
    allowedAgentIds: [agentId],
    defaultPlatform,
    defaultProtocol,
    capabilities: parseCapabilities(input.capabilities),
  });

  const flags = [
    `--id ${shellQuote(agentId)}`,
    typeof input.name === "string" ? `--name ${shellQuote(input.name)}` : null,
    typeof input.role === "string" ? `--role ${shellQuote(input.role)}` : null,
    defaultPlatform ? `--platform ${shellQuote(defaultPlatform)}` : null,
    `--mcp-target ${shellQuote(typeof input.mcpTarget === "string" ? input.mcpTarget : "auto")}`,
  ].filter(Boolean);
  const command = `curl -fsSL ${shellQuote(`${payload.memroosUrl}/api/onboarding/script?token=${encodeURIComponent(token)}`)} | bash -s -- ${flags.join(" ")}`;

  return Response.json({
    ok: true,
    token,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    ttlMinutes: effectiveTtlMinutes,
    agentId,
    command,
    mcpUrl: payload.mcpUrl,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    return await buildInviteResponse(request);
  } catch (error: unknown) {
    if (error instanceof OnboardingMintError) {
      return apiError(500, `Onboarding server misconfiguration: ${error.message}`);
    }
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
