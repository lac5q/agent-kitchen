import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { AGENT_CONFIGS_PATH } from "@/lib/constants";
import { authenticateAgentHeaders, recordHeartbeat } from "@/lib/agent/registry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agent");

  // Path traversal guard (T-04-01) — allowlist only safe chars
  if (!agentId || !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
    return NextResponse.json({ content: null }, { status: 400 });
  }

  const filePath = path.join(AGENT_CONFIGS_PATH, agentId, "HEARTBEAT_STATE.md");

  try {
    const text = await readFile(filePath, "utf-8");
    const lines = text.split("\n").filter(l => l.trim()).slice(-20);
    return NextResponse.json({ content: lines.join("\n") });
  } catch {
    // ENOENT or any error — graceful degradation per D-05
    return NextResponse.json({ content: null });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const agentIdHint = typeof body?.agentId === "string" ? body.agentId : undefined;
  const agent = authenticateAgentHeaders(request.headers, agentIdHint);
  if (!agent) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const updated = recordHeartbeat(agent.id, {
    status:
      body?.status === "active" || body?.status === "idle" || body?.status === "dormant" || body?.status === "error"
        ? body.status
        : "active",
    currentTask: typeof body?.currentTask === "string" ? body.currentTask : null,
    latencyMs: typeof body?.latencyMs === "number" ? body.latencyMs : null,
    metadata:
      body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {},
  });

  return NextResponse.json({ ok: true, agent: updated, timestamp: new Date().toISOString() });
}
