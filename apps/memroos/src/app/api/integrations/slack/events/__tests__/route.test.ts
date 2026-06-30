// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `memroos-slack-events-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "routes.db");
const SIGNING_SECRET = "test-slack-signing-secret";

let closeDb: (() => void) | null = null;

function signedRequest(body: unknown, options: { secret?: string; timestamp?: number; signature?: string } = {}): Request {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const signature =
    options.signature ??
    `v0=${crypto.createHmac("sha256", options.secret ?? SIGNING_SECRET).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;

  return new Request("http://localhost/api/integrations/slack/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
    body: rawBody,
  });
}

function slackMessageEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: "event_callback",
    team_id: "T123",
    api_app_id: "A123",
    event_id: "Ev123",
    event_time: 1782763200,
    authorizations: [{ team_id: "T123" }],
    event: {
      type: "message",
      channel: "C123",
      user: "U123",
      text: "Slack can be a MemroOS memory source.",
      ts: "1782763200.123456",
      thread_ts: "1782763000.000000",
    },
    ...overrides,
  };
}

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
  process.env.MESSAGE_MEMORY_SLACK_ALLOW_TEAM_IDS = "T123";
  vi.resetModules();
  const route = await import("../route");
  const dbModule = await import("@/lib/db");
  closeDb = dbModule.closeDb;
  return { ...route, getDb: dbModule.getDb };
}

describe("Slack Events API memory route", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(() => {
    closeDb?.();
    closeDb = null;
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    delete process.env.SLACK_SIGNING_SECRET;
    delete process.env.MESSAGE_MEMORY_SLACK_ALLOW_TEAM_IDS;
    delete process.env.MESSAGE_MEMORY_SLACK_INCLUDE_BOT_MESSAGES;
    delete process.env.MESSAGE_MEMORY_SLACK_MAX_SKEW_SECONDS;
    delete process.env.MEMROOS_PUBLIC_BASE_URL;
    vi.restoreAllMocks();
  });

  it("returns a Slack app manifest with the configured Events API URL", async () => {
    process.env.MEMROOS_PUBLIC_BASE_URL = "https://memroos.example";
    const { GET } = await loadRoute();

    const response = await GET(new Request("http://localhost/api/integrations/slack/events"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.display_information.name).toBe("MemroOS Memory");
    expect(body.settings.event_subscriptions.request_url).toBe("https://memroos.example/api/integrations/slack/events");
    expect(body.settings.event_subscriptions.bot_events).toContain("message.channels");
  });

  it("answers Slack URL verification challenges after signature verification", async () => {
    const { POST } = await loadRoute();

    const response = await POST(signedRequest({ type: "url_verification", challenge: "challenge-token" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ challenge: "challenge-token" });
  });

  it("ingests signed Slack message events into provider-agnostic memory", async () => {
    const { POST, getDb } = await loadRoute();

    const response = await POST(signedRequest(slackMessageEvent()));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ ok: true, created: true, duplicate: false });

    const memoryRow = getDb()
      .prepare("SELECT provider, workspace_id, channel_id, thread_id, author_id, content FROM platform_message_memory")
      .get() as Record<string, unknown>;
    expect(memoryRow).toMatchObject({
      provider: "slack",
      workspace_id: "T123",
      channel_id: "C123",
      thread_id: "1782763000.000000",
      author_id: "U123",
      content: "Slack can be a MemroOS memory source.",
    });

    const recallRow = getDb().prepare("SELECT session_id, project, request_id, policy FROM messages").get() as Record<string, unknown>;
    expect(recallRow).toMatchObject({
      session_id: "platform:slack:T123:C123",
      project: "platform:slack",
      request_id: body.dedupeKey,
      policy: "indexable",
    });
  });

  it("dedupes retried Slack events by provider/team/channel/thread/message id", async () => {
    const { POST, getDb } = await loadRoute();
    const event = slackMessageEvent();

    const first = await POST(signedRequest(event));
    const second = await POST(signedRequest(event));

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ ok: true, created: false, duplicate: true });
    expect((getDb().prepare("SELECT COUNT(*) AS count FROM platform_message_memory").get() as { count: number }).count).toBe(1);
    expect((getDb().prepare("SELECT COUNT(*) AS count FROM messages").get() as { count: number }).count).toBe(1);
  });

  it("rejects invalid signatures before reading events", async () => {
    const { POST } = await loadRoute();

    const response = await POST(signedRequest(slackMessageEvent(), { signature: "v0=bad" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, error: "invalid_signature" });
  });

  it("skips bot messages by default", async () => {
    const { POST } = await loadRoute();
    const botEvent = slackMessageEvent({
      event: {
        type: "message",
        channel: "C123",
        bot_id: "B123",
        username: "summary-bot",
        text: "Automated message",
        ts: "1782763201.000000",
      },
    });

    const response = await POST(signedRequest(botEvent));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, ignored: true, reason: "bot_message" });
  });

  it("rejects non-allowlisted Slack teams", async () => {
    const { POST } = await loadRoute();

    const response = await POST(signedRequest(slackMessageEvent({ team_id: "T999", authorizations: [{ team_id: "T999" }] })));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ ok: false, error: "Slack team is not allowlisted" });
  });
});
