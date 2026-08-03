import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { Google } from "arctic";
import { getDb } from "@/lib/db";
import { isHttpsRequest } from "@/lib/auth/secure-cookie";
import { signAccessToken } from "@/lib/auth/jwt";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import {
  ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS,
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_TTL_DAYS,
} from "@/lib/auth/session-limits";
import {
  GOOGLE_INVITE_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  isHostedDomainAllowed,
  getGoogleOidcConfig,
  makeUnusablePasswordHash,
  verifyGoogleIdToken,
  type GoogleIdentityClaims,
} from "@/lib/auth/google-oidc";
import { resolveGoogleSignIn } from "@/lib/store/google-identity";

export const dynamic = "force-dynamic";

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

/** Map a sign-in failure to the page + query the user should land on. */
function errorRedirect(inviteToken: string | null, code: string): string {
  if (inviteToken) return `/invite/${encodeURIComponent(inviteToken)}?error=${code}`;
  return `/login?error=${code}`;
}

export async function GET(req: NextRequest) {
  const rateLimited = checkAuthRateLimit(req, "login");
  if (rateLimited) return rateLimited;

  const config = getGoogleOidcConfig();
  if (!config) {
    return Response.json({ error: "google sign-in is not configured" }, { status: 404 });
  }

  const cookieHeader = req.headers.get("cookie");
  const storedState = parseCookie(cookieHeader, GOOGLE_STATE_COOKIE);
  const codeVerifier = parseCookie(cookieHeader, GOOGLE_VERIFIER_COOKIE);
  const inviteToken = parseCookie(cookieHeader, GOOGLE_INVITE_COOKIE);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  const secureFlag = isHttpsRequest(req) ? "; Secure" : "";
  const clearFlowCookies = (response: Response) => {
    for (const name of [GOOGLE_STATE_COOKIE, GOOGLE_VERIFIER_COOKIE, GOOGLE_INVITE_COOKIE]) {
      response.headers.append(
        "Set-Cookie",
        `${name}=; HttpOnly; SameSite=Lax${secureFlag}; Path=/; Max-Age=0`
      );
    }
    return response;
  };
  const redirect = (location: string, status = 302) =>
    clearFlowCookies(new Response(null, { status, headers: { Location: location } }));

  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    return redirect(errorRedirect(inviteToken, "google_state_mismatch"));
  }

  const google = new Google(config.clientId, config.clientSecret, config.redirectUri);
  let claims: GoogleIdentityClaims;
  try {
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    // Verified against Google's JWKS rather than decoded: this pins `aud` to
    // our own client id and enforces issuer and expiry, so a token minted for
    // another OAuth client cannot be replayed here.
    claims = await verifyGoogleIdToken(tokens.idToken(), config.clientId);
  } catch {
    return redirect(errorRedirect(inviteToken, "google_exchange_failed"));
  }
  if (!claims.sub || !claims.email) {
    return redirect(errorRedirect(inviteToken, "google_claims_missing"));
  }

  // Workspace domain allowlist, when the operator has configured one.
  if (!isHostedDomainAllowed(claims.hostedDomain)) {
    return redirect(errorRedirect(inviteToken, "google_domain_not_allowed"));
  }

  const db = getDb();
  const unusableHash = await makeUnusablePasswordHash();
  const result = resolveGoogleSignIn(db, claims, inviteToken, unusableHash, {
    // The Google subject is the only identifier available before a local user
    // exists; the email is recorded as the asset so a refusal is still
    // traceable to who attempted it.
    actor: `google:${claims.sub}`,
    action: "auth.google.sign_in",
    asset: `users/email/${claims.email}`,
    purpose: "console sign-in via Google OIDC",
    label: { visibility: "private", domain: "identity", sensitivity: "high", policy: "sealed" },
    decision: "allow",
  });

  if (result.status !== "ok") {
    return redirect(errorRedirect(inviteToken, `google_${result.status}`));
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now, result.userId);

  // Session issuance mirrors /api/auth/login and /api/auth/register.
  const accessToken = await signAccessToken(result.userId, result.role);
  const rawRefresh = randomBytes(32).toString("hex");
  const refreshHash = createHash("sha256").update(rawRefresh).digest("hex");
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86400_000).toISOString();
  db.prepare(
    "INSERT INTO user_refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)"
  ).run(randomBytes(8).toString("hex"), result.userId, refreshHash, refreshExpiresAt);

  const destination = inviteToken
    ? `/invite/${encodeURIComponent(inviteToken)}?google=connected`
    : "/";
  const response = redirect(destination);
  response.headers.append(
    "Set-Cookie",
    `${REFRESH_TOKEN_COOKIE_NAME}=${rawRefresh}; HttpOnly; SameSite=Lax${secureFlag}; Path=/; Max-Age=${REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS}`
  );
  response.headers.append(
    "Set-Cookie",
    `${ACCESS_TOKEN_COOKIE_NAME}=${accessToken}; HttpOnly; SameSite=Lax${secureFlag}; Path=/; Max-Age=${ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS}`
  );
  return response;
}
