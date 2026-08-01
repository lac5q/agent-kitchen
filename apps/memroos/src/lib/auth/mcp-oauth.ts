/**
 * MCP authorization-server metadata and helpers.
 *
 * Claude's custom-connector flow (Cowork / claude.ai) speaks the MCP
 * authorization spec: it reads RFC 9728 protected-resource metadata, follows
 * it to RFC 8414 authorization-server metadata, then self-registers with
 * RFC 7591 Dynamic Client Registration. There is no bearer-token field in that
 * UI, so OAuth is the only way that surface can authenticate — unlike the
 * Claude Code CLI, which accepts `--header "Authorization: Bearer …"`.
 *
 * The Next app is the authorization server rather than the Python MCP on
 * :8765, because it already owns Google OIDC, the user/role model, and session
 * signing — and cloudflared already routes /.well-known/* here (its `/mcp*`
 * path rule does not match).
 */

/** Scopes an MCP client may request. Kept deliberately small. */
export const MCP_SCOPES_SUPPORTED = ["mcp:read", "mcp:write"] as const;

export const MCP_OAUTH_PATHS = {
  authorize: "/api/auth/mcp/authorize",
  token: "/api/auth/mcp/token",
  register: "/api/auth/mcp/register",
} as const;

/**
 * Public origin for this request.
 *
 * Derived per-request rather than from a single env var because one build
 * serves two hosts (memroos.epiloguecapital.com and
 * memroos-cordant.epiloguecapital.com) and the issuer must match the host the
 * client actually dialled — a mismatched issuer fails discovery validation.
 *
 * `x-forwarded-*` is trusted here only to reconstruct a public URL for
 * non-secret discovery documents; it is never used for an auth decision.
 */
export function publicOriginFromRequest(request: Request): string {
  const configured = (process.env.MEMROOS_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const url = new URL(request.url);

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim() || url.host;

  if (configured) {
    // Prefer the configured origin when it matches the dialled host, so a
    // single-host deployment keeps its canonical scheme.
    try {
      if (new URL(configured).host === host) return configured;
    } catch {
      // fall through to reconstruction
    }
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

/** RFC 9728 — protected-resource metadata for the MCP endpoint. */
export function buildProtectedResourceMetadata(origin: string): Record<string, unknown> {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: [...MCP_SCOPES_SUPPORTED],
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/docs`,
  };
}

/** RFC 8414 — authorization-server metadata. */
export function buildAuthorizationServerMetadata(origin: string): Record<string, unknown> {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}${MCP_OAUTH_PATHS.authorize}`,
    token_endpoint: `${origin}${MCP_OAUTH_PATHS.token}`,
    registration_endpoint: `${origin}${MCP_OAUTH_PATHS.register}`,
    scopes_supported: [...MCP_SCOPES_SUPPORTED],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    // PKCE is required, not optional: registration is open, so a public client
    // with no secret must still be protected against code interception.
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    service_documentation: `${origin}/docs`,
  };
}

/** Discovery documents are public and cacheable; never put secrets in them. */
export const DISCOVERY_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  "cache-control": "public, max-age=300",
  // Claude fetches discovery from a browser-ish context; without this the
  // preflight fails and the connector reports a generic registration error.
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version",
};
