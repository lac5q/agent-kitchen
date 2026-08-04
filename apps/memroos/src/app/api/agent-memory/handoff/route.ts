import { buildCodingAgentHandoffPack, type HandoffPackInput } from "@/lib/agent/memory-continuity";
import { getDb } from "@/lib/db";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();

  let body: HandoffPackInput;
  try {
    body = (await request.json()) as HandoffPackInput;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const handoff = buildCodingAgentHandoffPack(getDb(), body);
    return Response.json({ ok: true, handoff }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "handoff failed" },
      { status: 400 }
    );
  }
}
