/**
 * STORE-01 — persistence for Google-federated console identities.
 *
 * This module owns four tables on one code path: `user_identities`, `users`,
 * `user_roles`, and the `used_at` column of `team_invitations`. They are
 * deliberately not split into separate exported helpers. Creating an account
 * from an invite means consuming the invite, inserting the user, assigning the
 * role, and linking the Google subject — and a caller that could invoke those
 * four independently could half-create an account, burning the invite without
 * producing a user who can log in. One exported function, one transaction.
 *
 * The queries were previously inline in `lib/auth/google-oidc.ts`, which left
 * account creation as an unattributed write. They moved here unchanged in
 * behaviour; what is new is that the caller must now supply a
 * `GovernanceContext`, so the audit trail records who was admitted, under
 * which invite, and whether the attempt was allowed.
 */

import { createHash, randomBytes } from "crypto";
import type Database from "better-sqlite3";

import type { UserRole } from "@/lib/auth/types";
import type {
  GoogleIdentityClaims,
  GoogleSignInResult,
} from "@/lib/auth/google-oidc";
import {
  assertGovernance,
  recordGovernedWrite,
  type GovernanceContext,
} from "@/lib/store/governance";

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
       WHERE i.provider = 'google' AND i.subject = ?`,
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
 *
 * Governance records are written *inside* the transaction for the two
 * mutating branches, so an account that exists always has the audit row that
 * explains it — a rollback takes both or neither. Refusals mutate nothing and
 * are recorded after the transaction with `decision: "deny"`; dropping them
 * would leave a log that only ever describes successes.
 */
export function resolveGoogleSignIn(
  db: Database.Database,
  claims: GoogleIdentityClaims,
  inviteToken: string | null,
  unusablePasswordHash: string,
  gov: GovernanceContext,
): GoogleSignInResult {
  assertGovernance(gov);
  if (!claims.emailVerified) {
    recordGovernedWrite(db, {
      ...gov,
      action: "auth.google.sign_in_refused",
      decision: "deny",
      purpose: `${gov.purpose} — refused: email_unverified`,
    });
    return { status: "email_unverified" };
  }

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
        "INSERT INTO user_identities (provider, subject, user_id, created_at) VALUES ('google', ?, ?, ?)",
      ).run(claims.sub, byEmail.id, now);
      recordGovernedWrite(db, {
        ...gov,
        action: "auth.google.identity_linked",
        asset: `users/${byEmail.id}`,
      });
      return { status: "ok", userId: byEmail.id, role: roleForUser(db, byEmail.id) };
    }

    // New account. First user bootstrap mirrors password register: an empty
    // users table seeds the admin; everyone else needs a live invite.
    const userCount = (db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number }).cnt;
    let role: UserRole = "reviewer";
    let inviteHash: string | null = null;
    if (userCount === 0) {
      role = "admin";
    } else {
      if (!inviteToken) return { status: "invite_required" };
      const tokenHash = createHash("sha256").update(inviteToken).digest("hex");
      const invite = db
        .prepare(
          "SELECT role, email_hint, used_at, expires_at FROM team_invitations WHERE token_hash = ?",
        )
        .get(tokenHash) as InviteRow | undefined;
      if (!invite) return { status: "invalid_token" };
      if (invite.used_at) return { status: "token_used" };
      if (new Date(invite.expires_at) < new Date()) return { status: "token_expired" };
      role = invite.role;
      inviteHash = tokenHash;
      db.prepare("UPDATE team_invitations SET used_at = ? WHERE token_hash = ?").run(now, tokenHash);
    }

    const userId = randomBytes(10).toString("hex");
    db.prepare(
      "INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(userId, claims.email, claims.name || claims.email.split("@")[0], unusablePasswordHash, now);
    db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").run(userId, role);
    db.prepare(
      "INSERT INTO user_identities (provider, subject, user_id, created_at) VALUES ('google', ?, ?, ?)",
    ).run(claims.sub, userId, now);
    recordGovernedWrite(db, {
      ...gov,
      action: "auth.google.account_created",
      asset: `users/${userId}`,
      // The invite is identified by its hash, never its token: the raw token is
      // bearer-equivalent and must not be durable in the audit log.
      purpose:
        `${gov.purpose} — role=${role}, ` +
        (inviteHash ? `invite=${inviteHash.slice(0, 12)}…` : "first-user bootstrap"),
    });
    return { status: "ok", userId, role };
  });

  const result = txn();

  if (result.status !== "ok") {
    recordGovernedWrite(db, {
      ...gov,
      action: "auth.google.sign_in_refused",
      decision: "deny",
      purpose: `${gov.purpose} — refused: ${result.status}`,
    });
  }

  return result;
}
