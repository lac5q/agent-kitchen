import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent-registry";
import { getDocumentDirectory, createDocumentDirectoryEntry } from "@/lib/write-rules";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const agentHint = url.searchParams.get("agent") ?? undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const spaceId = url.searchParams.get("spaceId") ?? url.searchParams.get("space_id") ?? "";
  if (!spaceId.trim()) {
    return Response.json({ ok: false, error: "spaceId is required" }, { status: 400 });
  }

  try {
    const entries = getDocumentDirectory(getDb(), spaceId);
    return Response.json({ ok: true, entries, timestamp: new Date().toISOString() });
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

  if (!spaceId.trim()) {
    return Response.json({ ok: false, error: "spaceId is required" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  if (!name.trim()) {
    return Response.json({ ok: false, error: "name is required" }, { status: 400 });
  }

  try {
    const entry = createDocumentDirectoryEntry(getDb(), {
      spaceId,
      name,
      purpose: typeof body.purpose === "string" ? body.purpose : undefined,
      resourceId: typeof body.resourceId === "string" ? body.resourceId : typeof body.resource_id === "string" ? body.resource_id : undefined,
      actorId,
    });
    return Response.json({ ok: true, entry, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
