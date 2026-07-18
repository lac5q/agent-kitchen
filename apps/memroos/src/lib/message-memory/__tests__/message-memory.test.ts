// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { initSchema } from "@/lib/db-schema";
import {
  buildMessageMemoryDedupeKey,
  discordMessageMemoryAdapter,
  ingestPlatformMessageMemory,
  normalizeSlackEvent,
} from "@/lib/message-memory";

function seedDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

describe("message memory adapters", () => {
  it("normalizes Discord messages into provider-agnostic memory input", () => {
    const normalized = discordMessageMemoryAdapter.normalize({
      id: "115",
      guild_id: "guild-1",
      channel_id: "channel-1",
      thread_id: "thread-1",
      content: "Ship the Discord memory layer.",
      timestamp: "2026-06-29T20:00:00.000Z",
      author: { id: "user-1", username: "luis", global_name: "Luis" },
      member: { nick: "LC" },
      attachments: [{ id: "att-1", url: "https://cdn.example/file.png", filename: "file.png", content_type: "image/png" }],
      jump_url: "https://discord.com/channels/guild-1/channel-1/115",
    });

    expect(normalized).toMatchObject({
      provider: "discord",
      workspaceId: "guild-1",
      channelId: "channel-1",
      messageId: "115",
      threadId: "thread-1",
      content: "Ship the Discord memory layer.",
      author: { id: "user-1", displayName: "LC" },
    });
    expect(normalized?.attachments?.[0]).toMatchObject({ filename: "file.png", contentType: "image/png" });
  });

  it("normalizes Slack message events through the same interface", () => {
    const normalized = normalizeSlackEvent({
      team_id: "team-1",
      event: {
        type: "message",
        channel: "C123",
        user: "U123",
        text: "Slack can use the same message memory layer.",
        ts: "1782763200.123456",
        thread_ts: "1782763000.000000",
      },
    });

    expect(normalized).toMatchObject({
      provider: "slack",
      workspaceId: "team-1",
      channelId: "C123",
      messageId: "1782763200.123456",
      threadId: "1782763000.000000",
      author: { id: "U123", isBot: false },
    });
    expect(normalized?.timestamp).toBe("2026-06-29T20:00:00.123Z");
  });

  it("falls back for invalid timestamps and Slack authorization workspaces", () => {
    const discord = discordMessageMemoryAdapter.normalize({
      id: "invalid-time",
      guild_id: "guild-1",
      channel_id: "channel-1",
      timestamp: "not-a-date",
      author: { id: "user-1", username: "luis" },
    });
    expect(discord?.timestamp).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(discord?.timestamp ?? ""))).toBe(false);

    const slack = normalizeSlackEvent({
      authorizations: [{ team_id: " " }, { team_id: "team-auth" }],
      event: {
        type: "message",
        channel: "C123",
        bot_id: "B123",
        username: "deploy-bot",
        text: "Fallback workspace",
        ts: "not-a-number",
        files: [{ id: "F1", url_private: "https://files.example/private", name: "log.txt", mimetype: "text/plain" }],
      },
    });
    expect(slack).toMatchObject({
      workspaceId: "team-auth",
      author: { id: "B123", username: "deploy-bot", isBot: true },
      attachments: [{ id: "F1", filename: "log.txt", contentType: "text/plain" }],
    });
    expect(Number.isNaN(Date.parse(slack?.timestamp ?? ""))).toBe(false);
  });

  it("rejects invalid platform payloads before persistence", () => {
    expect(discordMessageMemoryAdapter.normalize({ id: "missing-required-fields" })).toBeNull();
    expect(normalizeSlackEvent({ team_id: "team-1", event: { type: "reaction_added" } })).toBeNull();
  });

  it("marks bot authors so mirrored recall rows use assistant role", () => {
    const db = seedDb();
    const normalized = discordMessageMemoryAdapter.normalize({
      id: "bot-1",
      guild_id: "guild-1",
      channel_id: "channel-1",
      content: "Automated summary",
      timestamp: "2026-06-29T20:00:00.000Z",
      author: { id: "bot-user", username: "summary-bot", bot: true },
    });

    expect(normalized?.author.isBot).toBe(true);
    ingestPlatformMessageMemory(db, normalized!);

    const row = db.prepare("SELECT role FROM messages WHERE request_id = ?").get(buildMessageMemoryDedupeKey(normalized!)) as {
      role: string;
    };
    expect(row.role).toBe("assistant");
    db.close();
  });
});

describe("message memory store", () => {
  it("dedupes provider messages and mirrors one row into messages for recall", () => {
    const db = seedDb();
    const normalized = discordMessageMemoryAdapter.normalize({
      id: "115",
      guild_id: "guild-1",
      channel_id: "channel-1",
      content: "Remember this once.",
      timestamp: "2026-06-29T20:00:00.000Z",
      author: { id: "user-1", username: "luis" },
    });
    expect(normalized).not.toBeNull();

    const first = ingestPlatformMessageMemory(db, normalized!);
    const second = ingestPlatformMessageMemory(db, normalized!);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.dedupeKey).toBe(first.dedupeKey);
    expect(second.messageRowId).toBe(first.messageRowId);

    const messageCount = db.prepare("SELECT COUNT(*) AS count FROM messages").get() as { count: number };
    const platformCount = db.prepare("SELECT COUNT(*) AS count FROM platform_message_memory").get() as { count: number };
    expect(messageCount.count).toBe(1);
    expect(platformCount.count).toBe(1);

    const message = db.prepare("SELECT session_id, project, agent_id, role, request_id, visibility, policy FROM messages").get() as Record<string, unknown>;
    expect(message).toMatchObject({
      session_id: "platform:discord:guild-1:channel-1",
      project: "platform:discord",
      agent_id: "discord:user-1",
      role: "user",
      request_id: first.dedupeKey,
      visibility: "internal",
      policy: "indexable",
    });
    expect(first.record.metadata).not.toHaveProperty("raw");
    expect(first.record.metadata).toHaveProperty("attachments");
    db.close();
  });

  it("dedupe key changes by provider workspace channel thread and provider message id", () => {
    const base = {
      provider: "discord",
      workspaceId: "guild-1",
      channelId: "channel-1",
      messageId: "115",
      threadId: "thread-1",
      author: { id: "user-1" },
      content: "Same content",
      timestamp: "2026-06-29T20:00:00.000Z",
    };

    expect(buildMessageMemoryDedupeKey(base)).toBe(buildMessageMemoryDedupeKey({ ...base, content: "Edited text" }));
    expect(buildMessageMemoryDedupeKey(base)).not.toBe(buildMessageMemoryDedupeKey({ ...base, messageId: "116" }));
    expect(buildMessageMemoryDedupeKey(base)).not.toBe(buildMessageMemoryDedupeKey({ ...base, provider: "slack" }));
  });
});
