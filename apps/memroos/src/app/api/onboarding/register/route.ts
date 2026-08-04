import {
  buildMemroosMcpConfig,
  consumeAgentOnboardingToken,
  OnboardingTokenReplayError,
  verifyAgentOnboardingToken,
} from "@/lib/agent-onboarding";
import { AgentRegistrationError, getRegisteredAgent, registerAgent } from "@/lib/agent-registry";
import { getDb } from "@/lib/db";
import type { AgentLocation, AgentPlatform, AgentProtocol, RegisterAgentInput } from "@/types";

export const dynamic = "force-dynamic";

const PLATFORMS = new Set(["cursor", "claude", "cline", "codex", "qwen", "pi", "gemini", "opencode", "zcode", "hermes", "openclaw", "chatgpt", "grok", "droid"]);
const PROTOCOLS = new Set(["rest", "a2a", "ui", "local"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseLocation(value: unknown): AgentLocation | undefined {
  return value === "tailscale" || value === "cloudflare" || value === "local" ? value : undefined;
}

function parseInput(body: unknown): { token: string; input: RegisterAgentInput } | null {
  if (!isRecord(body) || typeof body.token !== "string") return null;
  const { id, name, role } = body;
  if (typeof id !== "string" || typeof name !== "string" || typeof role !== "string") return null;
  if (typeof body.platform !== "string" || !PLATFORMS.has(body.platform)) return null;
  const protocol =
    typeof body.protocol === "string" && PROTOCOLS.has(body.protocol)
      ? (body.protocol as AgentProtocol)
      : "rest";

  return {
    token: body.token,
    input: {
      id,
      name,
      role,
      platform: body.platform as AgentPlatform,
      protocol,
      company: typeof body.company === "string" ? body.company : undefined,
      location: parseLocation(body.location),
      host: typeof body.host === "string" ? body.host : undefined,
      port: typeof body.port === "number" ? body.port : undefined,
      healthEndpoint: typeof body.healthEndpoint === "string" ? body.healthEndpoint : undefined,
      tunnelUrl: typeof body.tunnelUrl === "string" ? body.tunnelUrl : undefined,
      metadata: isRecord(body.metadata) ? body.metadata : {},
      issueApiKey: body.issueApiKey !== false,
    },
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  if (isRecord(body) && Object.prototype.hasOwnProperty.call(body, "capabilities")) {
    return Response.json({ ok: false, error: "capabilities must not be supplied by the caller" }, { status: 400 });
  }

  const parsed = parseInput(body);
  if (!parsed) {
    return Response.json({ ok: false, error: "Invalid onboarding registration body" }, { status: 400 });
  }

  const verified = verifyAgentOnboardingToken(parsed.token);
  if (!verified.ok) {
    return Response.json({ ok: false, error: verified.error }, { status: 403 });
  }

  if (!verified.payload.ownerUserId) {
    return Response.json({ ok: false, error: "ownerUserId is required" }, { status: 400 });
  }
  if (!getDb().prepare("SELECT 1 FROM users WHERE id = ?").get(verified.payload.ownerUserId)) {
    return Response.json({ ok: false, error: "ownerUserId must reference an existing user" }, { status: 400 });
  }

  if (!verified.payload.allowedAgentIds || !verified.payload.allowedAgentIds.includes(parsed.input.id)) {
    return Response.json({ ok: false, error: "Onboarding token is not valid for this agent id" }, { status: 403 });
  }

  // Re-onboarding the same agent (a reinstall) must still return a usable key,
  // but a token must never re-key an agent that belongs to someone else.
  const existing = getRegisteredAgent(parsed.input.id, { includeDeregistered: true });
  if (existing?.deregisteredAt) {
    return Response.json({ ok: false, error: "agent_revoked", code: "agent_revoked" }, { status: 409 });
  }
  if (existing && existing.ownerId && existing.ownerId !== verified.payload.ownerUserId) {
    return Response.json({ ok: false, error: `Agent not found: ${parsed.input.id}` }, { status: 404 });
  }

  let result;
  try {
    result = registerAgent(
      {
        ...parsed.input,
        allowRekeyExisting: true,
        platform: parsed.input.platform ?? verified.payload.defaultPlatform ?? "codex",
        protocol: parsed.input.protocol ?? verified.payload.defaultProtocol ?? "rest",
        capabilities: verified.payload.capabilities ?? [],
        // Ownership claim comes only from the signed token — never from request JSON.
        ownerId: verified.payload.ownerUserId,
        metadata: {
          ...parsed.input.metadata,
          onboardedVia: "memroos",
          onboardedAt: new Date().toISOString(),
          mcpUrl: verified.payload.mcpUrl,
        },
      },
      { beforePersist: () => consumeAgentOnboardingToken(verified.payload, parsed.input.id) }
    );
  } catch (error) {
    if (error instanceof OnboardingTokenReplayError) {
      return Response.json({ ok: false, error: error.code, code: error.code }, { status: 403 });
    }
    if (error instanceof AgentRegistrationError && error.code === "agent_revoked") {
      return Response.json({ ok: false, error: error.code, code: error.code }, { status: 409 });
    }
    throw error;
  }

  return Response.json({
    ok: true,
    ...result,
    mcp: buildMemroosMcpConfig(verified.payload.mcpUrl),
    env: {
      MEMROOS_URL: verified.payload.memroosUrl,
      MEMROOS_AGENT_ID: result.agent.id,
    },
    timestamp: new Date().toISOString(),
  });
}
