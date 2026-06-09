import { NextResponse, type NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ROLE_RANK } from "@/lib/auth/middleware-roles";
import type { UserRole } from "@/lib/auth/types";

const PUBLIC_HOSTS = new Set([
  "memroos.com",
  "www.memroos.com",
  "memroos.vercel.app",
  "memroos.localhost",
]);
const LEGACY_HOSTS = new Set(["memroos.dev", "www.memroos.dev"]);
const DEFAULT_HTTPS_APP_HOSTS = new Set<string>();

function normalizeHost(host: string): string {
  return host.split(":")[0]?.toLowerCase() ?? "";
}

function isPublicLandingHost(host: string): boolean {
  return PUBLIC_HOSTS.has(host) || host.endsWith(".vercel.app");
}

function isLandingAsset(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname === "/llms.txt" ||
    pathname === "/llms-full.txt" ||
    pathname.startsWith("/blog") ||
    pathname.startsWith("/platform") ||
    pathname.startsWith("/use-cases") ||
    pathname.startsWith("/vs") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/diagrams/") ||
    pathname.startsWith("/demo/") ||
    pathname.startsWith("/landing/") ||
    pathname.startsWith("/research/") ||
    pathname.startsWith("/screenshots/")
  );
}

function getHttpsAppHosts(): Set<string> {
  return new Set([
    ...DEFAULT_HTTPS_APP_HOSTS,
    ...(process.env.MEMROOS_HTTPS_APP_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  ]);
}

function shouldRedirectToHttps(request: NextRequest, host: string): boolean {
  if (!getHttpsAppHosts().has(host)) return false;
  return request.nextUrl.protocol === "http:" || request.headers.get("x-forwarded-proto") === "http";
}

/** Routes that require at least operator role */
const OPERATOR_ROUTES: Array<{ method?: string; pattern: RegExp }> = [
  { method: "POST", pattern: /^\/api\/onboarding\/invite$/ },
  { method: "PUT", pattern: /^\/api\/evals\/config$/ },
  { method: "POST", pattern: /^\/api\/evals\/run$/ },
  { method: "POST", pattern: /^\/api\/seal\// },
  { method: "PATCH", pattern: /^\/api\/seal\// },
  { method: "POST", pattern: /^\/api\/l3\/poll$/ },
];

/** Routes that require admin role */
const ADMIN_ROUTES: Array<{ method?: string; pattern: RegExp }> = [
  { method: "POST", pattern: /^\/api\/auth\/invite$/ },
];

const ROUTE_LOCAL_AUTH_API_ROUTES: Array<{ method?: string; pattern: RegExp }> = [
  { pattern: /^\/api\/chatgpt\/actions\// },
  { pattern: /^\/api\/agent-context\// },
  { method: "POST", pattern: /^\/api\/agent-memory\/capture$/ },
  { method: "POST", pattern: /^\/api\/agent-memory\/handoff$/ },
  { method: "POST", pattern: /^\/api\/agents\/register$/ },
  { method: "POST", pattern: /^\/api\/dispatch$/ },
  { method: "POST", pattern: /^\/api\/heartbeat$/ },
  { method: "POST", pattern: /^\/api\/memory\/add$/ },
  { pattern: /^\/api\/memory\/evals\// },
  { method: "POST", pattern: /^\/api\/skills\/report$/ },
  // SkillForge endpoints implement their own local/operator-key auth. The proxy
  // must not require a human JWT before cron/operator workers can reach them.
  { pattern: /^\/api\/skillforge\// },
  { method: "POST", pattern: /^\/api\/tool-attention\/record$/ },
];

function hasRouteLocalAuth(pathname: string, method: string): boolean {
  return ROUTE_LOCAL_AUTH_API_ROUTES.some((rule) => rule.pattern.test(pathname) && (!rule.method || rule.method === method));
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://www.google-analytics.com https://stats.g.doubleclick.net",
      "connect-src 'self' http://localhost:* ws://localhost:* https://www.google-analytics.com https://region1.google-analytics.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

function getTokenFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();

  // Cookie fallback for SSR
  const cookie = req.cookies.get("access_token");
  return cookie?.value ?? null;
}

async function enforceAuth(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // 1. Always pass through auth endpoints and public API
  if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/public/")) {
    return NextResponse.next();
  }

  // 2. Pass through login/invite/register UI pages
  if (pathname === "/login" || pathname.startsWith("/invite/") || pathname === "/register") {
    return NextResponse.next();
  }

  // 3. For all other /api/* routes: require valid JWT
  if (pathname.startsWith("/api/")) {
    if (hasRouteLocalAuth(pathname, req.method)) {
      return NextResponse.next();
    }

    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: "authentication required" }, { status: 401 });
    }

    const payload = await verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json({ error: "authentication required" }, { status: 401 });
    }

    const userRole = payload.role as UserRole;
    const method = req.method;

    for (const rule of ADMIN_ROUTES) {
      if (rule.pattern.test(pathname) && (!rule.method || rule.method === method)) {
        if (ROLE_RANK[userRole] < ROLE_RANK["admin"]) {
          return NextResponse.json({ error: "insufficient permissions" }, { status: 403 });
        }
      }
    }

    for (const rule of OPERATOR_ROUTES) {
      if (rule.pattern.test(pathname) && (!rule.method || rule.method === method)) {
        if (ROLE_RANK[userRole] < ROLE_RANK["operator"]) {
          return NextResponse.json({ error: "insufficient permissions" }, { status: 403 });
        }
      }
    }

    if (ROLE_RANK[userRole] < ROLE_RANK["reviewer"]) {
      return NextResponse.json({ error: "insufficient permissions" }, { status: 403 });
    }

    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-user-id", payload.sub);
    requestHeaders.set("x-user-role", userRole);

    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // 4. UI routes: redirect to /login if no valid access token cookie
  if (!pathname.startsWith("/_next") && !pathname.startsWith("/favicon")) {
    const accessCookie = req.cookies.get("access_token");
    if (!accessCookie?.value) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }
    const payload = await verifyAccessToken(accessCookie.value);
    if (!payload) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const host = normalizeHost(request.headers.get("host") ?? "");
  const { pathname } = request.nextUrl;

  if (shouldRedirectToHttps(request, host)) {
    const httpsUrl = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, `https://${host}`);
    return NextResponse.redirect(httpsUrl, 307);
  }

  // Legacy host → permanent redirect to canonical domain
  if (LEGACY_HOSTS.has(host)) {
    return NextResponse.redirect("https://memroos.com/", 308);
  }

  // Public marketing host: serve landing assets, redirect everything else to "/"
  if (isPublicLandingHost(host)) {
    if (pathname === "/") {
      const landingUrl = request.nextUrl.clone();
      landingUrl.pathname = "/landing/index.html";
      return withSecurityHeaders(NextResponse.rewrite(landingUrl));
    }
    if (isLandingAsset(pathname)) {
      return withSecurityHeaders(NextResponse.next());
    }
    return withSecurityHeaders(NextResponse.redirect(new URL("/", request.url)));
  }

  // App host: enforce RBAC auth (formerly middleware.ts)
  return withSecurityHeaders(await enforceAuth(request));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
