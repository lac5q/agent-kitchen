import type { NextRequest } from "next/server";

import {
  canManageAgent,
  canViewAgent,
  getRegisteredAgent,
  setAgentShared,
  transferAgentOwnership,
  type AgentViewer,
} from "@/lib/agent-registry";
import { authenticateUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Share or transfer an agent.
 *
 * Per operator decision 2026-08-02: the owner may share their own agent, and
 * both the owner and an admin may transfer one. Management is deliberately
 * narrower than visibility — seeing a shared agent must not imply being able to
 * reassign it, or sharing would become a way to lose your agent.
 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const session = await authenticateUser(request);
  if (!session) return Response.json({ error: "authentication required" }, { status: 401 });
  const viewer: AgentViewer = { userId: session.userId, role: session.role };

  const agent = getRegisteredAgent(id, { includeDeregistered: true });
  // Same reasoning as the detail route: do not confirm existence to someone who
  // cannot see it.
  if (!agent || !canViewAgent(viewer, id)) {
    return Response.json({ error: `Agent not found: ${id}` }, { status: 404 });
  }
  if (!canManageAgent(viewer, id)) {
    return Response.json(
      { error: "only the owner or an admin can change this agent" },
      { status: 403 }
    );
  }

  let body: { shared?: unknown; transferToUserId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }

  if (typeof body.shared === "boolean") {
    setAgentShared(id, body.shared);
  }

  if (typeof body.transferToUserId === "string" && body.transferToUserId.trim()) {
    const target = getDb()
      .prepare("SELECT id, disabled_at FROM users WHERE id = ?")
      .get(body.transferToUserId.trim()) as { id: string; disabled_at: string | null } | undefined;
    if (!target) {
      return Response.json({ error: "target user not found" }, { status: 400 });
    }
    // Handing an agent to a disabled account would strand it: nobody can sign in
    // to manage it, and it is not unowned either, so it stops appearing as a
    // defect to fix.
    if (target.disabled_at) {
      return Response.json(
        { error: "cannot transfer to a disabled account" },
        { status: 400 }
      );
    }
    transferAgentOwnership(id, target.id);
  }

  const updated = getRegisteredAgent(id, { includeDeregistered: true });
  return Response.json({
    ok: true,
    id,
    ownerId: updated?.ownerId ?? null,
    isShared: updated?.isShared ?? false,
  });
}
