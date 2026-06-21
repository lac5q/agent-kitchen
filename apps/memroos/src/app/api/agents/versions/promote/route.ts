import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { promoteAgentVersion } from "@/lib/agent-cicd-gates";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

export async function POST(req: Request) {
  if (!authorizeRegistryWrite(req)) return registryWriteUnauthorizedResponse();

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { status: "error", message },
      { status: 400 }
    );
  }
}
