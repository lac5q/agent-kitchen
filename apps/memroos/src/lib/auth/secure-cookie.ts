// apps/memroos/src/lib/auth/secure-cookie.ts
// Detect whether the current request is HTTPS, so we can decide whether
// to set the `Secure` flag on auth cookies.
//
// Why this exists: setting `Secure` based on `NODE_ENV === "production"`
// is wrong when the dev/staging instance is reached over HTTPS via a
// reverse proxy (the cookie would be incorrectly flagged) OR when the
// prod instance is reached over plain HTTP on a private network
// (the cookie would be silently dropped by the browser). The right
// signal is the actual request scheme, not the build environment.
//
// Detection priority:
//   1. `req.url.startsWith("https://")`  — direct HTTPS
//   2. `x-forwarded-proto: https`       — behind a reverse proxy
//   3. `x-forwarded-ssl: on`            — alt header some proxies send
// Anything else → not HTTPS → no `Secure` flag → cookie is stored on
// HTTP (which is what we want for the Tailscale endpoint and any local
// dev loopback).
export function isHttpsRequest(req: Request): boolean {
  try {
    if (typeof req.url === "string" && req.url.startsWith("https://")) {
      return true;
    }
  } catch {
    // ignore — fall through to header checks
  }
  const headers = req.headers;
  const forwardedProto = headers.get("x-forwarded-proto");
  if (forwardedProto && forwardedProto.toLowerCase() === "https") {
    return true;
  }
  const forwardedSsl = headers.get("x-forwarded-ssl");
  if (forwardedSsl && forwardedSsl.toLowerCase() === "on") {
    return true;
  }
  return false;
}
