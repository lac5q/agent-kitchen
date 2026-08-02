import {
  DISCOVERY_HEADERS,
  buildProtectedResourceMetadata,
  publicOriginFromRequest,
} from "@/lib/auth/mcp-oauth";

export const dynamic = "force-dynamic";

/**
 * RFC 9728 path-suffix form: metadata for a resource at `https://host/mcp`
 * lives at `https://host/.well-known/oauth-protected-resource/mcp`.
 *
 * The MCP server advertises exactly that URL in its 401 `WWW-Authenticate`
 * challenge, so serving only the bare path left the pointer resolving to a
 * 404 — the client had somewhere to look and found nothing.
 *
 * Same document either way; this resource has one protected endpoint.
 */
export async function GET(request: Request) {
  const origin = publicOriginFromRequest(request);
  return new Response(JSON.stringify(buildProtectedResourceMetadata(origin), null, 2), {
    status: 200,
    headers: DISCOVERY_HEADERS,
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: DISCOVERY_HEADERS });
}
