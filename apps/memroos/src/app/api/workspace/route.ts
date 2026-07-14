import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent-registry";
import { getActiveWorkspace, loadWorkspace, clearWorkspace } from "@/lib/workspace";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const agentHint = url.searchParams.get("agent") ?? undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const workspace = getActiveWorkspace(getDb());
    return Response.json({ ok: true, workspace, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const spaceId = typeof body.spaceId === "string" ? body.spaceId : typeof body.space_id === "string" ? body.space_id : "";
  const actorId = typeof body.actorId === "string" ? body.actorId : agent.id;
  const isHeadless = body.isHeadless === true || body.is_headless === true;

  if (!spaceId.trim()) {
    return Response.json({ ok: false, error: "spaceId is required" }, { status: 400 });
  }

  try {
    const workspace = loadWorkspace(getDb(), { spaceId, actorId, isHeadless });
    return Response.json({ ok: true, workspace, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const agentHint = url.searchParams.get("agent") ?? undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    clearWorkspace(getDb());
    return Response.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
