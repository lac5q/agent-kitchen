import crypto from "crypto";

function envFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function csvSet(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export interface SlackMessageMemoryConfig {
  signingSecret?: string;
  allowTeamIds: Set<string>;
  includeBotMessages: boolean;
  maxSkewSeconds: number;
}

export interface SlackRequestVerificationInput {
  headers: Headers;
  rawBody: string;
  signingSecret: string;
  nowMs?: number;
  maxSkewSeconds?: number;
}

export interface SlackRequestVerificationResult {
  ok: boolean;
  error?: "missing_headers" | "stale_request" | "invalid_signature";
}

export function loadSlackMessageMemoryConfig(source: NodeJS.ProcessEnv = process.env): SlackMessageMemoryConfig {
  return {
    signingSecret: source.SLACK_SIGNING_SECRET,
    allowTeamIds: csvSet(source.MESSAGE_MEMORY_SLACK_ALLOW_TEAM_IDS),
    includeBotMessages: envFlag(source.MESSAGE_MEMORY_SLACK_INCLUDE_BOT_MESSAGES, false),
    maxSkewSeconds: positiveInt(source.MESSAGE_MEMORY_SLACK_MAX_SKEW_SECONDS, 300),
  };
}

export function verifySlackRequest(input: SlackRequestVerificationInput): SlackRequestVerificationResult {
  const timestamp = input.headers.get("x-slack-request-timestamp");
  const signature = input.headers.get("x-slack-signature");
  if (!timestamp || !signature) return { ok: false, error: "missing_headers" };

  const parsedTimestamp = Number(timestamp);
  if (!Number.isFinite(parsedTimestamp)) return { ok: false, error: "missing_headers" };

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const maxSkewSeconds = input.maxSkewSeconds ?? 300;
  if (Math.abs(nowSeconds - parsedTimestamp) > maxSkewSeconds) {
    return { ok: false, error: "stale_request" };
  }

  const baseString = `v0:${timestamp}:${input.rawBody}`;
  const expected = `v0=${crypto.createHmac("sha256", input.signingSecret).update(baseString).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");

  if (actualBuffer.length !== expectedBuffer.length) {
    return { ok: false, error: "invalid_signature" };
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    ? { ok: true }
    : { ok: false, error: "invalid_signature" };
}

export function slackManifest(requestUrl: string) {
  return {
    display_information: {
      name: "MemroOS Memory",
      description: "Capture Slack context into MemroOS provider-agnostic message memory.",
      background_color: "#111827",
    },
    features: {
      bot_user: {
        display_name: "MemroOS Memory",
        always_online: false,
      },
    },
    oauth_config: {
      scopes: {
        bot: ["channels:history", "groups:history", "im:history", "mpim:history"],
      },
    },
    settings: {
      event_subscriptions: {
        request_url: requestUrl,
        bot_events: ["message.channels", "message.groups", "message.im", "message.mpim"],
      },
      interactivity: {
        is_enabled: false,
      },
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  };
}
