/**
 * Auth helper for skill sync governance write endpoints.
 *
 * Mirrors `quarantine/_auth.ts` so the proposal / pin routes share the
 * same operator-key + loopback convention used by the quarantine lane.
 *
 * Returns 401 when no operator key is configured (caller has no way to
 * authenticate), 403 when a key is configured but the request did not
 * supply a matching header. Loopback requests are always authorized.
 *
 * Shared by:
 *   - /api/skills/proposals (POST, GET list)
 *   - /api/skills/proposals/[id]/approve
 *   - /api/skills/proposals/[id]/reject
 *   - /api/skills/pins (POST, GET list)
 *   - /api/skills/pins/[id]/rollback
 *
 * Read-only GET list endpoints do not call this helper — they mirror
 * the public-read convention used by /api/skills/import (GET) and
 * /api/skills/quarantine (GET).
 */

interface SyncAuthOk {
  ok: true;
  operator: string;
}
interface SyncAuthDenied {
  ok: false;
  response: Response;
}

export function authorizeSyncWrite(
  request: Request
): SyncAuthOk | SyncAuthDenied {
  // Loopback shortcut — same as authorizeRegistryWrite in lib/operator-auth
  // and authorizeQuarantineWrite in skills/quarantine/_auth.ts.
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
