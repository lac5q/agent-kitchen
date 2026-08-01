import { NextRequest } from "next/server";
import { Google, generateCodeVerifier, generateState } from "arctic";
import { isHttpsRequest } from "@/lib/auth/secure-cookie";
import {
  GOOGLE_FLOW_COOKIE_MAX_AGE_SECONDS,
  GOOGLE_INVITE_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  getGoogleOidcConfig,
} from "@/lib/auth/google-oidc";

export const dynamic = "force-dynamic";

/**
 * Phase 203: start the Google OIDC (PKCE) flow for console registration/login.
 * `?invite=<token>` binds a pending invite; it rides along in a short-lived
 * HttpOnly cookie so the callback can consume it.
 */
export async function GET(req: NextRequest) {
  const config = getGoogleOidcConfig();
  if (!config) {
    return Response.json({ error: "google sign-in is not configured" }, { status: 404 });
  }

  const google = new Google(config.clientId, config.clientSecret, config.redirectUri);
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const authUrl = google.createAuthorizationURL(state, codeVerifier, [
    "openid",
    "email",
    "profile",
  ]);

  const inviteToken = (req.nextUrl.searchParams.get("invite") ?? "").trim();
  const secureFlag = isHttpsRequest(req) ? "; Secure" : "";
  const flowCookie = (name: string, value: string) =>
    `${name}=${value}; HttpOnly; SameSite=Lax${secureFlag}; Path=/; Max-Age=${GOOGLE_FLOW_COOKIE_MAX_AGE_SECONDS}`;

  const response = new Response(null, {
    status: 302,
    headers: { Location: authUrl.toString() },
  });
  response.headers.append("Set-Cookie", flowCookie(GOOGLE_STATE_COOKIE, state));
  response.headers.append("Set-Cookie", flowCookie(GOOGLE_VERIFIER_COOKIE, codeVerifier));
  if (inviteToken) {
    response.headers.append("Set-Cookie", flowCookie(GOOGLE_INVITE_COOKIE, inviteToken));
  }
  return response;
}
