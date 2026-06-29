import type { MessageMemoryAdapter, NormalizedPlatformMessage } from "./types";

type DiscordAuthor = {
  id?: string;
  username?: string;
  global_name?: string | null;
  bot?: boolean;
};

type DiscordAttachment = {
  id?: string;
  url?: string;
  filename?: string;
  content_type?: string;
};

export type DiscordMessagePayload = {
  id?: string;
  guild_id?: string;
  channel_id?: string;
  thread_id?: string;
  content?: string;
  timestamp?: string;
  author?: DiscordAuthor;
  member?: { nick?: string | null };
  attachments?: DiscordAttachment[];
  jump_url?: string;
};

export type SlackEventPayload = {
  team_id?: string;
  event?: {
    type?: string;
    channel?: string;
    user?: string;
    bot_id?: string;
    username?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
    files?: Array<{ id?: string; url_private?: string; name?: string; mimetype?: string }>;
    permalink?: string;
  };
  authorizations?: Array<{ team_id?: string }>;
};

function hasRequiredString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isoFromDiscordTimestamp(timestamp: string | undefined): string {
  if (!timestamp) return new Date().toISOString();
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function isoFromSlackTs(ts: string | undefined): string {
  if (!ts) return new Date().toISOString();
  const seconds = Number(ts.split(".")[0]);
  const millis = Number(ts.split(".")[1]?.slice(0, 3).padEnd(3, "0") ?? "0");
  if (!Number.isFinite(seconds)) return new Date().toISOString();
  return new Date(seconds * 1000 + millis).toISOString();
}

export function normalizeDiscordMessage(raw: DiscordMessagePayload): NormalizedPlatformMessage | null {
  if (!hasRequiredString(raw.id) || !hasRequiredString(raw.channel_id) || !hasRequiredString(raw.guild_id)) {
    return null;
  }
  const authorId = raw.author?.id;
  if (!hasRequiredString(authorId)) return null;

  return {
    provider: "discord",
    workspaceId: raw.guild_id,
    channelId: raw.channel_id,
    messageId: raw.id,
    threadId: raw.thread_id ?? null,
    author: {
      id: authorId,
      username: raw.author?.username ?? null,
      displayName: raw.member?.nick ?? raw.author?.global_name ?? raw.author?.username ?? null,
      isBot: raw.author?.bot === true,
    },
    content: raw.content ?? "",
    timestamp: isoFromDiscordTimestamp(raw.timestamp),
    permalink: raw.jump_url ?? null,
    attachments: (raw.attachments ?? []).map((attachment) => ({
      id: attachment.id ?? null,
      url: attachment.url ?? null,
      filename: attachment.filename ?? null,
      contentType: attachment.content_type ?? null,
    })),
    raw: raw as Record<string, unknown>,
  };
}

export function normalizeSlackEvent(raw: SlackEventPayload): NormalizedPlatformMessage | null {
  const event = raw.event;
  if (!event || event.type !== "message") return null;
  const workspaceId = raw.team_id ?? raw.authorizations?.find((auth) => hasRequiredString(auth.team_id))?.team_id;
  if (!hasRequiredString(workspaceId) || !hasRequiredString(event.channel) || !hasRequiredString(event.ts)) {
    return null;
  }
  const authorId = event.user ?? event.bot_id;
  if (!hasRequiredString(authorId)) return null;

  return {
    provider: "slack",
    workspaceId,
    channelId: event.channel,
    messageId: event.ts,
    threadId: event.thread_ts ?? null,
    author: {
      id: authorId,
      username: event.username ?? null,
      displayName: event.username ?? null,
      isBot: hasRequiredString(event.bot_id),
    },
    content: event.text ?? "",
    timestamp: isoFromSlackTs(event.ts),
    permalink: event.permalink ?? null,
    attachments: (event.files ?? []).map((file) => ({
      id: file.id ?? null,
      url: file.url_private ?? null,
      filename: file.name ?? null,
      contentType: file.mimetype ?? null,
    })),
    raw: raw as Record<string, unknown>,
  };
}

export const discordMessageMemoryAdapter: MessageMemoryAdapter<DiscordMessagePayload> = {
  provider: "discord",
  supportsThreads: true,
  supportsPermalinks: true,
  normalize: normalizeDiscordMessage,
};

export const slackMessageMemoryAdapter: MessageMemoryAdapter<SlackEventPayload> = {
  provider: "slack",
  supportsThreads: true,
  supportsPermalinks: true,
  normalize: normalizeSlackEvent,
};
