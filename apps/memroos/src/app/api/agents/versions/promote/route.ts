import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { promoteAgentVersion } from "@/lib/agent-cicd-gates";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tenantId = "default-tenant", agentId, version, profile, operator = "system" } = body;

    if (!agentId || !version || !profile) {
      return NextResponse.json(
        { status: "error", message: "agentId, version, and profile are required fields" },
        { status: 400 }
      );
    }

    const db = getDb();
    const promoted = promoteAgentVersion(db, tenantId, agentId, version, profile, operator);

    return NextResponse.json({ status: "ok", version: promoted });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message || "Unknown error" },
      { status: 400 }
    );
  }
}
