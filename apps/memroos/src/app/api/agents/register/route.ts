import { registerAgent } from "@/lib/agent-registry";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import type { AgentPlatform, AgentProtocol, RegisterAgentInput } from "@/types";

export const dynamic = "force-dynamic";

const PLATFORMS = new Set([
  "cursor",
  "claude",
  "codex",
  "qwen",
  "pi",
  "gemini",
  "opencode",
  "cortex",
  "hermes",
  "openclaw",
  "chatgpt",
]);
const PROTOCOLS = new Set(["rest", "a2a", "ui", "local"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseInput(body: unknown): RegisterAgentInput | null {
  if (!isRecord(body)) return null;
  const { id, name, role, platform, protocol } = body;
  if (typeof id !== "string" || typeof name !== "string" || typeof role !== "string") return null;
  if (typeof platform !== "string" || !PLATFORMS.has(platform)) return null;
  if (typeof protocol !== "string" || !PROTOCOLS.has(protocol)) return null;

  return {
    id,
    name,
    role,
    platform: platform as AgentPlatform,
    protocol: protocol as AgentProtocol,
    company: typeof body.company === "string" ? body.company : undefined,
    location:
      body.location === "tailscale" || body.location === "cloudflare" || body.location === "local"
        ? body.location
        : undefined,
    host: typeof body.host === "string" ? body.host : undefined,
    port: typeof body.port === "number" ? body.port : undefined,
    healthEndpoint: typeof body.healthEndpoint === "string" ? body.healthEndpoint : undefined,
    tunnelUrl: typeof body.tunnelUrl === "string" ? body.tunnelUrl : undefined,
    capabilities: Array.isArray(body.capabilities)
      ? body.capabilities
          .filter(isRecord)
          .map((capability) => ({
            id: String(capability.id ?? ""),
            name: String(capability.name ?? capability.id ?? ""),
            description: String(capability.description ?? ""),
            tags: Array.isArray(capability.tags) ? capability.tags.map(String) : [],
          }))
          .filter((capability) => capability.id && capability.name)
      : [],
    metadata: isRecord(body.metadata) ? body.metadata : undefined,
    issueApiKey: body.issueApiKey !== false,
  };
}

export async function POST(request: Request) {
  if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }

  const body = (await request.json().catch(() => null)) as unknown;
  const input = parseInput(body);
  if (!input) {
    return Response.json({ ok: false, error: "Invalid registration body" }, { status: 400 });
  }

  const result = registerAgent(input);
  return Response.json({ ok: true, ...result, timestamp: new Date().toISOString() });
}
