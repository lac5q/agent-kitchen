// apps/memroos/src/app/api/tools/activity/route.ts
// GET /api/tools/activity — recent connection / revocation events.
// Phase 179 / v8.23.

import { NextRequest } from "next/server";
import { authenticateUser } from "@/lib/auth/session";
import { listActivityEvents } from "@/lib/tool-auth/credential-store";
import type { ListActivityResponse } from "@/lib/tool-auth/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.min(50, Math.max(1, Number(limitRaw))) : 5;

  const events = listActivityEvents(limit);
  const response: ListActivityResponse = { events };
  return Response.json(response);
}