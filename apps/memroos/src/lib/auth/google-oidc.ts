import { randomBytes } from "crypto";
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
