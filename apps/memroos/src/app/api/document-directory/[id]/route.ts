import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent-registry";
import { updateDocumentDirectoryEntry, deleteDocumentDirectoryEntry } from "@/lib/write-rules";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const entryId = Number(id);
  if (!Number.isFinite(entryId) || entryId <= 0) {
    return Response.json({ ok: false, error: "Invalid entry id" }, { status: 400 });
  }

  const actorId = typeof body.actorId === "string" ? body.actorId : agent.id;
  const expectedVersion = typeof body.expectedVersion === "number" ? body.expectedVersion : typeof body.expected_version === "number" ? body.expected_version : NaN;
  if (!Number.isFinite(expectedVersion)) {
    return Response.json({ ok: false, error: "expectedVersion is required" }, { status: 400 });
  }

  try {
    const entry = updateDocumentDirectoryEntry(getDb(), entryId, {
      name: typeof body.name === "string" ? body.name : undefined,
      purpose: typeof body.purpose === "string" ? body.purpose : undefined,
      resourceId: typeof body.resourceId === "string" ? body.resourceId : typeof body.resource_id === "string" ? body.resource_id : undefined,
      actorId,
      expectedVersion,
    });
    return Response.json({ ok: true, entry, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const entryId = Number(id);
  if (!Number.isFinite(entryId) || entryId <= 0) {
    return Response.json({ ok: false, error: "Invalid entry id" }, { status: 400 });
  }

  const actorId = typeof body.actorId === "string" ? body.actorId : agent.id;
  const expectedVersion = typeof body.expectedVersion === "number" ? body.expectedVersion : typeof body.expected_version === "number" ? body.expected_version : NaN;
  if (!Number.isFinite(expectedVersion)) {
    return Response.json({ ok: false, error: "expectedVersion is required" }, { status: 400 });
  }

  try {
    deleteDocumentDirectoryEntry(getDb(), entryId, { actorId, expectedVersion });
    return Response.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
