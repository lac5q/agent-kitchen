import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { rollbackAgentVersion } from "@/lib/agent-cicd-gates";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

export async function POST(req: Request) {
  if (!authorizeRegistryWrite(req)) return registryWriteUnauthorizedResponse();

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { status: "error", message },
      { status: 400 }
    );
  }
}
