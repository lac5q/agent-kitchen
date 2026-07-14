import { getDb } from "@/lib/db";
import { verifyMemoryAuditChain } from "@/lib/audit/memory-chain";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

export async function GET(request: Request): Promise<Response> {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  try {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId") ?? "default-tenant";
    const verification = verifyMemoryAuditChain(getDb(), tenantId);
    return Response.json({ ok: verification.valid, verification });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
