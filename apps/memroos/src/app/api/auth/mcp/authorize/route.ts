import { NextRequest } from "next/server";

import { authenticateUser } from "@/lib/auth/session";
import { MCP_SCOPES_SUPPORTED, publicOriginFromRequest } from "@/lib/auth/mcp-oauth";
import { createAuthorizationCode, getClient, isRegisteredRedirectUri } from "@/lib/auth/mcp-oauth-store";

export const dynamic = "force-dynamic";

/**
 * Authorization endpoint (authorization code + PKCE).
 *
 * The human authenticates with the console's existing session — which today is
 * Google sign-in — so the MCP token is minted against a verified human rather
 * than a static secret living in a config file.
 *
 * Error handling splits deliberately: problems with client_id or redirect_uri
 * are rendered here, because redirecting to an unvalidated URI is how an open
 * redirect happens. Everything after validation goes back to the client as
 * RFC 6749 requires.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const clientId = p.get("client_id") ?? "";
  const redirectUri = p.get("redirect_uri") ?? "";
  const state = p.get("state") ?? "";
  const codeChallenge = p.get("code_challenge") ?? "";
  const codeChallengeMethod = p.get("code_challenge_method") ?? "";
  const responseType = p.get("response_type") ?? "";
  const scope = p.get("scope") ?? MCP_SCOPES_SUPPORTED.join(" ");

  const client = clientId ? getClient(clientId) : null;
  if (!client) {
    return Response.json({ error: "invalid_client", error_description: "unknown client_id" }, { status: 400 });
  }
  if (!redirectUri || !isRegisteredRedirectUri(client, redirectUri)) {
    return Response.json(
      { error: "invalid_request", error_description: "redirect_uri does not match a registered value" },
      { status: 400 }
    );
  }

  // From here a redirect back to the client is safe.
  const fail = (error: string, description: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    return Response.redirect(url.toString(), 302);
  };

  if (responseType !== "code") return fail("unsupported_response_type", "only response_type=code is supported");
  if (!codeChallenge) return fail("invalid_request", "code_challenge is required");
  if (codeChallengeMethod !== "S256") return fail("invalid_request", "code_challenge_method must be S256");

  const session = await authenticateUser(req);
  if (!session) {
    // Not signed in: send them to the console login and return here after.
    //
    // Build this from the public origin, not req.nextUrl: behind the tunnel
    // nextUrl carries the internal bind address, which produced a redirect to
    // https://0.0.0.0:3000/login that no browser can follow.
    const login = new URL("/login", publicOriginFromRequest(req));
    login.searchParams.set("next", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return Response.redirect(login.toString(), 302);
  }

  const code = createAuthorizationCode({
    clientId: client.clientId,
    userId: session.userId,
    redirectUri,
    codeChallenge,
    scope,
  });

  const back = new URL(redirectUri);
  back.searchParams.set("code", code);
  if (state) back.searchParams.set("state", state);
  return Response.redirect(back.toString(), 302);
}
