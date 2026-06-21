import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCheckpointMetrics } from "@/lib/agent-checkpoints";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

export async function GET(req: Request) {
  if (!authorizeRegistryWrite(req)) return registryWriteUnauthorizedResponse();

  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || "default-tenant";

    const db = getDb();
    const metrics = getCheckpointMetrics(db, tenantId);

    return NextResponse.json({ status: "ok", metrics });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { status: "error", message },
      { status: 500 }
    );
  }
}
