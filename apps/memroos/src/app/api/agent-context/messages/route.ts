import type { NextRequest } from "next/server";
import { authenticateAgentHeaders, recordMemoryWrite } from "@/lib/agent-registry";
import { writeAuditLog } from "@/lib/audit";
import { scanContent } from "@/lib/content-scanner";
import { getDb } from "@/lib/db";
import { findSelfDeclaredAccessClaims } from "@/lib/agent-context-policy";
import {
  isAgentContextMessageType,
  isAgentContextStatus,
  listAgentContextMessages,
  postAgentContextMessage,
} from "@/lib/agent-context-bus";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const agentId = url.searchParams.get("agent") ?? undefined;
  const statusRaw = url.searchParams.get("status") ?? undefined;
  const box = url.searchParams.get("box") ?? "inbox";
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const agent = authenticateAgentHeaders(req.headers, agentId);
  if (!agent) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (statusRaw && !isAgentContextStatus(statusRaw)) {
    return Response.json({ ok: false, error: `Invalid status: ${statusRaw}` }, { status: 400 });
  }
  const status = statusRaw && isAgentContextStatus(statusRaw) ? statusRaw : undefined;
  if (!["inbox", "outbox", "all"].includes(box)) {
    return Response.json({ ok: false, error: `Invalid box: ${box}` }, { status: 400 });
  }

  const messages = listAgentContextMessages(getDb(), {
    agentId: agent.id,
    box: box as "inbox" | "outbox" | "all",
    status,
    threadId: url.searchParams.get("thread_id") ?? undefined,
    correlationId: url.searchParams.get("correlation_id") ?? undefined,
    limit,
  });
  return Response.json({ ok: true, messages, timestamp: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as unknown;
  if (!isRecord(body)) {
    return Response.json({ ok: false, error: "Invalid agent context payload" }, { status: 400 });
  }

  const fromAgent = asString(body.fromAgent) ?? asString(body.from_agent) ?? asString(body.agentId);
  const agent = authenticateAgentHeaders(req.headers, fromAgent);
  if (!agent) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const toAgent = asString(body.toAgent) ?? asString(body.to_agent);
  const rawBody = asString(body.body) ?? asString(body.content) ?? asString(body.text);
  if (!toAgent || !rawBody) {
    return Response.json({ ok: false, error: "toAgent and body are required" }, { status: 400 });
  }

  const messageTypeRaw = body.messageType ?? body.message_type ?? "message";
  if (!isAgentContextMessageType(messageTypeRaw)) {
    return Response.json({ ok: false, error: `Invalid messageType: ${String(messageTypeRaw)}` }, { status: 400 });
  }

  const selfDeclaredAccessClaims = findSelfDeclaredAccessClaims(body);
  if (selfDeclaredAccessClaims.length > 0) {
    writeAuditLog(getDb(), {
      actor: agent.id,
      action: "policy_denied",
      target: "agent_context_messages",
      detail: JSON.stringify({ code: "CONTROL_LAYER_REQUIRED", claims: selfDeclaredAccessClaims }),
      severity: "high",
    });
    return Response.json(
      {
        ok: false,
        code: "CONTROL_LAYER_REQUIRED",
        error: "Agent context payloads cannot self-declare user, OAuth, credential, scope, or data-access claims",
        detail: { claims: selfDeclaredAccessClaims },
      },
      { status: 403 }
    );
  }

  const scan = scanContent(rawBody);
  const db = getDb();
  writeAuditLog(db, {
    actor: agent.id,
    action: scan.blocked ? "content_blocked" : scan.matches.length > 0 ? "content_flagged" : "agent_context_send",
    target: "agent_context_messages",
    detail: JSON.stringify({ toAgent, messageType: messageTypeRaw, matches: scan.matches.map((m) => m.patternName) }),
    severity: scan.blocked ? "high" : scan.matches.length > 0 ? "medium" : "info",
  });
  if (scan.blocked) {
    return Response.json({ ok: false, error: "Content blocked by security scanner" }, { status: 403 });
  }

  let savedMemoryId: string | null = null;
  if (body.saveToMemory === true || body.save_to_memory === true) {
    const memoryResult = {
      source: "agent_context_bus",
      toAgent,
      messageType: messageTypeRaw,
      threadId: asString(body.threadId) ?? asString(body.thread_id) ?? null,
    };
    recordMemoryWrite(
      agent.id,
      {
        type: asString(body.memoryType) ?? asString(body.memory_type) ?? "episodic",
        content: scan.cleanContent,
        metadata: {
          ...(asObject(body.memoryMetadata) ?? asObject(body.memory_metadata) ?? {}),
          source: "agent_context_bus",
          to_agent: toAgent,
          message_type: messageTypeRaw,
        },
      },
      memoryResult
    );
    const row = db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
    savedMemoryId = `agent_memory_writes:${row.id}`;
  }

  const message = postAgentContextMessage(db, {
    fromAgent: agent.id,
    toAgent,
    body: scan.cleanContent,
    subject: asString(body.subject) ?? null,
    messageType: messageTypeRaw,
    threadId: asString(body.threadId) ?? asString(body.thread_id) ?? null,
    correlationId: asString(body.correlationId) ?? asString(body.correlation_id) ?? null,
    parentId: asString(body.parentId) ?? asString(body.parent_id) ?? null,
    priority: typeof body.priority === "number" ? body.priority : undefined,
    contextRefs: asArray(body.contextRefs) ?? asArray(body.context_refs) ?? [],
    artifacts: asObject(body.artifacts) ?? {},
    visibility: asString(body.visibility) ?? "internal",
    policy: asString(body.policy) ?? "agent_visible",
    replyRequired: body.replyRequired === true || body.reply_required === true,
    expiresAt: asString(body.expiresAt) ?? asString(body.expires_at) ?? null,
    savedMemoryId,
  });

  return Response.json({ ok: true, message, timestamp: new Date().toISOString() });
}
