import { timingSafeEqual } from "crypto";

import { resolveAccessToken } from "@/lib/auth/mcp-oauth-store";

export const dynamic = "force-dynamic";

/**
 * RFC 7662 token introspection, for the MCP resource server.
 *
 * The Python MCP on :8765 has no database access, so it asks here whether a
 * bearer token is live and who it belongs to. Introspecting per request (rather
 * than caching a decision) is what makes revocation immediate: revoke the token
 * row and the very next MCP call fails.
 *
 * /api/auth/* is public at the proxy layer, so this route authenticates its
 * own caller — otherwise it would be an oracle for testing stolen tokens.
 */
function callerAuthorized(request: Request): boolean {
  // A dedicated secret, not the operator key: this endpoint is called by one
  // service for one purpose, and overloading a broader credential widens the
  // blast radius if it leaks. It also refuses obvious placeholders, because a
  // compose default like "demo-key" must never be what guards token lookup.
  const expected = (process.env.MEMROOS_MCP_INTROSPECTION_SECRET ?? "").trim();
  if (!expected || expected.length < 24 || expected === "demo-key") return false;

  const header = request.headers.get("authorization") ?? "";
  const presented = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!presented) return false;

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!callerAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  let token = "";
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      token = typeof body.token === "string" ? body.token : "";
    } else {
      token = new URLSearchParams(await request.text()).get("token") ?? "";
    }
  } catch {
    token = "";
  }

  // RFC 7662: an unusable token is reported as inactive, not as an error, and
  // the response carries nothing else — no hint about why it failed.
  const resolved = token ? resolveAccessToken(token) : null;
  if (!resolved) {
    return Response.json({ active: false }, { headers: { "cache-control": "no-store" } });
  }

  return Response.json(
    {
      active: true,
      sub: resolved.userId,
      client_id: resolved.clientId,
      scope: resolved.scope,
      token_type: "Bearer",
    },
    { headers: { "cache-control": "no-store" } }
  );
}
