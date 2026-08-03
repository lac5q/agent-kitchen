// @vitest-environment node
import { createHash } from "crypto";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveGoogleSignIn } from "@/lib/store/google-identity";
import type { GoogleIdentityClaims } from "@/lib/auth/google-oidc";
import type { GovernanceContext } from "@/lib/store/governance";

/** Minimal valid context — these tests assert persistence, not audit shape. */
const GOV: GovernanceContext = {
  actor: "google:test-subject",
  action: "auth.google.sign_in",
  asset: "users/email/test@example.com",
  purpose: "unit test",
  label: { visibility: "private", policy: "sealed" },
  decision: "allow",
};

const UNUSABLE_HASH = "$2a$12$unusablehashforgoogleaccounts0000000000000000000000000";

function makeDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_login_at TEXT,
      disabled_at TEXT
    );
    CREATE TABLE user_roles (
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      PRIMARY KEY (user_id, role)
    );
    CREATE TABLE user_identities (
      provider TEXT NOT NULL,
      subject TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (provider, subject)
    );
    CREATE TABLE team_invitations (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      invited_by TEXT NOT NULL,
      email_hint TEXT,
      used_at TEXT,
      expires_at TEXT NOT NULL
    );
  `);
  return db;
}

function claims(overrides: Partial<GoogleIdentityClaims> = {}): GoogleIdentityClaims {
  return {
    sub: "google-sub-1",
    email: "person@example.com",
    emailVerified: true,
    name: "Person Example",
    ...overrides,
  };
}

function insertInvite(db: Database.Database, token: string, role = "operator", expiresInMs = 3600_000) {
  db.prepare(
    "INSERT INTO team_invitations (id, token_hash, role, invited_by, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).run(
    `inv-${token}`,
    createHash("sha256").update(token).digest("hex"),
    role,
    "admin-1",
    new Date(Date.now() + expiresInMs).toISOString()
  );
}

function insertUser(db: Database.Database, id: string, email: string, role = "reviewer") {
  db.prepare(
    "INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, email, email, "hash", new Date().toISOString());
  db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").run(id, role);
}

describe("resolveGoogleSignIn", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = makeDb();
  });

  it("rejects unverified Google emails", () => {
    const result = resolveGoogleSignIn(db, claims({ emailVerified: false }), null, UNUSABLE_HASH, GOV);
    expect(result.status).toBe("email_unverified");
  });

  /**
   * Google sign-in used to mirror password register's first-user bootstrap and
   * mint an admin when the users table was empty. On a public HTTPS host that
   * is a race for the entire instance — anyone with a Google account could win
   * it. Password register can afford that bootstrap because it also needs the
   * seeded env credentials; Google sign-in needs nothing.
   */
  it("never bootstraps an admin from an empty users table", () => {
    const result = resolveGoogleSignIn(db, claims(), null, UNUSABLE_HASH, GOV);
    expect(result.status).toBe("invite_required");

    const identity = db
      .prepare("SELECT user_id FROM user_identities WHERE provider='google' AND subject=?")
      .get("google-sub-1");
    expect(identity).toBeFalsy();
    const users = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
    expect(users.n).toBe(0);
  });

  it("requires an invite for new users once users exist", () => {
    insertUser(db, "admin-1", "admin@example.com", "admin");
    const result = resolveGoogleSignIn(db, claims(), null, UNUSABLE_HASH, GOV);
    expect(result.status).toBe("invite_required");
  });

  it("creates a user with the invite role and consumes the invite", () => {
    insertUser(db, "admin-1", "admin@example.com", "admin");
    insertInvite(db, "tok-1", "operator");

    const result = resolveGoogleSignIn(db, claims(), "tok-1", UNUSABLE_HASH, GOV);
    expect(result).toMatchObject({ status: "ok", role: "operator" });

    const invite = db.prepare("SELECT used_at FROM team_invitations WHERE id='inv-tok-1'").get() as {
      used_at: string | null;
    };
    expect(invite.used_at).toBeTruthy();

    const user = db
      .prepare("SELECT email, password_hash FROM users WHERE email=?")
      .get("person@example.com") as { email: string; password_hash: string };
    expect(user.password_hash).toBe(UNUSABLE_HASH, GOV);
  });

  it("rejects used and expired invites", () => {
    insertUser(db, "admin-1", "admin@example.com", "admin");
    insertInvite(db, "tok-used");
    db.prepare("UPDATE team_invitations SET used_at=? WHERE id='inv-tok-used'").run(new Date().toISOString());
    insertInvite(db, "tok-expired", "operator", -1000);

    expect(resolveGoogleSignIn(db, claims(), "tok-used", UNUSABLE_HASH, GOV).status).toBe("token_used");
    expect(resolveGoogleSignIn(db, claims(), "tok-expired", UNUSABLE_HASH, GOV).status).toBe("token_expired");
    expect(resolveGoogleSignIn(db, claims(), "tok-nope", UNUSABLE_HASH, GOV).status).toBe("invalid_token");
  });

  it("links a Google identity onto an existing email account and logs in", () => {
    insertUser(db, "user-2", "person@example.com", "operator");
    const result = resolveGoogleSignIn(db, claims(), null, UNUSABLE_HASH, GOV);
    expect(result).toMatchObject({ status: "ok", userId: "user-2", role: "operator" });
    const identity = db
      .prepare("SELECT user_id FROM user_identities WHERE provider='google' AND subject=?")
      .get("google-sub-1") as { user_id: string };
    expect(identity.user_id).toBe("user-2");
  });

  it("logs in via an existing identity link without touching invites", () => {
    insertUser(db, "user-3", "person@example.com", "reviewer");
    db.prepare(
      "INSERT INTO user_identities (provider, subject, user_id, created_at) VALUES ('google', ?, ?, ?)"
    ).run("google-sub-1", "user-3", new Date().toISOString());

    const result = resolveGoogleSignIn(db, claims(), null, UNUSABLE_HASH, GOV);
    expect(result).toMatchObject({ status: "ok", userId: "user-3", role: "reviewer" });
  });

  it("blocks disabled users on both identity and email paths", () => {
    insertUser(db, "user-4", "person@example.com", "operator");
    db.prepare("UPDATE users SET disabled_at=? WHERE id='user-4'").run(new Date().toISOString());
    expect(resolveGoogleSignIn(db, claims(), null, UNUSABLE_HASH, GOV).status).toBe("user_disabled");
  });
});
