import type { NextRequest } from "next/server";
import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { acknowledgeAgentContextMessage } from "@/lib/agent/context-bus";
import { writeAuditLogFromEntry as writeAuditLog } from "@/lib/store/audit";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const agentId = typeof body.agentId === "string" ? body.agentId : typeof body.agent_id === "string" ? body.agent_id : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentId);
  if (!agent) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const message = acknowledgeAgentContextMessage(db, id, agent.id);
  if (!message || message.toAgent !== agent.id) {
    return Response.json({ ok: false, error: "Message not found" }, { status: 404 });
  }
  writeAuditLog(db, {
    actor: agent.id,
    action: "agent_context_ack",
    target: "agent_context_messages",
    detail: JSON.stringify({ messageId: id, threadId: message.threadId }),
    severity: "info",
  });
  return Response.json({ ok: true, message, timestamp: new Date().toISOString() });
}
