import {
  DISCOVERY_HEADERS,
  buildAuthorizationServerMetadata,
  publicOriginFromRequest,
} from "@/lib/auth/mcp-oauth";

export const dynamic = "force-dynamic";

/** RFC 8414. Public by design — advertises the endpoints a client must call. */
export async function GET(request: Request) {
  const origin = publicOriginFromRequest(request);
  return new Response(JSON.stringify(buildAuthorizationServerMetadata(origin), null, 2), {
    status: 200,
    headers: DISCOVERY_HEADERS,
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: DISCOVERY_HEADERS });
}
