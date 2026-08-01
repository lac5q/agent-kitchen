import { createHash, randomBytes } from "crypto";
import type Database from "better-sqlite3";
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

type InviteRow = {
  role: UserRole;
  email_hint: string | null;
  used_at: string | null;
  expires_at: string;
};

function findUserByIdentity(db: Database.Database, sub: string) {
  return db
    .prepare(
      `SELECT u.id, u.disabled_at FROM user_identities i
       JOIN users u ON u.id = i.user_id
       WHERE i.provider = 'google' AND i.subject = ?`
    )
    .get(sub) as { id: string; disabled_at: string | null } | undefined;
}

function roleForUser(db: Database.Database, userId: string): UserRole {
  const row = db.prepare("SELECT role FROM user_roles WHERE user_id = ? LIMIT 1").get(userId) as
    | { role: UserRole }
    | undefined;
  return row?.role ?? "reviewer";
}

/**
 * Resolve a verified Google identity to a local user session:
 *  1. Existing google identity link → login.
 *  2. Existing user with the same email → link identity, login (invite-gated
 *     consoles: the email owner already passed an invite to exist at all).
 *  3. New user + valid invite token → create user bound to the invite role,
 *     consume the invite (same transaction semantics as password register).
 *  4. New user without invite → invite_required.
 *
 * `unusablePasswordHash` is precomputed by the caller (bcrypt is async; the
 * better-sqlite3 transaction must stay synchronous).
 */
export function resolveGoogleSignIn(
  db: Database.Database,
  claims: GoogleIdentityClaims,
  inviteToken: string | null,
  unusablePasswordHash: string
): GoogleSignInResult {
  if (!claims.emailVerified) return { status: "email_unverified" };

  const now = new Date().toISOString();

  const txn = db.transaction((): GoogleSignInResult => {
    const linked = findUserByIdentity(db, claims.sub);
    if (linked) {
      if (linked.disabled_at) return { status: "user_disabled" };
      return { status: "ok", userId: linked.id, role: roleForUser(db, linked.id) };
    }

    const byEmail = db
      .prepare("SELECT id, disabled_at FROM users WHERE email = ?")
      .get(claims.email) as { id: string; disabled_at: string | null } | undefined;
    if (byEmail) {
      if (byEmail.disabled_at) return { status: "user_disabled" };
      db.prepare(
        "INSERT INTO user_identities (provider, subject, user_id, created_at) VALUES ('google', ?, ?, ?)"
      ).run(claims.sub, byEmail.id, now);
      return { status: "ok", userId: byEmail.id, role: roleForUser(db, byEmail.id) };
    }

    // New account. First user bootstrap mirrors password register: an empty
    // users table seeds the admin; everyone else needs a live invite.
    const userCount = (db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number }).cnt;
    let role: UserRole = "reviewer";
    if (userCount === 0) {
      role = "admin";
    } else {
      if (!inviteToken) return { status: "invite_required" };
      const tokenHash = createHash("sha256").update(inviteToken).digest("hex");
      const invite = db
        .prepare(
          "SELECT role, email_hint, used_at, expires_at FROM team_invitations WHERE token_hash = ?"
        )
        .get(tokenHash) as InviteRow | undefined;
      if (!invite) return { status: "invalid_token" };
      if (invite.used_at) return { status: "token_used" };
      if (new Date(invite.expires_at) < new Date()) return { status: "token_expired" };
      role = invite.role;
      db.prepare("UPDATE team_invitations SET used_at = ? WHERE token_hash = ?").run(now, tokenHash);
    }

    const userId = randomBytes(10).toString("hex");
    db.prepare(
      "INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(userId, claims.email, claims.name || claims.email.split("@")[0], unusablePasswordHash, now);
    db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").run(userId, role);
    db.prepare(
      "INSERT INTO user_identities (provider, subject, user_id, created_at) VALUES ('google', ?, ?, ?)"
    ).run(claims.sub, userId, now);
    return { status: "ok", userId, role };
  });

  return txn();
}

/**
 * A valid bcrypt hash of 32 random bytes nobody has ever seen: password login
 * for a Google-created account always fails, without any sentinel special-case
 * in the login route.
 */
export async function makeUnusablePasswordHash(): Promise<string> {
  return hashPassword(randomBytes(32).toString("hex"));
}
