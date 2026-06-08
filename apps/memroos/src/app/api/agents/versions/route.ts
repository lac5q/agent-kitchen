import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createAgentVersion, listAgentVersions } from "@/lib/agent-cicd-gates";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const db = getDb();

    const version = createAgentVersion(db, {
      tenantId: body.tenantId,
      agentId: body.agentId,
      version: body.version,
      profile: body.profile,
      modelRoute: body.modelRoute,
      systemInstructions: body.systemInstructions,
      skillsContracts: body.skillsContracts,
      runtimeConfig: body.runtimeConfig,
      evalDatasetVersions: body.evalDatasetVersions,
      policyMetadata: body.policyMetadata,
    });

    return NextResponse.json({ status: "ok", version });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { status: "error", message },
      { status: 400 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    const tenantId = searchParams.get("tenantId") || "default-tenant";

    if (!agentId) {
      return NextResponse.json(
        { status: "error", message: "agentId parameter is required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const versions = listAgentVersions(db, tenantId, agentId);

    return NextResponse.json({ status: "ok", versions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { status: "error", message },
      { status: 500 }
    );
  }
}
