// apps/memroos/src/app/api/tools/connections/route.ts
// GET /api/tools/connections — list every connection for this installation.
// Merges vault-stored API-key records + Nango-managed OAuth connections.
// Phase 179 / v8.23.

import { NextRequest } from "next/server";
import { authenticateUser } from "@/lib/auth/session";
import {
  listVaultConnections,
} from "@/lib/tool-auth/credential-store";
import { listNangoConnections, ToolAuthConfigError, ToolAuthUpstreamError } from "@/lib/tool-auth/nango-client";
import type { ListConnectionsResponse } from "@/lib/tool-auth/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }

  const vault = listVaultConnections();

  // Nango OAuth connections are not yet mirrored into the vault in v8.23 (that
  // lands in Phase 176/178 backfill). Surface them from Nango directly when
  // the integration is configured.
  try {
    const nango = await listNangoConnections();
    return Response.json({ connections: mergeConnections(vault, nango) } satisfies ListConnectionsResponse);
  } catch (err) {
    if (err instanceof ToolAuthConfigError) {
      // Nango not configured — fall back to vault-only. This is the expected
      // state for fresh installations and offline tests.
      return Response.json({ connections: vault } satisfies ListConnectionsResponse);
    }
    if (err instanceof ToolAuthUpstreamError) {
      // Nango is configured but errored — surface vault records with a flag so
      // the UI can show "Connection status unavailable" per Kimi spec §7.
      return Response.json({
        connections: vault,
        warnings: [{ source: "nango", message: err.message }],
      });
    }
    throw err;
  }
}

function mergeConnections(
  vault: ReturnType<typeof listVaultConnections>,
  nango: Awaited<ReturnType<typeof listNangoConnections>>,
) {
  // OAuth connections from Nango override any stale vault row for the same
  // provider key (vault holds only a reference after OAuth completes).
  const byKey = new Map<string, (typeof vault)[number]>();
  for (const c of vault) byKey.set(c.providerKey, c);
  for (const c of nango) byKey.set(c.providerKey, c);
  return Array.from(byKey.values());
}