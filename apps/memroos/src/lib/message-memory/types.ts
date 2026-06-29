export const MESSAGE_MEMORY_PROVIDERS = ["discord", "slack"] as const;

export type MessageMemoryProvider = (typeof MESSAGE_MEMORY_PROVIDERS)[number] | (string & {});

export type MessageMemoryVisibility = "private" | "internal" | "public_safe" | "public_approved";
export type MessageMemoryPolicy = "sealed" | "indexable";

export interface NormalizedMessageAuthor {
  id: string;
  username?: string | null;
  displayName?: string | null;
  isBot?: boolean;
}

export interface NormalizedMessageAttachment {
  id?: string | null;
  url?: string | null;
  filename?: string | null;
  contentType?: string | null;
}

export interface NormalizedPlatformMessage {
  provider: MessageMemoryProvider;
  workspaceId: string;
  channelId: string;
  messageId: string;
  threadId?: string | null;
  author: NormalizedMessageAuthor;
  content: string;
  timestamp: string;
  permalink?: string | null;
  attachments?: NormalizedMessageAttachment[];
  raw?: Record<string, unknown>;
}

export interface MessageMemoryIngestInput extends NormalizedPlatformMessage {
  project?: string;
  visibility?: MessageMemoryVisibility;
  policy?: MessageMemoryPolicy;
  metadata?: Record<string, unknown>;
}

export interface MessageMemoryRecord {
  id: string;
  dedupeKey: string;
  provider: string;
  workspaceId: string;
  channelId: string;
  threadId: string | null;
  providerMessageId: string;
  authorId: string;
  authorName: string | null;
  content: string;
  contentHash: string;
  timestamp: string;
  permalink: string | null;
  messageRowId: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MessageMemoryIngestResult {
  created: boolean;
  duplicate: boolean;
  dedupeKey: string;
  record: MessageMemoryRecord;
  messageRowId: number | null;
}

export interface MessageMemoryAdapter<TRaw = unknown> {
  readonly provider: MessageMemoryProvider;
  readonly supportsThreads: boolean;
  readonly supportsPermalinks: boolean;
  normalize(raw: TRaw): NormalizedPlatformMessage | null;
}
