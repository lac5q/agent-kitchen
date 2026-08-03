import { createHash, randomBytes } from "crypto";

import { getDb } from "@/lib/db";

/**
 * Storage for the MCP authorization server.
 *
 * Codes and tokens are stored as SHA-256 hashes. The raw value is returned to
 * the caller exactly once, at creation; a later database read yields nothing
 * usable. Lookups therefore hash the presented value and match on that.
 */

const CODE_TTL_SECONDS = 60; // short: it is redeemed immediately by the client
const ACCESS_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface McpOauthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  hasSecret: boolean;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

function isoIn(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isExpired(iso: string): boolean {
  return Date.parse(iso) <= Date.now();
}

/** RFC 7591 registration. Public clients (PKCE, no secret) are the norm here. */
export function registerClient(input: {
  clientName: string;
  redirectUris: string[];
  issueSecret?: boolean;
}): { clientId: string; clientSecret?: string } {
  const clientId = `mcp_${randomBytes(16).toString("hex")}`;
  const clientSecret = input.issueSecret ? `mcs_${randomBytes(32).toString("base64url")}` : undefined;

  getDb()
    .prepare(
      `INSERT INTO mcp_oauth_clients (client_id, client_secret_hash, client_name, redirect_uris)
       VALUES (?, ?, ?, ?)`
    )
    .run(
      clientId,
      clientSecret ? hash(clientSecret) : null,
      input.clientName.slice(0, 200),
      JSON.stringify(input.redirectUris)
    );

  return clientSecret ? { clientId, clientSecret } : { clientId };
}

export function getClient(clientId: string): McpOauthClient | null {
  const row = getDb()
    .prepare("SELECT client_id, client_secret_hash, client_name, redirect_uris FROM mcp_oauth_clients WHERE client_id = ?")
    .get(clientId) as
    | { client_id: string; client_secret_hash: string | null; client_name: string; redirect_uris: string }
    | undefined;
  if (!row) return null;

  let uris: string[] = [];
  try {
    const parsed = JSON.parse(row.redirect_uris);
    if (Array.isArray(parsed)) uris = parsed.filter((u) => typeof u === "string");
  } catch {
    uris = [];
  }

  return {
    clientId: row.client_id,
    clientName: row.client_name,
    redirectUris: uris,
    hasSecret: row.client_secret_hash !== null,
  };
}

export function verifyClientSecret(clientId: string, secret: string): boolean {
  const row = getDb()
    .prepare("SELECT client_secret_hash FROM mcp_oauth_clients WHERE client_id = ?")
    .get(clientId) as { client_secret_hash: string | null } | undefined;
  if (!row || !row.client_secret_hash) return false;
  return row.client_secret_hash === hash(secret);
}

/** Exact-match only — prefix matching on redirect URIs is an open-redirect. */
export function isRegisteredRedirectUri(client: McpOauthClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri);
}

