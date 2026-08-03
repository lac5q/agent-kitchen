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
  listNangoConnections,
  ToolAuthConfigError,
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

  // Always clear the vault entry first — that holds the secret-bearing record.
  const removed = deleteVaultConnection(provider.key);

  /**
   * Then delete the Nango connection, resolving it here rather than trusting
   * the caller to supply an id.
   *
   * This previously ran only `if (body.nangoConnectionId)`, and the settings UI
   * posts just `{ providerKey }` — so for every OAuth provider the branch was
   * skipped, the vault row was cleared, and the response still said
   * `revoked: true`. Because /api/tools/connections lets Nango override the
   * vault when merging, the card reappeared as connected on the next refetch.
   * With the UI's optimistic removal in front of it, revoke looked like it
   * worked and then silently undid itself.
   *
   * An explicit id is still honoured, for a connection created by
   * /api/tools/connect/oauth that has not been mirrored to the vault yet.
   */
  const targets = new Map<string, string>(); // connectionId -> providerConfigKey
  try {
    for (const c of await listNangoConnections()) {
      // Only OAuth rows carry a Nango config key; vault-only rows have none and
      // are already handled by deleteVaultConnection above.
      if (c.providerKey === provider.key && c.providerConfigKey) {
        targets.set(c.connectionId, c.providerConfigKey);
      }
    }
    // An id supplied by the caller is only actionable if we can name its config
    // key, which Nango requires on delete.
    if (body.nangoConnectionId && !targets.has(body.nangoConnectionId)) {
      const known = [...targets.values()][0];
      if (known) targets.set(body.nangoConnectionId, known);
    }
  } catch (err) {
    // Nango being unreachable must not report success: the connection would
    // still be live and the operator would believe it was gone.
    if (!(err instanceof ToolAuthConfigError)) {
      appendActivityEvent({
        providerKey: provider.key,
        type: "token_refresh_failed",
        operatorId: session.userId,
        message: `vault cleared (${removed}) but could not list Nango connections: ${err instanceof Error ? err.message : "unknown"}`,
      });
      return Response.json(
        { error: "nango_revoke_failed", message: "could not reach Nango to revoke the connection" },
        { status: 502 },
      );
    }
  }

  for (const [connectionId, providerConfigKey] of targets) {
    try {
      await deleteNangoConnection(connectionId, providerConfigKey);
    } catch (err) {
      // A 404 means it is already gone, which is the desired end state.
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