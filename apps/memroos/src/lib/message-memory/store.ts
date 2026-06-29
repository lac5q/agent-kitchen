import crypto from "crypto";
import type Database from "better-sqlite3";
import { buildMessageMemoryDedupeKey, contentHash } from "./dedupe";
import type { MessageMemoryIngestInput, MessageMemoryIngestResult, MessageMemoryRecord } from "./types";

interface MessageMemoryRow {
  id: string;
  dedupe_key: string;
  provider: string;
  workspace_id: string;
  channel_id: string;
  thread_id: string | null;
  provider_message_id: string;
  author_id: string;
  author_name: string | null;
  content: string;
  content_hash: string;
  message_timestamp: string;
  permalink: string | null;
  message_row_id: number | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function rowToRecord(row: MessageMemoryRow): MessageMemoryRecord {
  return {
    id: row.id,
    dedupeKey: row.dedupe_key,
    provider: row.provider,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    threadId: row.thread_id,
    providerMessageId: row.provider_message_id,
    authorId: row.author_id,
    authorName: row.author_name,
    content: row.content,
    contentHash: row.content_hash,
    timestamp: row.message_timestamp,
    permalink: row.permalink,
    messageRowId: row.message_row_id,
    metadata: parseObject(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function ensureMessageMemorySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_message_memory (
      id                  TEXT PRIMARY KEY,
      dedupe_key          TEXT NOT NULL UNIQUE,
      provider            TEXT NOT NULL,
      workspace_id        TEXT NOT NULL,
      channel_id          TEXT NOT NULL,
      thread_id           TEXT,
      provider_message_id TEXT NOT NULL,
      author_id           TEXT NOT NULL,
      author_name         TEXT,
      content             TEXT NOT NULL,
      content_hash        TEXT NOT NULL,
      message_timestamp   TEXT NOT NULL,
      permalink           TEXT,
      message_row_id      INTEGER REFERENCES messages(id) ON DELETE SET NULL,
      metadata            TEXT NOT NULL DEFAULT '{}',
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS platform_message_memory_provider_ts
      ON platform_message_memory(provider, workspace_id, channel_id, message_timestamp DESC);
    CREATE INDEX IF NOT EXISTS platform_message_memory_thread
      ON platform_message_memory(provider, workspace_id, channel_id, thread_id, message_timestamp ASC);
    CREATE INDEX IF NOT EXISTS platform_message_memory_hash
      ON platform_message_memory(content_hash);
  `);
}

export function getMessageMemoryRecordByDedupeKey(
  db: Database.Database,
  dedupeKey: string
): MessageMemoryRecord | null {
  ensureMessageMemorySchema(db);
  const row = db
    .prepare("SELECT * FROM platform_message_memory WHERE dedupe_key = ?")
    .get(dedupeKey) as MessageMemoryRow | undefined;
  return row ? rowToRecord(row) : null;
}

function insertMessageRow(db: Database.Database, input: MessageMemoryIngestInput, dedupeKey: string): number | null {
  const sessionId = `platform:${input.provider}:${input.workspaceId}:${input.channelId}`;
  const project = input.project ?? `platform:${input.provider}`;
  const agentId = `${input.provider}:${input.author.id}`;
  const role = input.author.isBot ? "assistant" : "user";
  const visibility = input.visibility ?? "internal";
  const policy = input.policy ?? "indexable";

  db.prepare(
    `INSERT OR IGNORE INTO messages
       (session_id, project, agent_id, role, content, timestamp, request_id, visibility, policy)
     VALUES
       (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sessionId, project, agentId, role, input.content, input.timestamp, dedupeKey, visibility, policy);

  const row = db
    .prepare("SELECT id FROM messages WHERE session_id = ? AND request_id = ?")
    .get(sessionId, dedupeKey) as { id: number } | undefined;
  return row?.id ?? null;
}

export function ingestPlatformMessageMemory(
  db: Database.Database,
  input: MessageMemoryIngestInput
): MessageMemoryIngestResult {
  ensureMessageMemorySchema(db);
  const dedupeKey = buildMessageMemoryDedupeKey(input);

  const transaction = db.transaction((): MessageMemoryIngestResult => {
    const existing = getMessageMemoryRecordByDedupeKey(db, dedupeKey);
    if (existing) {
      return { created: false, duplicate: true, dedupeKey, record: existing, messageRowId: existing.messageRowId };
    }

    const timestamp = nowIso();
    const id = `pmm_${cryptoRandomId()}`;
    const hash = contentHash(input.content);
    const metadata = {
      ...(input.metadata ?? {}),
      attachments: input.attachments ?? [],
    };

    const messageRowId = insertMessageRow(db, input, dedupeKey);
    db.prepare(
      `INSERT INTO platform_message_memory (
         id, dedupe_key, provider, workspace_id, channel_id, thread_id, provider_message_id,
         author_id, author_name, content, content_hash, message_timestamp, permalink,
         message_row_id, metadata, created_at, updated_at
       ) VALUES (
         @id, @dedupeKey, @provider, @workspaceId, @channelId, @threadId, @providerMessageId,
         @authorId, @authorName, @content, @contentHash, @messageTimestamp, @permalink,
         @messageRowId, @metadata, @createdAt, @updatedAt
       )`
    ).run({
      id,
      dedupeKey,
      provider: input.provider,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      threadId: input.threadId ?? null,
      providerMessageId: input.messageId,
      authorId: input.author.id,
      authorName: input.author.displayName ?? input.author.username ?? null,
      content: input.content,
      contentHash: hash,
      messageTimestamp: input.timestamp,
      permalink: input.permalink ?? null,
      messageRowId,
      metadata: JSON.stringify(metadata),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const record = getMessageMemoryRecordByDedupeKey(db, dedupeKey);
    if (!record) throw new Error("Failed to read inserted platform message memory record");
    return { created: true, duplicate: false, dedupeKey, record, messageRowId };
  });

  return transaction();
}

function cryptoRandomId(): string {
  return crypto.randomUUID();
}
