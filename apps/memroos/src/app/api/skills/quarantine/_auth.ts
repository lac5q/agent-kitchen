/**
 * Auth helper for quarantine write endpoints.
 *
 * Returns 401 when no operator key is configured (caller has no way to
 * authenticate), 403 when a key is configured but the request did not
 * supply a matching header. Loopback requests are always authorized.
 *
 * Shared by the approve and reject routes; lives outside the GET route
 * module because Next.js route files only export HTTP method handlers.
 */

interface QuarantineAuthOk {
  ok: true;
  operator: string;
}
interface QuarantineAuthDenied {
  ok: false;
  response: Response;
}

export function authorizeQuarantineWrite(
  request: Request
): QuarantineAuthOk | QuarantineAuthDenied {
  // Loopback shortcut — same as authorizeRegistryWrite in lib/operator-auth.
  try {
    const url = new URL(request.url);
    const hostname = url.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    ) {
      return { ok: true, operator: "loopback" };
    }
  } catch {
    /* fall through */
  }

  const operatorKey = process.env["MEMROOS_OPERATOR_API_KEY"];
  if (!operatorKey) {
    return {
      ok: false,
      response: Response.json(
        {
          ok: false,
          error:
            "Operator authentication required (set MEMROOS_OPERATOR_API_KEY or call from loopback)",
        },
        { status: 401 }
      ),
    };
  }

  const headerKey = request.headers.get("x-memroos-operator-key");
  const authorization = request.headers.get("authorization");
  const bearerKey = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

  if (headerKey !== operatorKey && bearerKey !== operatorKey) {
    return {
      ok: false,
      response: Response.json(
        {
          ok: false,
          error: "Operator authentication required (invalid or missing key)",
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, operator: "operator-key" };
}
