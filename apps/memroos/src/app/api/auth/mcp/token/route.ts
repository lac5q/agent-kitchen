import { DISCOVERY_HEADERS } from "@/lib/auth/mcp-oauth";
import {
  consumeAuthorizationCode,
  consumeRefreshToken,
  getClient,
  issueTokens,
  verifyClientSecret,
  verifyPkce,
} from "@/lib/auth/mcp-oauth-store";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" };

function bad(error: string, description: string, status = 400) {
  return Response.json({ error, error_description: description }, { status, headers: NO_STORE });
}

/** Token endpoint: authorization_code and refresh_token grants. */
export async function POST(request: Request) {
  let form: URLSearchParams;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      form = new URLSearchParams(
        Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")])
      );
    } else {
      form = new URLSearchParams(await request.text());
    }
  } catch {
    return bad("invalid_request", "unparseable body");
  }

  const grantType = form.get("grant_type") ?? "";
  const clientId = form.get("client_id") ?? "";
  const clientSecret = form.get("client_secret");

  const client = clientId ? getClient(clientId) : null;
  if (!client) return bad("invalid_client", "unknown client_id", 401);

  // A client that registered with a secret must present it; a public client
  // must not be able to authenticate by simply omitting one.
  if (client.hasSecret) {
    if (!clientSecret || !verifyClientSecret(clientId, clientSecret)) {
      return bad("invalid_client", "client authentication failed", 401);
    }
  }

  if (grantType === "authorization_code") {
    const code = form.get("code") ?? "";
    const redirectUri = form.get("redirect_uri") ?? "";
    const verifier = form.get("code_verifier") ?? "";
    if (!code) return bad("invalid_request", "code is required");
    if (!verifier) return bad("invalid_request", "code_verifier is required");

    const consumed = consumeAuthorizationCode(code);
    if (!consumed) return bad("invalid_grant", "code is invalid, expired, or already used");
    if (consumed.clientId !== clientId) return bad("invalid_grant", "code was issued to a different client");
    if (consumed.redirectUri !== redirectUri) return bad("invalid_grant", "redirect_uri does not match the authorization request");
    if (!verifyPkce(verifier, consumed.codeChallenge)) return bad("invalid_grant", "PKCE verification failed");

    const tokens = issueTokens({ clientId, userId: consumed.userId, scope: consumed.scope });
    return Response.json(
      {
        access_token: tokens.accessToken,
        token_type: "Bearer",
        expires_in: tokens.expiresIn,
        refresh_token: tokens.refreshToken,
        scope: consumed.scope,
      },
      { headers: NO_STORE }
    );
  }

  if (grantType === "refresh_token") {
    const presented = form.get("refresh_token") ?? "";
    if (!presented) return bad("invalid_request", "refresh_token is required");

    const resolved = consumeRefreshToken(presented);
    if (!resolved) return bad("invalid_grant", "refresh token is invalid, expired, or already used");
    if (resolved.clientId !== clientId) return bad("invalid_grant", "refresh token was issued to a different client");

    const tokens = issueTokens({ clientId, userId: resolved.userId, scope: resolved.scope });
    return Response.json(
      {
        access_token: tokens.accessToken,
        token_type: "Bearer",
        expires_in: tokens.expiresIn,
        refresh_token: tokens.refreshToken,
        scope: resolved.scope,
      },
      { headers: NO_STORE }
    );
  }

  return bad("unsupported_grant_type", `grant_type ${grantType || "(missing)"} is not supported`);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...DISCOVERY_HEADERS, "access-control-allow-methods": "POST, OPTIONS" },
  });
}
