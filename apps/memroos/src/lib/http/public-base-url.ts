export type PublicMemroosUrlSource = "env" | "forwarded-host" | "request-origin";

export interface PublicMemroosUrlResolution {
  url: string;
  source: PublicMemroosUrlSource;
}

function isLocalhostUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return true;
  }
}

function stripTrailingSlash(raw: string): string {
  return raw.replace(/\/+$/, "");
}

/**
 * Resolve a non-localhost MemRoOS base URL for minted invite/onboarding links.
 * Prefers configured public env, then forwarded host, then request origin.
 */
export function resolvePublicMemroosUrlDetailed(request: Request): PublicMemroosUrlResolution {
  const candidates = [
    process.env.MEMROOS_PUBLIC_BASE_URL,
    process.env.MEMROOS_APP_URL,
    process.env.MEMROOS_BASE_URL,
  ];
  for (const candidate of candidates) {
    if (candidate && !isLocalhostUrl(candidate)) {
      return { url: stripTrailingSlash(candidate), source: "env" };
    }
  }

  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedHost) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return { url: stripTrailingSlash(`${proto}://${forwardedHost}`), source: "forwarded-host" };
  }

  return { url: stripTrailingSlash(`${url.protocol}//${url.host}`), source: "request-origin" };
}

export function resolvePublicMemroosUrl(request: Request): string {
  return resolvePublicMemroosUrlDetailed(request).url;
}
