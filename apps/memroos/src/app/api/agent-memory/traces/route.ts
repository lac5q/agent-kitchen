import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { recordMemoryTrace, getMemoryTrace, getMemoryTraceTimeline } from "@/lib/memory-trace-observability";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const db = getDb();

    const trace = recordMemoryTrace(db, {
      tenantId: body.tenantId,
      taskId: body.taskId,
      runId: body.runId,
      causalPath: body.causalPath,
      failureClassification: body.failureClassification,
      rootCause: body.rootCause,
      replayHandle: body.replayHandle,
      proposedRepair: body.proposedRepair,
    });

    return NextResponse.json({ status: "ok", trace });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message || "Unknown error" },
      { status: 400 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get("runId");
    const tenantId = searchParams.get("tenantId") || "default-tenant";

    if (!runId) {
      return NextResponse.json(
        { status: "error", message: "runId parameter is required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const trace = getMemoryTrace(db, tenantId, runId);

    if (!trace) {
      return NextResponse.json(
        { status: "not_found", message: `No memory traces found for run ID ${runId}` },
        { status: 404 }
      );
    }

    const timeline = getMemoryTraceTimeline(trace);

    return NextResponse.json({ status: "ok", trace, timeline });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
