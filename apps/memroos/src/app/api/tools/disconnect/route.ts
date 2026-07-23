// apps/memroos/src/app/api/tools/disconnect/route.ts
// POST /api/tools/disconnect — revoke a connection (both OAuth + API-key).
// Phase 179 / v8.23.

import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/session";
import {
  getProvider,
} from "@/lib/tool-auth/providers";
import {
  deleteVaultConnection,
  appendActivityEvent,
} from "@/lib/tool-auth/credential-store";
import {
  deleteNangoConnection,
  ToolAuthUpstreamError,
} from "@/lib/tool-auth/nango-client";
import type { RevokeRequest, RevokeResponse } from "@/lib/tool-auth/types";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  providerKey: z.string().min(1).max(64),
  /**
   * Optional Nango connection-id; required only when revoking an OAuth
   * connection that was created via /api/tools/connect/oauth and stored in
   * Nango but not yet mirrored to the vault.
   */
  nangoConnectionId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }

  let body: RevokeRequest & { nangoConnectionId?: string };
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

  const provider = getProvider(body.providerKey);
  if (!provider) {
    return Response.json({ error: "provider not found" }, { status: 404 });
  }

  // Always clear the vault entry first — that holds the secret-bearing
  // record. Nango deletion is best-effort (the 404 case is fine).
  const removed = deleteVaultConnection(provider.key);

  if (body.nangoConnectionId) {
    try {
      await deleteNangoConnection(body.nangoConnectionId);
    } catch (err) {
      if (!(err instanceof ToolAuthUpstreamError) || err.status !== 404) {
        appendActivityEvent({
          providerKey: provider.key,
          type: "token_refresh_failed",
          operatorId: session.userId,
          message: `vault cleared (${removed}) but Nango revocation failed: ${err instanceof Error ? err.message : "unknown"}`,
        });
        return Response.json(
          { error: "nango_revoke_failed", message: err instanceof Error ? err.message : "unknown" },
          { status: 502 },
        );
      }
    }
  }

  appendActivityEvent({
    providerKey: provider.key,
    type: "connection_revoked",
    operatorId: session.userId,
    message: `connection revoked (vault removed ${removed})`,
  });

  const response: RevokeResponse = {
    providerKey: provider.key,
    revoked: true,
  };
  return Response.json(response);
}