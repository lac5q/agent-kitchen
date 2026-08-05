import type { NextRequest } from "next/server";

import { authenticateUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/middleware-roles";
import { getDb } from "@/lib/db";
import {
  AgentIssueTransitionError,
  transitionAgentIssueReport,
} from "@/lib/store/agent-issues";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticateUser(request);
  if (!session) return Response.json({ ok: false, error: "authentication required" }, { status: 401 });
  const roleError = requireRole(session.role, "operator");
  if (roleError) return roleError;

  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const action = (body as Record<string, unknown>).action;
  if (action !== "ack" && action !== "resolve") {
    return Response.json({ ok: false, error: "action must be ack or resolve" }, { status: 400 });
  }
  const rawNote = (body as Record<string, unknown>).note;
  const note = rawNote === undefined || rawNote === null ? null : typeof rawNote === "string" ? rawNote.trim() : null;
  if (rawNote !== undefined && rawNote !== null && note === null) {
    return Response.json({ ok: false, error: "note must be a string" }, { status: 400 });
  }
  if (note && note.length > 8000) {
    return Response.json({ ok: false, error: "note is too long" }, { status: 400 });
  }

  const { id } = await params;
  try {
    const report = transitionAgentIssueReport(
      getDb(),
      id,
      action,
      { id: session.userId, role: session.role === "admin" ? "admin" : "operator" },
      note,
      {
        actor: session.userId,
        action: `agent_issue_reports.${action}`,
        asset: `agent_issue_reports/${id}`,
        purpose: `${action} an agent-reported MemroOS issue`,
        label: { visibility: "private", domain: "agent-issue-report", sensitivity: "high", policy: "operator-review" },
        decision: "allow",
      },
    );
    return Response.json({ ok: true, report });
  } catch (error) {
    if (error instanceof AgentIssueTransitionError) {
      return Response.json({ ok: false, error: error.message }, { status: error.message.includes("not found") ? 404 : 409 });
    }
    return Response.json({ ok: false, error: "failed to update agent issue report" }, { status: 500 });
  }
}
