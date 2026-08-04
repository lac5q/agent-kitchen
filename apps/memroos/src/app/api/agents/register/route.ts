import {
  canManageAgent,
  getRegisteredAgent,
  registerAgent,
  type AgentViewer,
} from "@/lib/agent-registry";
import { authorizeRegistryWriteStrict, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";
import { authenticateUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { AgentPlatform, AgentProtocol, RegisterAgentInput } from "@/types";

export const dynamic = "force-dynamic";

const PLATFORMS = new Set([
  "cursor",
  "claude",
  "cowork",
  "cline",
  "codex",
  "qwen",
  "pi",
  "gemini",
  "opencode",
  "zcode",
  "cortex",
  "hermes",
  "openclaw",
  "chatgpt",
  "grok",
  "droid",
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
    metadata: isRecord(body.metadata) ? body.metadata : undefined,
    issueApiKey: body.issueApiKey === true,
  };
}

export async function POST(request: Request) {
  /**
   * Two callers, two ownership rules.
   *
   * A signed-in human registering from the console owns what they register —
   * anything else means a person can create an agent they cannot then see,
   * because unowned agents are admin-only.
   *
   * Machine callers must assert the human owner explicitly in the request body;
   * the operator key authorizes the write but is not itself an owner identity.
   */
  const session = await authenticateUser(request);
  const operatorAuthorized = !session && authorizeRegistryWriteStrict(request);
  if (!session && !operatorAuthorized) {
    return registryWriteUnauthorizedResponse();
  }

  const body = (await request.json().catch(() => null)) as unknown;
  if (isRecord(body) && Object.prototype.hasOwnProperty.call(body, "capabilities")) {
    return Response.json({ ok: false, error: "capabilities must not be supplied by the caller" }, { status: 400 });
  }
  const input = parseInput(body);
  if (!input) {
    return Response.json({ ok: false, error: "Invalid registration body" }, { status: 400 });
  }

  const assertedOwnerUserId =
    isRecord(body) && typeof body.ownerUserId === "string" && body.ownerUserId.trim()
      ? body.ownerUserId.trim()
      : undefined;
  const ownerUserId = session?.userId ?? assertedOwnerUserId;
  if (!ownerUserId) {
    return Response.json({ ok: false, error: "ownerUserId is required" }, { status: 400 });
  }
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(ownerUserId)) {
    return Response.json({ ok: false, error: "ownerUserId must reference an existing user" }, { status: 400 });
  }

  // Registration must not be a back door onto an agent that already exists.
  // Without this, a signed-in reviewer could POST an id they do not own and —
  // because the upsert path also touches name, host and metadata — quietly take
  // over someone else's agent. 404 rather than 403, matching the detail route:
  // the response must not confirm that the id exists.
  if (session) {
    const viewer: AgentViewer = { userId: session.userId, role: session.role };
    const existing = getRegisteredAgent(input.id, { includeDeregistered: true });
    if (existing && !canManageAgent(viewer, input.id)) {
      return Response.json({ ok: false, error: `Agent not found: ${input.id}` }, { status: 404 });
    }
  }

  const existing = getRegisteredAgent(input.id, { includeDeregistered: true });
  if (existing?.deregisteredAt) {
    return Response.json({ ok: false, error: "agent_revoked", code: "agent_revoked" }, { status: 409 });
  }

  // Never trust a client-supplied owner: it would let any caller attribute an
  // agent to someone else, or to themselves to gain sight of it.
  // Getting here means the caller is entitled to this agent: either they own it
  // (or are admin, checked above), or they hold the operator key. Re-registering
  // is a legitimate way for those callers to rotate a key — a reinstall on the
  // same machine is the ordinary case.
  const result = registerAgent({
    ...input,
    ownerId: ownerUserId,
    allowRekeyExisting: true,
  });
  return Response.json({ ok: true, ...result, timestamp: new Date().toISOString() });
}
