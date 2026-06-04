import type { NextRequest } from "next/server";
import { authenticateAgentHeaders, recordMemoryWrite } from "@/lib/agent-registry";
import { writeAuditLog } from "@/lib/audit";
import { scanContent } from "@/lib/content-scanner";
import { replyToAgentContextMessage } from "@/lib/agent-context-bus";
import { getDb } from "@/lib/db";
import { findSelfDeclaredAccessClaims } from "@/lib/agent-context-policy";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await req.json().catch(() => null)) as unknown;
  if (!isRecord(body)) {
    return Response.json({ ok: false, error: "Invalid reply payload" }, { status: 400 });
  }

  const fromAgent = asString(body.fromAgent) ?? asString(body.from_agent) ?? asString(body.agentId);
  const agent = authenticateAgentHeaders(req.headers, fromAgent);
  if (!agent) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = asString(body.body) ?? asString(body.content) ?? asString(body.text);
  if (!rawBody) {
    return Response.json({ ok: false, error: "body is required" }, { status: 400 });
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
        error: "Agent context replies cannot self-declare user, OAuth, credential, scope, or data-access claims",
        detail: { claims: selfDeclaredAccessClaims },
      },
      { status: 403 }
    );
  }

  const scan = scanContent(rawBody);
  const db = getDb();
  writeAuditLog(db, {
    actor: agent.id,
    action: scan.blocked ? "content_blocked" : scan.matches.length > 0 ? "content_flagged" : "agent_context_reply",
    target: "agent_context_messages",
    detail: JSON.stringify({ messageId: id, matches: scan.matches.map((m) => m.patternName) }),
    severity: scan.blocked ? "high" : scan.matches.length > 0 ? "medium" : "info",
  });
  if (scan.blocked) {
    return Response.json({ ok: false, error: "Content blocked by security scanner" }, { status: 403 });
  }

  let savedMemoryId: string | null = null;
  if (body.saveToMemory === true || body.save_to_memory === true) {
    recordMemoryWrite(
      agent.id,
      {
        type: asString(body.memoryType) ?? asString(body.memory_type) ?? "episodic",
        content: scan.cleanContent,
        metadata: {
          ...(asObject(body.memoryMetadata) ?? asObject(body.memory_metadata) ?? {}),
          source: "agent_context_bus",
          reply_to: id,
        },
      },
      { source: "agent_context_bus", replyTo: id }
    );
    const row = db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
    savedMemoryId = `agent_memory_writes:${row.id}`;
  }

  try {
    const result = replyToAgentContextMessage(db, id, {
      fromAgent: agent.id,
      body: scan.cleanContent,
      subject: asString(body.subject) ?? null,
      priority: typeof body.priority === "number" ? body.priority : undefined,
      contextRefs: Array.isArray(body.contextRefs) ? body.contextRefs : Array.isArray(body.context_refs) ? body.context_refs : [],
      artifacts: asObject(body.artifacts) ?? {},
      visibility: asString(body.visibility) ?? "internal",
      policy: asString(body.policy) ?? "agent_visible",
      replyRequired: false,
      expiresAt: asString(body.expiresAt) ?? asString(body.expires_at) ?? null,
      savedMemoryId,
    });
    return Response.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to reply" },
      { status: 400 }
    );
  }
}
