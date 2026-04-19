import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { scanContent } from "@/lib/content-scanner";
import { writeAuditLog } from "@/lib/audit";
import { getRemoteAgents } from "@/lib/agent-registry";
import { selectAdapter } from "@/lib/dispatch/adapter-factory";
import type { DispatchTask } from "@/lib/dispatch/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest | Request) {
  const body = await req.json();

  if (!body.task_summary || typeof body.task_summary !== "string") {
    return Response.json(
      { ok: false, error: "task_summary is required", code: "INVALID_BODY" },
      { status: 400 }
    );
  }
  if (!body.to_agent || typeof body.to_agent !== "string") {
    return Response.json(
      { ok: false, error: "to_agent is required", code: "INVALID_BODY" },
      { status: 400 }
    );
  }
  const priority = body.priority != null ? Number(body.priority) : 5;
  if (priority < 1 || priority > 9) {
    return Response.json(
      { ok: false, error: "priority must be 1-9", code: "INVALID_BODY" },
      { status: 400 }
    );
  }

  const agents = getRemoteAgents();
  const agent = agents.find((a) => a.id === body.to_agent);
  if (!agent) {
    return Response.json(
      { ok: false, error: `Unknown agent: ${body.to_agent}`, code: "UNKNOWN_AGENT" },
      { status: 404 }
    );
  }

  const db = getDb();
  const scan = scanContent(body.task_summary);
  const from_agent: string = body.from_agent ?? "kitchen";

  if (scan.blocked) {
    writeAuditLog(db, {
      actor: from_agent,
      action: "content_blocked",
      target: "dispatch",
      detail: JSON.stringify(scan.matches.map((m: { patternName: string }) => m.patternName)),
      severity: "high",
    });
    return Response.json(
      { ok: false, error: "Content blocked by security scanner", code: "CONTENT_BLOCKED" },
      { status: 403 }
    );
  }
  if (scan.matches.length > 0) {
    writeAuditLog(db, {
      actor: from_agent,
      action: "content_flagged",
      target: "dispatch",
      detail: JSON.stringify(scan.matches.map((m: { patternName: string }) => m.patternName)),
      severity: "medium",
    });
  }

  const task_id: string = body.task_id ?? crypto.randomUUID();
  const context_id: string = body.context_id ?? crypto.randomUUID();
  const dispatched_at = new Date().toISOString();

  db.prepare(
    `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, checkpoint, context_id, result)
     VALUES (@task_id, @from_agent, @to_agent, @task_summary, @priority, 'pending', NULL, @context_id, NULL)
     ON CONFLICT(task_id) DO NOTHING`
  ).run({ task_id, from_agent, to_agent: body.to_agent, task_summary: scan.cleanContent, priority, context_id });

  const adapter = selectAdapter(agent);

  db.prepare(
    `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
     VALUES (@agent_id, 'trigger', @summary, @artifacts)`
  ).run({
    agent_id: from_agent,
    summary: `Dispatch: ${scan.cleanContent.slice(0, 120)}`,
    artifacts: JSON.stringify({ task_id, context_id, to_agent: body.to_agent, adapter: adapter.name, direction: "outbound" }),
  });

  const task: DispatchTask = {
    task_id,
    context_id,
    from_agent,
    to_agent: body.to_agent,
    task_summary: scan.cleanContent,
    input: body.input,
    priority,
    dispatched_at,
  };
  const result = await adapter.dispatch(task);

  if (!result.accepted) {
    db.prepare(
      `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
       VALUES (@agent_id, 'error', @summary, @artifacts)`
    ).run({
      agent_id: from_agent,
      summary: result.detail,
      artifacts: JSON.stringify({ task_id, adapter: adapter.name }),
    });
    db.prepare(
      `UPDATE hive_delegations SET status='failed', result=@result, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE task_id=@task_id`
    ).run({ result: result.detail, task_id });
    return Response.json(
      { ok: false, error: result.detail, code: "ADAPTER_REJECTED", detail: result.evidence ?? {} },
      { status: 502 }
    );
  }

  return Response.json({ ok: true, task_id, context_id, to_agent: body.to_agent, adapter: adapter.name, mode: result.mode, dispatched_at });
}
