import { NextRequest } from "next/server";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/session";
import {
  canManageToolConnection,
  canViewToolConnection,
  getToolConnectionRecord,
  setToolConnectionShared,
  type ToolConnectionViewer,
} from "@/lib/tool-auth/tool-connections";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  connectionId: z.string().min(1).max(256),
  shared: z.boolean(),
});

export async function POST(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(
        { error: "invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const viewer: ToolConnectionViewer = {
    userId: session.userId,
    role: session.role,
  };
  const row = getToolConnectionRecord(body.connectionId);
  if (!row || !canViewToolConnection(viewer, body.connectionId)) {
    return Response.json({ error: "connection not found" }, { status: 404 });
  }
  if (!canManageToolConnection(viewer, body.connectionId)) {
    return Response.json({ error: "connection management forbidden" }, { status: 403 });
  }

  setToolConnectionShared(body.connectionId, body.shared);
  return Response.json({
    connectionId: row.id,
    shared: body.shared,
  });
}
