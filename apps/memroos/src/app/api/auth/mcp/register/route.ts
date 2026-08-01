import { DISCOVERY_HEADERS, MCP_SCOPES_SUPPORTED } from "@/lib/auth/mcp-oauth";
import { registerClient } from "@/lib/auth/mcp-oauth-store";

export const dynamic = "force-dynamic";

/**
 * RFC 7591 Dynamic Client Registration.
 *
 * Claude self-registers here when a user adds the connector, which is what
 * makes the flow zero-config: no client id or secret is ever pasted by hand.
 * Registration is open (the spec's common case for MCP), so security rests on
 * PKCE plus exact redirect-URI matching at /authorize, not on knowing a secret.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_client_metadata", error_description: "body must be JSON" }, { status: 400 });
  }

  const rawUris = body.redirect_uris;
  const redirectUris = Array.isArray(rawUris) ? rawUris.filter((u): u is string => typeof u === "string") : [];
  if (redirectUris.length === 0) {
    return Response.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris is required and must be a non-empty array" },
      { status: 400 }
    );
  }
  for (const uri of redirectUris) {
    try {
      const parsed = new URL(uri);
      // Loopback stays http for native clients; everything else must be https.
      const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
      if (parsed.protocol !== "https:" && !(loopback && parsed.protocol === "http:")) {
        return Response.json(
          { error: "invalid_redirect_uri", error_description: `redirect_uri must be https (or http on loopback): ${uri}` },
          { status: 400 }
        );
      }
    } catch {
      return Response.json({ error: "invalid_redirect_uri", error_description: `not a URL: ${uri}` }, { status: 400 });
    }
  }

  const clientName = typeof body.client_name === "string" ? body.client_name : "MCP client";
  const method = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  const { clientId, clientSecret } = registerClient({
    clientName,
    redirectUris,
    issueSecret: method === "client_secret_post" || method === "client_secret_basic",
  });

  return Response.json(
    {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: clientSecret ? "client_secret_post" : "none",
      scope: MCP_SCOPES_SUPPORTED.join(" "),
    },
    { status: 201, headers: { "cache-control": "no-store" } }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { ...DISCOVERY_HEADERS, "access-control-allow-methods": "POST, OPTIONS" },
  });
}
