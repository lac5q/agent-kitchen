// apps/memroos/src/app/api/tools/connect/oauth/route.ts
// POST /api/tools/connect/oauth — initiate an OAuth connection via Nango.
// Returns the URL the client should open in a popup. The popup completes the
// consent flow and posts back to the opener; the client then calls
// /api/tools/connect/oauth/callback to materialize the vault record.
// Phase 179 / v8.23.

import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/session";
import {
  getProvider,
  isOAuthProvider,
} from "@/lib/tool-auth/providers";
import {
  createNangoConnectSession,
  ToolAuthConfigError,
  ToolAuthUpstreamError,
} from "@/lib/tool-auth/nango-client";
import { appendActivityEvent } from "@/lib/tool-auth/credential-store";
import type { ConnectOAuthRequest, ConnectOAuthResponse } from "@/lib/tool-auth/types";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  providerKey: z.string().min(1).max(64),
  returnOrigin: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }

  let body: ConnectOAuthRequest;
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json(
        { error: "invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    body = parsed.data as ConnectOAuthRequest;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const provider = getProvider(body.providerKey);
  if (!provider || !isOAuthProvider(provider)) {
    return Response.json(
      { error: "provider not found or not an OAuth provider" },
      { status: 404 },
    );
  }

  try {
    const nangoSession = await createNangoConnectSession({
      endUserEmail: session.email ?? null,
      allowedIntegrationIds: [provider.providerConfigKey],
    });
    appendActivityEvent({
      providerKey: provider.key,
      type: "connection_established",
      operatorId: session.userId,
      message: "OAuth flow initiated",
    });
    const response: ConnectOAuthResponse = {
      // Prefer Nango's own connect_link. Hand-assembling the URL is what let a
      // renamed response field (session_token -> token) reach the browser as
      // `?session_token=undefined`, which Nango reports as an expired session.
      authorizeUrl:
        nangoSession.connectLink ??
        buildAuthorizeUrl(nangoSession.sessionToken, provider.providerConfigKey),
      providerKey: provider.key,
      popupWidth: 600,
      popupHeight: 700,
    };
    return Response.json(response);
  } catch (err) {
    if (err instanceof ToolAuthConfigError) {
      return Response.json(
        { error: "nango_not_configured", message: err.message },
        { status: 503 },
      );
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

function buildAuthorizeUrl(sessionToken: string, integrationId: string): string {
  if (!sessionToken) {
    // Fail loudly here rather than opening a popup at
    // `?session_token=undefined`, where the only symptom is Nango's
    // misleading "Your session has expired" message.
    throw new Error(
      "Nango returned no session token; refusing to open the connect popup.",
    );
  }
  // Nango's hosted connect UI takes a session token and opens a flow scoped
  // to the allowed integrations. The exact URL pattern is stable as of
  // 2026-07-23.
  const u = new URL("https://connect.nango.dev");
  u.searchParams.set("session_token", sessionToken);
  u.searchParams.set("integration_id", integrationId);
  return u.toString();
}