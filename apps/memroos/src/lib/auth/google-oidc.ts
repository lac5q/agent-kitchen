import { randomBytes } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { hashPassword } from "@/lib/auth/password";
import type { UserRole } from "@/lib/auth/types";

/**
 * Phase 203 — Google account registration/login for the operator console.
 *
 * Scope guard (operator clarification 2026-07-31): this is CONSOLE auth only.
 * Claude Cowork → /mcp connector auth stays admin-managed bearer; per-user MCP
 * OAuth is explicitly out of scope here.
 *
 * Flow: GET /api/auth/google (start, PKCE state cookies) → Google →
 * GET /api/auth/google/callback → link/create user → same session cookies as
 * password login/register.
 */

export const GOOGLE_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_VERIFIER_COOKIE = "google_oauth_verifier";
export const GOOGLE_INVITE_COOKIE = "google_oauth_invite";
/** 10 minutes: long enough for the Google consent screen, short enough to limit replay. */
export const GOOGLE_FLOW_COOKIE_MAX_AGE_SECONDS = 600;

export interface GoogleOidcConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Redirect URI resolution: explicit GOOGLE_REDIRECT_URI wins; otherwise
 * derived from MEMROOS_PUBLIC_BASE_URL (per-host: Cordant + oracle each set
 * their own base URL already).
 */
export function getGoogleOidcConfig(): GoogleOidcConfig | null {
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) return null;

  const explicit = (process.env.GOOGLE_REDIRECT_URI ?? "").trim();
  if (explicit) return { clientId, clientSecret, redirectUri: explicit };

  const base = (process.env.MEMROOS_PUBLIC_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return null;
  return { clientId, clientSecret, redirectUri: `${base}/api/auth/google/callback` };
}

export interface GoogleIdentityClaims {
  /** Google's stable subject id for the account. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  /** Google Workspace hosted domain, absent for consumer accounts. */
  hostedDomain: string | null;
}

/**
 * Google's signing keys, fetched once and cached by `jose` (it honours the
 * endpoint's Cache-Control and re-fetches on unknown `kid`). Module scope so
 * the cache survives between requests rather than refetching on every sign-in.
 */
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Google issues with either spelling; both are valid per its discovery doc. */
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/**
 * Verify a Google ID token and return its claims.
 *
 * The token reaches us over a TLS-authenticated back-channel call to Google's
 * token endpoint, which OIDC Core §3.1.3.7 accepts as sufficient on its own —
 * so this is defence in depth rather than a patched hole. It is still worth
 * doing: it is the difference between trusting the transport and checking the
 * assertion, and it pins `aud` to our own client id, so a token minted for a
 * different OAuth client can never be replayed into this console.
 *
 * Throws when verification fails; callers map that to a redirect.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string
): Promise<GoogleIdentityClaims> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: GOOGLE_ISSUERS,
    audience: clientId,
    // `jose` enforces exp and nbf by default; this bounds iat skew too.
    clockTolerance: 60,
  });

  return {
    sub: String(payload.sub ?? ""),
    email: String(payload.email ?? "").toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : "",
    hostedDomain: typeof payload.hd === "string" ? payload.hd.toLowerCase() : null,
  };
}

/**
 * Workspace domains permitted to sign in, from GOOGLE_ALLOWED_HOSTED_DOMAINS
 * (comma-separated). Empty means "no domain restriction" — the invite gate is
 * then the only control, which is the posture both hosts run today.
 */
export function allowedHostedDomains(): string[] {
  return (process.env.GOOGLE_ALLOWED_HOSTED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether this account's Workspace domain may sign in.
 *
 * An empty allowlist permits everything — that is the posture both hosts run
 * today, where the invite gate is the only control. Once an allowlist exists it
 * is absolute: a consumer account carries no `hd` claim at all, so a missing
 * domain fails closed rather than passing as "unrestricted".
 */
export function isHostedDomainAllowed(
  hostedDomain: string | null,
  allowed: string[] = allowedHostedDomains()
): boolean {
  if (allowed.length === 0) return true;
  return hostedDomain !== null && allowed.includes(hostedDomain);
}

export type GoogleSignInResult =
  | { status: "ok"; userId: string; role: UserRole }
  | {
      status:
        | "email_unverified"
        | "invite_required"
        | "invalid_token"
        | "token_used"
        | "token_expired"
        | "user_disabled";
    };

// Persistence for this flow lives in `lib/store/google-identity.ts` (STORE-01):
// account creation, invite consumption, role assignment and identity linking
// are one transaction there, and require a GovernanceContext. This module
// keeps the protocol/config half of Google OIDC and holds no SQL.

/**
 * A valid bcrypt hash of 32 random bytes nobody has ever seen: password login
 * for a Google-created account always fails, without any sentinel special-case
 * in the login route.
 */
export async function makeUnusablePasswordHash(): Promise<string> {
  return hashPassword(randomBytes(32).toString("hex"));
}
