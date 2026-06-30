import { getDb } from "@/lib/db";
import { ingestPlatformMessageMemory, normalizeSlackEvent, type SlackEventPayload } from "@/lib/message-memory";
import { loadSlackMessageMemoryConfig, slackManifest, verifySlackRequest } from "@/lib/message-memory/slack";

export const dynamic = "force-dynamic";

type SlackEventsEnvelope = SlackEventPayload & {
  type?: string;
  challenge?: string;
  event_id?: string;
  event_time?: number;
  api_app_id?: string;
  enterprise_id?: string;
};

function jsonError(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

function configuredRequestUrl(request: Request): string {
  const fallback = new URL(request.url);
  const base = process.env.MEMROOS_PUBLIC_BASE_URL ?? `${fallback.protocol}//${fallback.host}`;
  return new URL("/api/integrations/slack/events", base).toString();
}

function parseJson(rawBody: string): SlackEventsEnvelope | null {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as SlackEventsEnvelope) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  return Response.json(slackManifest(configuredRequestUrl(request)));
}

export async function POST(request: Request) {
  const config = loadSlackMessageMemoryConfig();
  if (!config.signingSecret) return jsonError("Slack signing secret not configured", 503);

  const rawBody = await request.text();
  const verification = verifySlackRequest({
    headers: request.headers,
    rawBody,
    signingSecret: config.signingSecret,
    maxSkewSeconds: config.maxSkewSeconds,
  });
  if (!verification.ok) return jsonError(verification.error ?? "invalid_signature", 401);

  const body = parseJson(rawBody);
  if (!body) return jsonError("invalid JSON body", 400);

  if (body.type === "url_verification") {
    if (typeof body.challenge !== "string" || body.challenge.length === 0) {
      return jsonError("missing Slack challenge", 400);
    }
    return Response.json({ challenge: body.challenge });
  }

  if (body.type !== "event_callback") {
    return Response.json({ ok: true, ignored: true, reason: "unsupported_envelope_type" });
  }

  const normalized = normalizeSlackEvent(body);
  if (!normalized) {
    return Response.json({ ok: true, ignored: true, reason: "unsupported_event" });
  }

  if (config.allowTeamIds.size > 0 && !config.allowTeamIds.has(normalized.workspaceId)) {
    return jsonError("Slack team is not allowlisted", 403);
  }

  if (!config.includeBotMessages && normalized.author.isBot) {
    return Response.json({ ok: true, ignored: true, reason: "bot_message" });
  }

  const result = ingestPlatformMessageMemory(getDb(), {
    ...normalized,
    visibility: "internal",
    policy: "indexable",
    metadata: {
      provider: "slack",
      eventId: body.event_id ?? null,
      eventTime: body.event_time ?? null,
      apiAppId: body.api_app_id ?? null,
      enterpriseId: body.enterprise_id ?? null,
      teamId: normalized.workspaceId,
    },
  });

  return Response.json(
    {
      ok: true,
      created: result.created,
      duplicate: result.duplicate,
      dedupeKey: result.dedupeKey,
      messageRowId: result.messageRowId,
    },
    { status: result.created ? 201 : 200 }
  );
}
