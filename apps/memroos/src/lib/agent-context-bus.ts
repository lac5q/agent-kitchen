import crypto from "crypto";
import type Database from "better-sqlite3";

export const AGENT_CONTEXT_MESSAGE_TYPES = [
  "message",
  "request",
  "reply",
  "context_sync",
  "knowledge_save",
] as const;

export const AGENT_CONTEXT_STATUSES = [
  "pending",
  "delivered",
  "acknowledged",
  "replied",
  "canceled",
  "failed",
] as const;

export type AgentContextMessageType = (typeof AGENT_CONTEXT_MESSAGE_TYPES)[number];
export type AgentContextStatus = (typeof AGENT_CONTEXT_STATUSES)[number];

export interface AgentContextMessage {
  id: string;
  threadId: string;
  correlationId: string;
  parentId: string | null;
  fromAgent: string;
  toAgent: string;
  messageType: AgentContextMessageType;
  status: AgentContextStatus;
  priority: number;
  subject: string | null;
  body: string;
  contextRefs: unknown[];
  artifacts: Record<string, unknown>;
  visibility: string;
  policy: string;
  replyRequired: boolean;
  savedMemoryId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface PostAgentContextMessageInput {
  fromAgent: string;
  toAgent: string;
  body: string;
  subject?: string | null;
  messageType?: AgentContextMessageType;
  threadId?: string | null;
  correlationId?: string | null;
  parentId?: string | null;
  priority?: number;
  contextRefs?: unknown[];
  artifacts?: Record<string, unknown>;
  visibility?: string;
  policy?: string;
  replyRequired?: boolean;
  expiresAt?: string | null;
  savedMemoryId?: string | null;
}

export interface ListAgentContextMessagesOptions {
  agentId?: string;
  box?: "inbox" | "outbox" | "all";
  status?: AgentContextStatus;
  threadId?: string;
  correlationId?: string;
  limit?: number;
}

interface AgentContextMessageRow {
  id: string;
  thread_id: string;
  correlation_id: string;
  parent_id: string | null;
  from_agent: string;
  to_agent: string;
  message_type: AgentContextMessageType;
  status: AgentContextStatus;
  priority: number;
  subject: string | null;
  body: string;
  context_refs: string;
  artifacts: string;
  visibility: string;
  policy: string;
  reply_required: number;
  saved_memory_id: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function parseArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function clampPriority(priority: number | undefined): number {
  if (!Number.isFinite(priority)) return 5;
  return Math.max(1, Math.min(9, Math.trunc(priority ?? 5)));
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.max(1, Math.min(100, Math.trunc(limit ?? 20)));
}

function rowToMessage(row: AgentContextMessageRow): AgentContextMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    correlationId: row.correlation_id,
    parentId: row.parent_id,
    fromAgent: row.from_agent,
    toAgent: row.to_agent,
    messageType: row.message_type,
    status: row.status,
    priority: row.priority,
    subject: row.subject,
    body: row.body,
    contextRefs: parseArray(row.context_refs),
    artifacts: parseObject(row.artifacts),
    visibility: row.visibility,
    policy: row.policy,
    replyRequired: row.reply_required === 1,
    savedMemoryId: row.saved_memory_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

export function isAgentContextMessageType(value: unknown): value is AgentContextMessageType {
  return typeof value === "string" && (AGENT_CONTEXT_MESSAGE_TYPES as readonly string[]).includes(value);
}

export function isAgentContextStatus(value: unknown): value is AgentContextStatus {
  return typeof value === "string" && (AGENT_CONTEXT_STATUSES as readonly string[]).includes(value);
}

export function ensureAgentContextBusSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_context_messages (
      id              TEXT PRIMARY KEY,
      thread_id       TEXT    NOT NULL,
      correlation_id  TEXT    NOT NULL,
      parent_id       TEXT,
      from_agent      TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
      to_agent        TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
      message_type    TEXT    NOT NULL
                         CHECK(message_type IN ('message','request','reply','context_sync','knowledge_save')),
      status          TEXT    NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending','delivered','acknowledged','replied','canceled','failed')),
      priority        INTEGER NOT NULL DEFAULT 5,
      subject         TEXT,
      body            TEXT    NOT NULL,
      context_refs    TEXT    NOT NULL DEFAULT '[]',
      artifacts       TEXT    NOT NULL DEFAULT '{}',
      visibility      TEXT    NOT NULL DEFAULT 'internal',
      policy          TEXT    NOT NULL DEFAULT 'agent_visible',
      reply_required  INTEGER NOT NULL DEFAULT 0,
      saved_memory_id TEXT,
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL,
      expires_at      TEXT
    );
    CREATE INDEX IF NOT EXISTS agent_context_messages_inbox
      ON agent_context_messages(to_agent, status, priority, created_at);
    CREATE INDEX IF NOT EXISTS agent_context_messages_outbox
      ON agent_context_messages(from_agent, created_at DESC);
    CREATE INDEX IF NOT EXISTS agent_context_messages_thread
      ON agent_context_messages(thread_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS agent_context_messages_correlation
      ON agent_context_messages(correlation_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS agent_context_messages_parent
      ON agent_context_messages(parent_id, created_at ASC);
  `);
}

export function postAgentContextMessage(
  db: Database.Database,
  input: PostAgentContextMessageInput
): AgentContextMessage {
  ensureAgentContextBusSchema(db);
  const id = newId("acm");
  const timestamp = nowIso();
  const threadId = input.threadId || newId("thread");
  const correlationId = input.correlationId || newId("corr");
  const messageType = input.messageType ?? "message";

  if (!isAgentContextMessageType(messageType)) {
    throw new Error(`Invalid agent context message type: ${String(messageType)}`);
  }

  db.prepare(
    `INSERT INTO agent_context_messages (
       id, thread_id, correlation_id, parent_id, from_agent, to_agent, message_type,
       status, priority, subject, body, context_refs, artifacts, visibility, policy,
       reply_required, saved_memory_id, created_at, updated_at, expires_at
     )
     VALUES (
       @id, @threadId, @correlationId, @parentId, @fromAgent, @toAgent, @messageType,
       'pending', @priority, @subject, @body, @contextRefs, @artifacts, @visibility, @policy,
       @replyRequired, @savedMemoryId, @timestamp, @timestamp, @expiresAt
     )`
  ).run({
    id,
    threadId,
    correlationId,
    parentId: input.parentId ?? null,
    fromAgent: input.fromAgent,
    toAgent: input.toAgent,
    messageType,
    priority: clampPriority(input.priority),
    subject: input.subject ?? null,
    body: input.body,
    contextRefs: JSON.stringify(input.contextRefs ?? []),
    artifacts: JSON.stringify(input.artifacts ?? {}),
    visibility: input.visibility ?? "internal",
    policy: input.policy ?? "agent_visible",
    replyRequired: input.replyRequired ? 1 : 0,
    savedMemoryId: input.savedMemoryId ?? null,
    timestamp,
    expiresAt: input.expiresAt ?? null,
  });

  return getAgentContextMessage(db, id) as AgentContextMessage;
}

export function getAgentContextMessage(
  db: Database.Database,
  messageId: string
): AgentContextMessage | null {
  ensureAgentContextBusSchema(db);
  const row = db
    .prepare("SELECT * FROM agent_context_messages WHERE id = ?")
    .get(messageId) as AgentContextMessageRow | undefined;
  return row ? rowToMessage(row) : null;
}

export function listAgentContextMessages(
  db: Database.Database,
  options: ListAgentContextMessagesOptions = {}
): AgentContextMessage[] {
  ensureAgentContextBusSchema(db);
  const where: string[] = [];
  const params: Record<string, unknown> = { limit: clampLimit(options.limit) };
  const box = options.box ?? "inbox";

  if (options.agentId) {
    params.agentId = options.agentId;
    if (box === "outbox") {
      where.push("from_agent = @agentId");
    } else if (box === "all") {
      where.push("(from_agent = @agentId OR to_agent = @agentId)");
    } else {
      where.push("to_agent = @agentId");
    }
  }
  if (options.status) {
    where.push("status = @status");
    params.status = options.status;
  }
  if (options.threadId) {
    where.push("thread_id = @threadId");
    params.threadId = options.threadId;
  }
  if (options.correlationId) {
    where.push("correlation_id = @correlationId");
    params.correlationId = options.correlationId;
  }

  const rows = db
    .prepare(
      `SELECT * FROM agent_context_messages
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY priority ASC, created_at ASC
       LIMIT @limit`
    )
    .all(params) as AgentContextMessageRow[];
  return rows.map(rowToMessage);
}

export function acknowledgeAgentContextMessage(
  db: Database.Database,
  messageId: string,
  agentId: string
): AgentContextMessage | null {
  ensureAgentContextBusSchema(db);
  const timestamp = nowIso();
  db.prepare(
    `UPDATE agent_context_messages
     SET status = 'acknowledged', updated_at = ?
     WHERE id = ? AND to_agent = ? AND status IN ('pending','delivered')`
  ).run(timestamp, messageId, agentId);
  return getAgentContextMessage(db, messageId);
}

export function replyToAgentContextMessage(
  db: Database.Database,
  messageId: string,
  input: Omit<PostAgentContextMessageInput, "toAgent" | "threadId" | "correlationId" | "parentId" | "messageType">
): { original: AgentContextMessage; reply: AgentContextMessage } {
  ensureAgentContextBusSchema(db);
  const original = getAgentContextMessage(db, messageId);
  if (!original) {
    throw new Error(`Unknown agent context message: ${messageId}`);
  }
  if (original.toAgent !== input.fromAgent) {
    throw new Error("Only the addressed agent can reply to this message");
  }

  const reply = postAgentContextMessage(db, {
    ...input,
    toAgent: original.fromAgent,
    threadId: original.threadId,
    correlationId: original.correlationId,
    parentId: original.id,
    messageType: "reply",
  });

  db.prepare(
    `UPDATE agent_context_messages
     SET status = 'replied', updated_at = ?
     WHERE id = ?`
  ).run(nowIso(), original.id);

  return {
    original: getAgentContextMessage(db, original.id) as AgentContextMessage,
    reply,
  };
}

export function findReplyForAgentContextMessage(
  db: Database.Database,
  messageId: string
): AgentContextMessage | null {
  ensureAgentContextBusSchema(db);
  const row = db
    .prepare(
      `SELECT * FROM agent_context_messages
       WHERE parent_id = ? AND message_type = 'reply'
       ORDER BY created_at ASC
       LIMIT 1`
    )
    .get(messageId) as AgentContextMessageRow | undefined;
  return row ? rowToMessage(row) : null;
}
