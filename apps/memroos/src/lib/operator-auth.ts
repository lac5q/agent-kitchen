const OPERATOR_HEADER = "x-memroos-operator-key";

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function hostnameFromHostHeader(value: string): string {
  if (value.startsWith("[")) {
    return value.slice(1, value.indexOf("]"));
  }
  return value.split(":")[0] ?? value;
}

function getRequestHostname(request: Request): string | null {
  // CR-08 fix: do NOT trust x-forwarded-host for loopback detection — an external
  // attacker can spoof it. Use only request.url (set by Next.js from the actual
  // socket connection) or the Host header, which the server controls.
  try {
    const url = new URL(request.url);
    if (url.hostname && url.hostname !== "0.0.0.0") return url.hostname;
  } catch {
    // fall through to Host header
  }
  const hostHeader = request.headers.get("host");
  return hostHeader ? hostnameFromHostHeader(hostHeader) : null;
}

function hasOperatorKey(request: Request, expectedKey: string): boolean {
  const headerKey = request.headers.get(OPERATOR_HEADER);
  const authorization = request.headers.get("authorization");
  const bearerKey = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  return headerKey === expectedKey || bearerKey === expectedKey;
}

export function authorizeRegistryWrite(request: Request): boolean {
  const hostname = getRequestHostname(request);
  if (hostname && isLoopbackHost(hostname)) return true;

  const operatorKey = process.env.MEMROOS_OPERATOR_API_KEY;
  if (operatorKey) {
    return hasOperatorKey(request, operatorKey);
  }
  return false;
}

/**
 * Strict registry authorization for routes where loopback reachability is not
 * itself proof of operator intent. Keep authorizeRegistryWrite unchanged for
 * legacy internal callers that still rely on its local-runtime behavior.
 */
export function authorizeRegistryWriteStrict(request: Request): boolean {
  const operatorKey = process.env.MEMROOS_OPERATOR_API_KEY;
  return Boolean(operatorKey && hasOperatorKey(request, operatorKey));
}

export function registryWriteUnauthorizedResponse(): Response {
  return Response.json(
    { ok: false, error: "Registry write authorization required" },
    { status: 403 }
  );
}
