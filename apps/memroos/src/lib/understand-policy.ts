export const UNDERSTAND_JSON_ROUTE_PATHS = [
  "/knowledge-graph.json",
  "/meta.json",
  "/config.json",
  "/file-content.json",
  "/domain-graph.json",
  "/diff-overlay.json",
] as const;

export const UNDERSTAND_NOINDEX_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "frame-ancestors 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

export function isUnderstandRoutePath(pathname: string): boolean {
  return (
    pathname === "/understand" ||
    pathname.startsWith("/understand-static/") ||
    UNDERSTAND_JSON_ROUTE_PATHS.some((routePath) => routePath === pathname)
  );
}

export function toNextHeaders(headers: Record<string, string>): Array<{ key: string; value: string }> {
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}
