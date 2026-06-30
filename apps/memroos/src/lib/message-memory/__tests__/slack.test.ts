// @vitest-environment node
import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { loadSlackMessageMemoryConfig, slackManifest, verifySlackRequest } from "../slack";

function headersFor(body: string, secret: string, timestamp: number, signature?: string): Headers {
  const computed = `v0=${crypto.createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
  return new Headers({
    "x-slack-request-timestamp": String(timestamp),
    "x-slack-signature": signature ?? computed,
  });
}

describe("Slack message memory helpers", () => {
  it("verifies Slack HMAC signatures", () => {
    const body = JSON.stringify({ type: "event_callback" });
    const timestamp = 1_782_763_200;

    expect(
      verifySlackRequest({
        headers: headersFor(body, "secret", timestamp),
        rawBody: body,
        signingSecret: "secret",
        nowMs: timestamp * 1000,
      })
    ).toEqual({ ok: true });
  });

  it("rejects stale Slack signatures", () => {
    const body = "{}";
    expect(
      verifySlackRequest({
        headers: headersFor(body, "secret", 100),
        rawBody: body,
        signingSecret: "secret",
        nowMs: 1_000_000,
        maxSkewSeconds: 300,
      })
    ).toEqual({ ok: false, error: "stale_request" });
  });

  it("loads allowlists and bot-message policy from env", () => {
    const config = loadSlackMessageMemoryConfig({
      SLACK_SIGNING_SECRET: "secret",
      MESSAGE_MEMORY_SLACK_ALLOW_TEAM_IDS: "T1, T2",
      MESSAGE_MEMORY_SLACK_INCLUDE_BOT_MESSAGES: "yes",
      MESSAGE_MEMORY_SLACK_MAX_SKEW_SECONDS: "600",
    } as unknown as NodeJS.ProcessEnv);

    expect(config.signingSecret).toBe("secret");
    expect([...config.allowTeamIds]).toEqual(["T1", "T2"]);
    expect(config.includeBotMessages).toBe(true);
    expect(config.maxSkewSeconds).toBe(600);
  });

  it("generates a public-safe Slack app manifest", () => {
    const manifest = slackManifest("https://memroos.example/api/integrations/slack/events");

    expect(manifest.settings.event_subscriptions.request_url).toBe("https://memroos.example/api/integrations/slack/events");
    expect(manifest.oauth_config.scopes.bot).toContain("channels:history");
    expect(JSON.stringify(manifest)).not.toContain("secret");
  });
});
