import type { NextRequest } from "next/server";
import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { findReplyForAgentContextMessage, getAgentContextMessage } from "@/lib/agent/context-bus";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function waitMsFromRequest(req: NextRequest): number {
  const url = req.nextUrl ?? new URL(req.url);
  const parsed = Number(url.searchParams.get("wait_ms") ?? "0");
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(Math.trunc(parsed), 5_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = req.nextUrl ?? new URL(req.url);
  const agentHint = url.searchParams.get("agent") ?? undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const message = getAgentContextMessage(db, id);
  if (!message) {
    return Response.json({ ok: false, error: "Message not found" }, { status: 404 });
  }
  if (message.fromAgent !== agent.id && message.toAgent !== agent.id) {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (url.searchParams.get("wait_for") === "reply") {
    const deadline = Date.now() + waitMsFromRequest(req);
    let reply = findReplyForAgentContextMessage(db, id);
    while (!reply && Date.now() < deadline) {
      await sleep(Math.min(250, deadline - Date.now()));
      reply = findReplyForAgentContextMessage(db, id);
    }
    return Response.json({ ok: true, message, reply, timedOut: !reply, timestamp: new Date().toISOString() });
  }

  return Response.json({ ok: true, message, timestamp: new Date().toISOString() });
}
