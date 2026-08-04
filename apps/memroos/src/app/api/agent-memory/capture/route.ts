import { captureCodingAgentSession, type CodingAgentCaptureInput } from "@/lib/agent/memory-continuity";
import { getDb } from "@/lib/db";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();

  let body: CodingAgentCaptureInput;
  try {
    body = (await request.json()) as CodingAgentCaptureInput;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const capture = captureCodingAgentSession(getDb(), body);
    return Response.json({ ok: true, capture }, { status: capture.duplicate ? 200 : 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "capture failed" },
      { status: 400 }
    );
  }
}
