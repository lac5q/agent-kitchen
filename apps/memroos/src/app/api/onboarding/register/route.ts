import { buildMemroosMcpConfig, verifyAgentOnboardingToken } from "@/lib/agent-onboarding";
import { registerAgent } from "@/lib/agent-registry";
import type { AgentLocation, AgentPlatform, AgentProtocol, RegisterAgentInput } from "@/types";

export const dynamic = "force-dynamic";

const PLATFORMS = new Set(["cursor", "claude", "codex", "qwen", "pi", "gemini", "opencode", "zcode", "hermes", "openclaw", "chatgpt"]);
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
  const parsed = parseInput((await request.json().catch(() => null)) as unknown);
  if (!parsed) {
    return Response.json({ ok: false, error: "Invalid onboarding registration body" }, { status: 400 });
  }

  const verified = verifyAgentOnboardingToken(parsed.token);
  if (!verified.ok) {
    return Response.json({ ok: false, error: verified.error }, { status: 403 });
  }

  if (verified.payload.allowedAgentIds?.length && !verified.payload.allowedAgentIds.includes(parsed.input.id)) {
    return Response.json({ ok: false, error: "Onboarding token is not valid for this agent id" }, { status: 403 });
  }

  const result = registerAgent({
    ...parsed.input,
    platform: parsed.input.platform ?? verified.payload.defaultPlatform ?? "codex",
    protocol: parsed.input.protocol ?? verified.payload.defaultProtocol ?? "rest",
    capabilities: verified.payload.capabilities ?? parsed.input.capabilities ?? [],
    metadata: {
      ...parsed.input.metadata,
      onboardedVia: "memroos",
      onboardedAt: new Date().toISOString(),
      mcpUrl: verified.payload.mcpUrl,
    },
  });

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
