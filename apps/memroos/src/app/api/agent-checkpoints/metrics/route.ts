import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCheckpointMetrics } from "@/lib/agent-checkpoints";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || "default-tenant";

    const db = getDb();
    const metrics = getCheckpointMetrics(db, tenantId);

    return NextResponse.json({ status: "ok", metrics });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
