// GET /api/tools/connections — list the authenticated user's visible
// connections. Ownership and visibility live in tool-connections.ts.

import { NextRequest } from "next/server";

import { authenticateUser } from "@/lib/auth/session";
import {
  listToolConnectionsVisibleTo,
  type ToolConnectionViewer,
} from "@/lib/tool-auth/tool-connections";
import { ToolAuthUpstreamError } from "@/lib/tool-auth/nango-client";
import type { ListConnectionsResponse } from "@/lib/tool-auth/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }

  const viewer: ToolConnectionViewer = {
    userId: session.userId,
    role: session.role,
  };
  try {
    return Response.json({
      connections: await listToolConnectionsVisibleTo(viewer),
    } satisfies ListConnectionsResponse);
  } catch (err) {
    if (err instanceof ToolAuthUpstreamError) {
      // The scoped chokepoint still supplies local vault rows when Nango is
      // unavailable; do not make the failure look like a clean empty list.
      return Response.json({
        connections: await listToolConnectionsVisibleTo(viewer, { skipNango: true }),
        warnings: [{ source: "nango", message: err.message }],
      });
    }
    throw err;
  }
}
