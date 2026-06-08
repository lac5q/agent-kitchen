import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api-error";
import { responseCache } from "@/lib/response-cache";

export const dynamic = "force-dynamic";

async function buildCachePurgeResponse(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { tag?: unknown } | null;
  const tag = typeof body?.tag === "string" && body.tag.trim() ? body.tag.trim() : null;
  const purged = tag ? responseCache.invalidateTag(tag) : responseCache.purge();
  return Response.json({ ok: true, purged, tag, timestamp: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  try {
    return await buildCachePurgeResponse(req);
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
