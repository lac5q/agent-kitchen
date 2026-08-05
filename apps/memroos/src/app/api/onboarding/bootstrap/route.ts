import {
  createAgentOnboardingToken,
  OnboardingMintError,
  shellQuote,
} from "@/lib/agent/onboarding";
import {
  recordOnboardingBaseUrlFallback,
  resolvePublicMemroosUrlDetailed,
} from "@/lib/http/public-base-url";
import { apiError } from "@/lib/api-error";
import { authenticateUser } from "@/lib/auth/session";
import { PLATFORM_LABELS } from "@/lib/ui-constants";
import type { AgentPlatform } from "@/types";

export const dynamic = "force-dynamic";

const PLATFORMS = new Set([
  "cursor",
  "claude",
  "cline",
  "codex",
  "qwen",
  "pi",
  "gemini",
  "opencode",
  "zcode",
  "hermes",
  "openclaw",
  "chatgpt",
  "grok",
  "droid",
]);

const BOOTSTRAP_TTL_SECONDS = 60 * 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  const session = await authenticateUser(request);
  if (!session) {
    return Response.json({ ok: false, error: "authentication required" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const input = isRecord(body) ? body : {};
    const rawPlatforms = Array.isArray(input.platforms) ? input.platforms.map(String) : [];

    if (rawPlatforms.length === 0) {
      return Response.json({ ok: false, error: "platforms array is required" }, { status: 400 });
    }
    if (rawPlatforms.length > PLATFORMS.size) {
      return Response.json({ ok: false, error: "too many platforms" }, { status: 400 });
    }

    const unknown = rawPlatforms.filter((p) => !PLATFORMS.has(p));
    if (unknown.length > 0) {
      return Response.json(
        { ok: false, error: `unknown platforms: ${unknown.join(", ")}` },
        { status: 400 }
      );
    }

    // Never trust client memroosUrl / ownerUserId — session + resolver only.
    const resolvedPublicUrl = resolvePublicMemroosUrlDetailed(request);
    recordOnboardingBaseUrlFallback(resolvedPublicUrl);
    const memroosUrl = resolvedPublicUrl.url;
    const userShort = session.userId.slice(0, 8);

    const commands = rawPlatforms.map((platform) => {
      const agentId = `${userShort}-${platform}`;
      const { token, payload } = createAgentOnboardingToken({
        memroosUrl,
        ttlSeconds: BOOTSTRAP_TTL_SECONDS,
        allowedAgentIds: [agentId],
        defaultPlatform: platform as AgentPlatform,
        defaultProtocol: "rest",
        ownerUserId: session.userId,
      });

      const flags = [
        `--id ${shellQuote(agentId)}`,
        `--platform ${shellQuote(platform)}`,
        `--mcp-target ${shellQuote("auto")}`,
      ].join(" ");

      const command = `curl -fsSL ${shellQuote(
        `${payload.memroosUrl}/api/onboarding/script?token=${encodeURIComponent(token)}`
      )} | bash -s -- ${flags}`;

      return {
        platform,
        label: PLATFORM_LABELS[platform] ?? platform,
        agentId,
        command,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
      };
    });

    return Response.json({
      ok: true,
      commands,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof OnboardingMintError) {
      return apiError(500, `Onboarding server misconfiguration: ${error.message}`);
    }
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
