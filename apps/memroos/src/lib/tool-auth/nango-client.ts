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
import { providerKeyFromConfigKey } from "./providers";

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
    // Nango returns `token`, not `session_token` (verified against the live
    // API 2026-07-26). Reading the wrong field yielded
    // `?session_token=undefined` in the popup URL and Nango answered
    // "Your session has expired, please refresh the modal".
    token: string;
    // Nango also hands back a ready-made connect URL. Prefer it over
    // hand-assembling one, so a future change to their URL shape does not
    // silently break the flow again.
    connect_link?: string;
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
    "/connection",
  );
  const list = res.connections ?? [];
  return list.map((c) => ({
    // Nango speaks provider_config_key ("circleback-mcp"); the UI keys cards
    // by the memroos provider key ("circleback"). Translate or the card never
    // matches its own connection.
    providerKey: providerKeyFromConfigKey(c.provider_config_key),
    providerConfigKey: c.provider_config_key,
    // Nango's `id` is an internal numeric row id; every Nango API path that
    // takes a connection (notably GET /connection/:id for credentials) expects
    // the `connection_id` UUID. Sending `id` 404s, which fetchNangoCredentials
    // maps to null — surfacing as "no access token; skipping" and silently
    // disabling Linear/Notion/Circleback sync despite live OAuth connections.
    connectionId: c.connection_id,
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
/**
 * Nango rejects both empty strings and malformed emails. Session objects can
 * carry `email: ''` (JWT path), so collapse blank/whitespace values to
 * undefined and drop anything that is not a plausible address.
 */
function normalizeEndUser(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.includes("@") ? trimmed : undefined;
}

export async function createNangoConnectSession(opts: {
  endUserEmail: string | null;
  allowedIntegrationIds: string[];
}): Promise<{ sessionToken: string; connectLink?: string; expiresAt: string }> {
  const res = await nangoFetch<NangoConnectSessionResponse>(
    "/connect/sessions",
    {
      method: "POST",
      body: JSON.stringify({
        // Nango requires a non-empty end_user.id and, if email is present, a
        // valid address (verified against the live API 2026-07-26):
        //   missing id     -> 400 "expected string, received undefined"
        //   empty-string id-> 400 "expected string to have >=1 characters"
        //                     plus "Invalid email address" for email: ""
        //
        // JWT sessions resolve email to '' rather than null, so `?? fallback`
        // is not enough — an empty string is falsy-but-present and slips
        // through. Normalize empties to undefined before deciding.
        end_user: {
          id: normalizeEndUser(opts.endUserEmail) ?? "memroos-operator",
          email: normalizeEndUser(opts.endUserEmail),
        },
        allowed_integrations: opts.allowedIntegrationIds,
      }),
    },
  );
  return {
    sessionToken: res.data.token,
    connectLink: res.data.connect_link,
    expiresAt: res.data.expires_at,
  };
}

/**
 * Deletes a Nango connection. Idempotent — Nango returns 404 if the id is
 * unknown, which we treat as success.
 */
/**
 * Delete a Nango connection.
 *
 * `provider_config_key` is REQUIRED by Nango on this endpoint. Omitting it does
 * not 404 — it returns 400 `unknown_connection`, which reads like "that id does
 * not exist" rather than "you forgot a parameter". Because only 404 was treated
 * as already-gone, every revoke threw, the caller turned it into a 502, and the
 * settings UI discarded that silently: the connection looked revoked, then came
 * back on the next refetch.
 */
export async function deleteNangoConnection(
  connectionId: string,
  providerConfigKey: string,
): Promise<void> {
  const query = `?provider_config_key=${encodeURIComponent(providerConfigKey)}`;
  try {
    await nangoFetch<void>(
      `/connection/${encodeURIComponent(connectionId)}${query}`,
      { method: "DELETE" },
    );
  } catch (err) {
    if (!(err instanceof ToolAuthUpstreamError)) throw err;
    // 404, or Nango's 400 `unknown_connection`: either way it is not there, and
    // absence is the outcome we wanted.
    if (err.status === 404) return;
    if (err.status === 400 && /unknown_connection/.test(String(err.message) + JSON.stringify(err))) return;
    throw err;
  }
}

/**
 * Fetches the live provider credential Nango holds for a connection.
 *
 * Nango owns the refresh cycle, so this returns a currently-valid token
 * rather than whatever was minted at connect time. The token is provider-
 * scoped: for an MCP integration it authenticates against that provider's MCP
 * endpoint, NOT its REST/GraphQL API (a Linear `linear-mcp` token returns 401
 * from api.linear.app and handshakes cleanly with mcp.linear.app).
 *
 * Returns null when the connection is unknown, so callers can skip rather
 * than fail the whole cycle.
 */
export async function fetchNangoCredentials(
  connectionId: string,
  providerConfigKey: string,
): Promise<{ accessToken: string; expiresAt: string | null } | null> {
  try {
    const res = await nangoFetch<{
      credentials?: { access_token?: string; expires_at?: string };
    }>(
      `/connection/${encodeURIComponent(connectionId)}` +
        `?provider_config_key=${encodeURIComponent(providerConfigKey)}`,
    );
    const token = res.credentials?.access_token;
    if (!token) return null;
    return { accessToken: token, expiresAt: res.credentials?.expires_at ?? null };
  } catch (err) {
    if (err instanceof ToolAuthUpstreamError && err.status === 404) return null;
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
/**
 * The set of integration keys that actually exist in this Nango workspace.
 *
 * The provider catalog is static, but whether a card can connect is a live
 * fact about Nango. Hardcoding availability let the two drift: Gmail was
 * configured in Nango for weeks with no card in the UI, while Google Calendar
 * kept offering a Connect button after its integration stopped working.
 *
 * `null` means "could not determine" (Nango unset or unreachable) and callers
 * MUST fail open — marking every provider unavailable because Nango had a bad
 * minute is worse than showing a button that might error.
 */
export async function listNangoIntegrationKeys(): Promise<Set<string> | null> {
  try {
    const res = await nangoFetch<{
      data?: Array<{ unique_key?: string; uniqueKey?: string }>;
      configs?: Array<{ unique_key?: string; uniqueKey?: string }>;
    }>("/integrations");
    const rows = res.data ?? res.configs ?? [];
    const keys = rows
      .map((r) => r.unique_key ?? r.uniqueKey)
      .filter((k): k is string => typeof k === "string" && k.length > 0);
    // An empty list is far more likely to be a shape change than a workspace
    // with zero integrations; treat it as unknown rather than blanking the UI.
    return keys.length > 0 ? new Set(keys) : null;
  } catch {
    return null;
  }
}
