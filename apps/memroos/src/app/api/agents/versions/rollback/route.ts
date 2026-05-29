import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { rollbackAgentVersion } from "@/lib/agent-cicd-gates";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tenantId = "default-tenant", agentId, profile, operator = "system" } = body;

    if (!agentId || !profile) {
      return NextResponse.json(
        { status: "error", message: "agentId and profile are required fields" },
        { status: 400 }
      );
    }

    const db = getDb();
    const rolledBack = rollbackAgentVersion(db, tenantId, agentId, profile, operator);

    return NextResponse.json({ status: "ok", version: rolledBack });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message || "Unknown error" },
      { status: 400 }
    );
  }
}
