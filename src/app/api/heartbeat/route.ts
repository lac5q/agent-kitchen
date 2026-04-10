import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { AGENT_CONFIGS_PATH } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agent");

  // Path traversal guard (T-04-01)
  if (!agentId || agentId.includes("..") || agentId.includes("/") || agentId.includes("\\")) {
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