export function createAuthorizationCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
}): string {
  const code = randomBytes(32).toString("base64url");
  getDb()
    .prepare(
      `INSERT INTO mcp_oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(hash(code), input.clientId, input.userId, input.redirectUri, input.codeChallenge, input.scope, isoIn(CODE_TTL_SECONDS));
  return code;
}

export interface ConsumedCode {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
}

/**
 * Redeem a code exactly once.
 *
 * The consumed stamp is written in the same statement that matches an unconsumed
 * row, so two concurrent redemptions cannot both succeed.
 */
export function consumeAuthorizationCode(code: string): ConsumedCode | null {
  const db = getDb();
  const h = hash(code);

  const row = db
    .prepare(
      `SELECT client_id, user_id, redirect_uri, code_challenge, scope, expires_at, consumed_at
       FROM mcp_oauth_codes WHERE code_hash = ?`
    )
    .get(h) as
    | {
        client_id: string;
        user_id: string;
        redirect_uri: string;
        code_challenge: string;
        scope: string;
        expires_at: string;
        consumed_at: string | null;
      }
    | undefined;

  if (!row || row.consumed_at || isExpired(row.expires_at)) return null;

  const claimed = db
    .prepare("UPDATE mcp_oauth_codes SET consumed_at = ? WHERE code_hash = ? AND consumed_at IS NULL")
    .run(nowIso(), h);
  if (claimed.changes !== 1) return null; // lost the race

  return {
    clientId: row.client_id,
    userId: row.user_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    scope: row.scope,
  };
}

export function issueTokens(input: { clientId: string; userId: string; scope: string }): {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} {
  const accessToken = `mat_${randomBytes(32).toString("base64url")}`;
  const refreshToken = `mrt_${randomBytes(32).toString("base64url")}`;
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO mcp_oauth_tokens (token_hash, client_id, user_id, kind, scope, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  insert.run(hash(accessToken), input.clientId, input.userId, "access", input.scope, isoIn(ACCESS_TTL_SECONDS));
  insert.run(hash(refreshToken), input.clientId, input.userId, "refresh", input.scope, isoIn(REFRESH_TTL_SECONDS));
  // Register the agent at issuance so it appears on /agents as soon as the
  // person connects, rather than only after their first tool call.
  ensureMcpAgent(input.userId, input.clientId);
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS };
}

/**
 * The agent a connected MCP client acts as.
 *
 * An OAuth token names a *human*, but MemroOS records memory as an *agent* —
 * so a connector that only ever resolved to a user had no identity to write
 * with. That is why Claude Cowork could read everything and write nothing, and
 * why a connected client never appeared on /agents: nothing had registered it.
 *
 * One agent per (user, client), derived deterministically so reconnecting
 * reuses the same row instead of littering the registry with a new agent per
 * OAuth round-trip. Owned by the human who authorised it, which is what makes
 * it visible to them under scoped visibility and accountable to them in audit.
 */
export function ensureMcpAgent(userId: string, clientId: string): string {
  const db = getDb();
  const client = getClient(clientId);
  const agentId = `mcp-${userId.slice(0, 8)}-${hash(clientId).slice(0, 8)}`;

  const existing = db
    .prepare("SELECT id, owner_id FROM registered_agents WHERE id = ?")
    .get(agentId) as { id: string; owner_id: string | null } | undefined;

  if (existing) {
    // Reconnecting revives an agent the user had deregistered, and re-asserts
    // ownership if it was somehow lost — but never moves it to someone else.
    db.prepare(
      `UPDATE registered_agents
          SET deregistered_at = NULL,
              owner_id = COALESCE(owner_id, @userId),
              updated_at = @now
        WHERE id = @agentId`
    ).run({ agentId, userId, now: nowIso() });
    return agentId;
  }

  const label = client?.clientName?.trim() || "MCP client";
  db.prepare(
    `INSERT INTO registered_agents
       (id, name, role, platform, protocol, status, location, owner_id, metadata, created_at, updated_at)
     VALUES (@id, @name, @role, @platform, 'rest', 'active', 'cloudflare', @ownerId, @metadata, @now, @now)`
  ).run({
    id: agentId,
    name: label,
    role: "Connected over MCP",
    // Cowork is the connector this path exists for; anything else that
    // completes the same OAuth flow is still a remote MCP client.
    platform: /cowork/i.test(label) ? "cowork" : "claude",
    ownerId: userId,
    metadata: JSON.stringify({ mcp: { clientId, registeredVia: "oauth" } }),
    now: nowIso(),
  });
  return agentId;
}

export interface ResolvedToken {
  userId: string;
  clientId: string;
  scope: string;
  /** The agent this token acts as — what makes an audited write possible. */
  agentId: string;
}

/** Resolve a bearer token to its principal. Returns null when unusable. */
export function resolveAccessToken(token: string): ResolvedToken | null {
  const db = getDb();
  const h = hash(token);
  const row = db
    .prepare(
      `SELECT client_id, user_id, scope, expires_at, revoked_at
       FROM mcp_oauth_tokens WHERE token_hash = ? AND kind = 'access'`
    )
    .get(h) as
    | { client_id: string; user_id: string; scope: string; expires_at: string; revoked_at: string | null }
    | undefined;

  if (!row || row.revoked_at || isExpired(row.expires_at)) return null;

  db.prepare("UPDATE mcp_oauth_tokens SET last_used_at = ? WHERE token_hash = ?").run(nowIso(), h);
  // Resolved on use rather than only at issuance, so a token minted before this
  // existed still yields an agent instead of failing every write.
  const agentId = ensureMcpAgent(row.user_id, row.client_id);
  return { userId: row.user_id, clientId: row.client_id, scope: row.scope, agentId };
}

/** Rotate on refresh: the presented refresh token is revoked as it is used. */
export function consumeRefreshToken(token: string): ResolvedToken | null {
  const db = getDb();
  const h = hash(token);
  const row = db
    .prepare(
      `SELECT client_id, user_id, scope, expires_at, revoked_at
       FROM mcp_oauth_tokens WHERE token_hash = ? AND kind = 'refresh'`
    )
    .get(h) as
    | { client_id: string; user_id: string; scope: string; expires_at: string; revoked_at: string | null }
    | undefined;

  if (!row || row.revoked_at || isExpired(row.expires_at)) return null;

  const revoked = db
    .prepare("UPDATE mcp_oauth_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
    .run(nowIso(), h);
  if (revoked.changes !== 1) return null;

  return {
    userId: row.user_id,
    clientId: row.client_id,
    scope: row.scope,
    agentId: ensureMcpAgent(row.user_id, row.client_id),
  };
}

/** PKCE S256 verification. Plain is deliberately unsupported. */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  return computed === codeChallenge;
}
