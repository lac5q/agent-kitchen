interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 10;
const buckets = new Map<string, Bucket>();

function trustsProxyHeaders(): boolean {
  return ["1", "true", "yes", "on"].includes((process.env.AUTH_TRUST_PROXY_HEADERS ?? "").toLowerCase());
}

function keyFor(req: Request, scope: string): string {
  const forwarded = trustsProxyHeaders() ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : null;
  const realIp = trustsProxyHeaders() ? req.headers.get("x-real-ip") : null;
  const ip = forwarded || realIp || "unknown";
  return `${scope}:${ip}`;
}

/** Return the request identity used by IP-scoped rate limits. */
export function getRateLimitIp(req: Request): string {
  const forwarded = trustsProxyHeaders() ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : null;
  const realIp = trustsProxyHeaders() ? req.headers.get("x-real-ip") : null;
  return forwarded || realIp || "unknown";
}

/**
 * Additive limiter for routes whose principal and window differ from the
 * legacy one-minute authentication limiter. Existing auth callers continue to
 * use `checkAuthRateLimit` unchanged.
 */
export function checkScopedRateLimit(
  _req: Request,
  scope: string,
  principal: string,
  limit: number,
  windowMs: number,
): Response | null {
  const now = Date.now();
  const key = `${scope}:${principal}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return Response.json(
      { error: "too many requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }
  return null;
}

export function checkAuthRateLimit(req: Request, scope: string, limit = DEFAULT_LIMIT): Response | null {
  const now = Date.now();
  const key = keyFor(req, scope);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return Response.json(
      { error: "too many authentication attempts", code: "AUTH_RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }
  return null;
}

export function clearAuthRateLimit(): void {
  buckets.clear();
}
