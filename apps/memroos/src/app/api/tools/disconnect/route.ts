// POST /api/tools/disconnect — revoke exactly one authenticated connection.

import { NextRequest } from "next/server";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/session";
import { getProvider } from "@/lib/tool-auth/providers";
import {
  appendActivityEvent,
  deleteVaultConnectionById,
} from "@/lib/tool-auth/credential-store";
import {
  canManageToolConnection,
  canViewToolConnection,
  deleteToolConnectionRecord,
  getToolConnectionRecord,
  resolveToolConnectionForLegacyRevoke,
  type ToolConnectionViewer,
} from "@/lib/tool-auth/tool-connections";
import {
  deleteNangoConnection,
  ToolAuthConfigError,
  ToolAuthUpstreamError,
} from "@/lib/tool-auth/nango-client";
import type { RevokeRequest, RevokeResponse } from "@/lib/tool-auth/types";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    connectionId: z.string().min(1).max(256).optional(),
    providerKey: z.string().min(1).max(64).optional(),
    nangoConnectionId: z.string().min(1).max(256).optional(),
  })
  .refine((body) => Boolean(body.connectionId ?? body.providerKey), {
    message: "connectionId or providerKey is required",
    path: ["connectionId"],
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

  let target = body.connectionId ? getToolConnectionRecord(body.connectionId) : null;
  if (body.connectionId) {
    // Do not confirm a private connection's existence to an out-of-scope user.
    if (!target || !canViewToolConnection(viewer, body.connectionId)) {
      return Response.json({ error: "connection not found" }, { status: 404 });
    }
    if (!canManageToolConnection(viewer, body.connectionId)) {
      return Response.json({ error: "connection management forbidden" }, { status: 403 });
    }
  } else {
    try {
      const resolution = await resolveToolConnectionForLegacyRevoke(viewer, {
        providerKey: body.providerKey!,
        nangoConnectionId: body.nangoConnectionId,
      });
      if (resolution.status === "ok") {
        target = resolution.connection;
      } else if (resolution.status === "forbidden") {
        return Response.json({ error: "connection management forbidden" }, { status: 403 });
      } else {
        return Response.json({ error: "connection not found" }, { status: 404 });
      }
    } catch (err) {
      // A provider-key-only legacy revoke must not claim success while Nango
      // is unreachable; the exact connection id path below can avoid listing.
      if (err instanceof ToolAuthConfigError || err instanceof ToolAuthUpstreamError) {
        return Response.json(
          { error: "nango_revoke_failed", message: "could not reach Nango to resolve the connection" },
          { status: 502 },
        );
      }
      throw err;
    }
  }

  if (!target) {
    return Response.json({ error: "connection not found" }, { status: 404 });
  }
  const provider = getProvider(target.providerKey);
  if (!provider) {
    return Response.json({ error: "provider not found" }, { status: 404 });
  }

  if (target.nangoConnectionId) {
    if (!("providerConfigKey" in provider)) {
      return Response.json({ error: "provider is not configured for OAuth" }, { status: 500 });
    }
    try {
      await deleteNangoConnection(target.nangoConnectionId, provider.providerConfigKey);
    } catch (err) {
      appendActivityEvent({
        providerKey: target.providerKey,
        type: "token_refresh_failed",
        operatorId: session.userId,
        connectionId: target.id,
        message: `Nango revocation failed: ${err instanceof Error ? err.message : "unknown"}`,
      });
      return Response.json(
        {
          error: "nango_revoke_failed",
          message: err instanceof Error ? err.message : "could not reach Nango to revoke the connection",
        },
        { status: 502 },
      );
    }
  }

  const removed = target.vaultArtifactId
    ? deleteVaultConnectionById(target.vaultArtifactId)
    : 0;
  deleteToolConnectionRecord(target.id);
  appendActivityEvent({
    providerKey: target.providerKey,
    type: "connection_revoked",
    operatorId: session.userId,
    connectionId: target.id,
    message: `connection revoked (vault removed ${removed})`,
  });

  const response: RevokeResponse & RevokeRequest = {
    providerKey: target.providerKey,
    connectionId: target.id,
    revoked: true,
  };
  return Response.json(response);
}
