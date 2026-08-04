import type { NextRequest } from "next/server";

import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { updateWriteRule, deleteWriteRule } from "@/lib/write-rules";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const agentHint = typeof body.agent === "string" ? body.agent : typeof body.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(req.headers, agentHint);
  if (!agent) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const ruleId = Number(id);
  if (!Number.isFinite(ruleId) || ruleId <= 0) {
    return Response.json({ ok: false, error: "Invalid rule id" }, { status: 400 });
  }

  const actorId = typeof body.actorId === "string" ? body.actorId : agent.id;
  const expectedVersion = typeof body.expectedVersion === "number" ? body.expectedVersion : typeof body.expected_version === "number" ? body.expected_version : NaN;
  if (!Number.isFinite(expectedVersion)) {
    return Response.json({ ok: false, error: "expectedVersion is required" }, { status: 400 });
  }

  try {
    const rule = updateWriteRule(getDb(), ruleId, {
      targetDocument: typeof body.targetDocument === "string" ? body.targetDocument : typeof body.target_document === "string" ? body.target_document : undefined,
      fallbackRule: typeof body.fallbackRule === "string" ? body.fallbackRule : typeof body.fallback_rule === "string" ? body.fallback_rule : undefined,
      actorId,
      expectedVersion,
    });
    return Response.json({ ok: true, rule, timestamp: new Date().toISOString() });
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
  const ruleId = Number(id);
  if (!Number.isFinite(ruleId) || ruleId <= 0) {
    return Response.json({ ok: false, error: "Invalid rule id" }, { status: 400 });
  }

  const actorId = typeof body.actorId === "string" ? body.actorId : agent.id;
  const expectedVersion = typeof body.expectedVersion === "number" ? body.expectedVersion : typeof body.expected_version === "number" ? body.expected_version : NaN;
  if (!Number.isFinite(expectedVersion)) {
    return Response.json({ ok: false, error: "expectedVersion is required" }, { status: 400 });
  }

  try {
    deleteWriteRule(getDb(), ruleId, { actorId, expectedVersion });
    return Response.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
