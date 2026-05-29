import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createAgentCheckpoint, resumeFromCheckpoint } from "@/lib/agent-checkpoints";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const db = getDb();
    
    const checkpoint = createAgentCheckpoint(db, {
      tenantId: body.tenantId,
      runId: body.runId,
      ownerAgentId: body.ownerAgentId,
      objective: body.objective,
      completedSteps: body.completedSteps,
      remainingSteps: body.remainingSteps,
      decisions: body.decisions,
      artifactRefs: body.artifactRefs,
      verificationState: body.verificationState,
      nextSafeAction: body.nextSafeAction,
      rollbackNotes: body.rollbackNotes,
      provenancePointers: body.provenancePointers,
    });

    return NextResponse.json({ status: "ok", checkpoint });
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
    const checkpoint = resumeFromCheckpoint(db, tenantId, runId);

    if (!checkpoint) {
      return NextResponse.json(
        { status: "not_found", message: `No checkpoints found for run ID ${runId}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ status: "ok", checkpoint });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
