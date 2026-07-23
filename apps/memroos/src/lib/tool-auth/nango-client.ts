// apps/memroos/src/lib/tool-auth/nango-client.ts
// Server-side Nango client wrapper for the tool-auth plane (Phase 179 / v8.23).
//
// All HTTP calls go to https://api.nango.dev. The secret key is read once at
// module init from NANGO_SECRET_KEY. If the key is missing, every method throws
// a ToolAuthConfigError so the API routes can surface a clear "Nango integration
// key not configured" message instead of failing silently.
//
// Why no SDK: pulling in @nangohq/node adds a dependency surface we don't need.
// The Nango REST API is small and stable; the wrapper below covers exactly the
// four operations the tool-auth plane uses.

import type { ConnectionUsage, ToolConnection } from "./types";

const NANGO_API_BASE = "https://api.nango.dev";

export class ToolAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolAuthConfigError";
  }
}

export class ToolAuthUpstreamError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ToolAuthUpstreamError";
  }
}

function getSecretKey(): string {
  const key = process.env.NANGO_SECRET_KEY;
  if (!key) {
    throw new ToolAuthConfigError(
      "NANGO_SECRET_KEY is not configured. Add it to .env.local and restart the server.",
    );
  }
  return key;
}

async function nangoFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const key = getSecretKey();
  const res = await fetch(`${NANGO_API_BASE}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep raw text
    }
    throw new ToolAuthUpstreamError(res.status, `Nango ${res.status} on ${path}`, body);
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

interface NangoConnection {
  id: string | number;
  provider_config_key: string;
  connection_id: string;
  created_at: string;
  updated_at: string;
  end_user?: { email?: string; display_name?: string } | null;
  metadata?: Record<string, unknown> | null;
}

interface NangoConnectSessionResponse {
  data: {
    session_token: string;
    expires_at: string;
  };
}

interface NangoUsageResponse {
  data: {
    connections: { current: number; limit: number };
  };
}

/**
 * Returns every Nango connection this memroos installation has established.
 * Maps the Nango shape into memroos's ToolConnection type.
 */
export async function listNangoConnections(): Promise<ToolConnection[]> {
  const res = await nangoFetch<{ connections: NangoConnection[] }>(
    "/connections",
  );
  const list = res.connections ?? [];
  return list.map((c) => ({
    providerKey: c.provider_config_key,
    connectionId: String(c.id),
    status: "connected",
    accountEmail: c.end_user?.email ?? null,
    scopes: null,
    lastUsedAt: null,
    createdAt: c.created_at,
    expiresAt: null,
    errorMessage: null,
    authMode: "oauth" as const,
  }));
}

/**
 * Creates a Nango connect session token. The client uses the returned token
 * to render the Nango Connect UI in a popup; on completion the popup posts
 * back to the opener with the connection-id.
 *
 * See https://docs.nango.dev/reference/api/connect-session
 */
export async function createNangoConnectSession(opts: {
  endUserEmail: string | null;
  allowedIntegrationIds: string[];
}): Promise<{ sessionToken: string; expiresAt: string }> {
  const res = await nangoFetch<NangoConnectSessionResponse>(
    "/connect/sessions",
    {
      method: "POST",
      body: JSON.stringify({
        end_user: { email: opts.endUserEmail ?? undefined },
        allowed_integrations: opts.allowedIntegrationIds,
      }),
    },
  );
  return {
    sessionToken: res.data.session_token,
    expiresAt: res.data.expires_at,
  };
}

/**
 * Deletes a Nango connection. Idempotent — Nango returns 404 if the id is
 * unknown, which we treat as success.
 */
export async function deleteNangoConnection(connectionId: string): Promise<void> {
  try {
    await nangoFetch<void>(`/connections/${encodeURIComponent(connectionId)}`, {
      method: "DELETE",
    });
  } catch (err) {
    if (err instanceof ToolAuthUpstreamError && err.status === 404) return;
    throw err;
  }
}

/**
 * Reports current Nango connection usage for this secret key. Used by the
 * "8 of 10 connections used" meter on the settings page.
 */
export async function getNangoUsage(): Promise<ConnectionUsage> {
  // Re-throw config errors so the route handler can surface "nango_not_configured"
  // to the UI. Swallow upstream errors with a permissive sentinel — the UI
  // shouldn't show a misleading "at limit" banner just because Nango is having
  // a bad day.
  let res: NangoUsageResponse;
  try {
    res = await nangoFetch<NangoUsageResponse>("/connect/sessions/usage");
  } catch (err) {
    if (err instanceof ToolAuthConfigError) throw err;
    return { used: 0, limit: Number.MAX_SAFE_INTEGER, plan: "enterprise" };
  }
  const { current, limit } = res.data.connections;
  // Nango doesn't expose plan tier via the usage endpoint; assume the free
  // tier up to 10 connections, then starter, etc. This matches Nango's
  // published pricing as of 2026-07-23.
  const plan: ConnectionUsage["plan"] =
    limit <= 10 ? "free" : limit <= 100 ? "starter" : limit <= 1000 ? "growth" : "enterprise";
  return { used: current, limit, plan };
}