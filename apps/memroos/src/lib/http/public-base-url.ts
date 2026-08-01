/**
 * Resolve a non-localhost MemRoOS base URL for minted invite/onboarding links.
 * Prefers configured public env, then forwarded host, then request origin.
 */
function isLocalhostUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return true;
  }
}

function stripTrailingSlash(raw: string): string {
  return raw.replace(/\/+$/, "");
}

export function resolvePublicMemroosUrl(request: Request): string {
  const candidates = [
    process.env.MEMROOS_PUBLIC_BASE_URL,
    process.env.MEMROOS_APP_URL,
    process.env.MEMROOS_BASE_URL,
  ];
  for (const candidate of candidates) {
    if (candidate && !isLocalhostUrl(candidate)) {
      return stripTrailingSlash(candidate);
    }
  }

  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return stripTrailingSlash(`${proto}://${forwardedHost}`);
  }

  return stripTrailingSlash(`${url.protocol}//${url.host}`);
}
