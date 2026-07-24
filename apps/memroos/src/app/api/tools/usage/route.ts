// apps/memroos/src/app/api/tools/usage/route.ts
// GET /api/tools/usage — Nango connection-count meter for /settings/tools.
// Phase 179 / v8.23.

import { NextRequest } from "next/server";
import { authenticateUser } from "@/lib/auth/session";
import { getNangoUsage, ToolAuthConfigError, ToolAuthUpstreamError } from "@/lib/tool-auth/nango-client";
import type { GetUsageResponse } from "@/lib/tool-auth/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }

  try {
    const usage = await getNangoUsage();
    const approachingLimit = usage.used / Math.max(usage.limit, 1) >= 0.8;
    const response: GetUsageResponse = { usage, approachingLimit };
    return Response.json(response);
  } catch (err) {
    if (err instanceof ToolAuthConfigError) {
      return Response.json({ error: "nango_not_configured", message: err.message }, { status: 503 });
    }
    if (err instanceof ToolAuthUpstreamError) {
      return Response.json(
        { error: "nango_upstream_error", status: err.status, message: err.message },
        { status: 502 },
      );
    }
    throw err;
  }
}