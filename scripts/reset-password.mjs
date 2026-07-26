#!/usr/bin/env node
// scripts/reset-password.mjs — operator-driven password reset for memroos.
//
// The web flow at /api/auth/password-reset/confirm requires a token from
// /api/auth/password-reset (which emails a link). When the operator
// can't use that flow (no SMTP, off-host recovery, "I locked myself
// out" debugging), this CLI writes the password_hash directly to the
// SQLite database. Uses the same bcrypt cost factor as the app
// (apps/memroos/src/lib/auth/password.ts).
//
// Usage:
//   node scripts/reset-password.mjs
//   node scripts/reset-password.mjs --email luis@epiloguecapital.com
//   node scripts/reset-password.mjs --db /home/opc/memroos/data/conversations.db
//
// Interactive mode (no flags): prompts for email, then prompts for the
// new password (twice, with confirmation).
//
// The password input is read from /dev/tty so the script is safe to
// invoke from a pipe (echo pw | script would NOT leak the password in
// the process list, but reading from /dev/tty keeps the password off
// the parent's stdin/stdout as well).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import url from "node:url";

import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 8;
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = { db: null, email: null, generate: false, create: false, role: "admin", force: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--db") args.db = argv[++i];
    else if (a === "--email") args.email = argv[++i];
    else if (a === "--generate") args.generate = true;
    else if (a === "--create") args.create = true;
    else if (a === "--force") args.force = true;
    else if (a === "--role") args.role = argv[++i];
    else if (a === "-h" || a === "--help") {
      console.error(`Usage: node scripts/reset-password.mjs [options]

  --email <addr>      email of the user to reset or create (prompts if not given)
  --db <path>         path to conversations.db (auto-detected if not given)
  --generate          generate a random password instead of prompting
  --create            create a new user (default mode is reset-existing)
  --role <role>       role for --create (default: admin)

Default mode resets an existing user's password. With --create, inserts a
new row into users (id, email, display_name, password_hash, created_at,
tenant_id='default-tenant') and a corresponding user_roles row with the
requested role. Fails closed on email collision (the user already
exists) unless --force is also set, in which case the existing row is
updated and the password is reset (--create --force = upsert).`);
      process.exit(0);
    } else {
      console.error(`unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function defaultDbPath() {
  // Match the same resolution order as the app's runtime db.
  const envPath = process.env.SQLITE_DB_PATH;
  if (envPath) return envPath;
  // Most common operator layout.
  const candidates = [
    path.join(REPO_ROOT, "data", "conversations.db"),
    path.join(REPO_ROOT, "apps/memroos", "data", "conversations.db"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function prompt(question, { silent = false } = {}) {
  // Read from /dev/tty when available so the password is not echoed
  // and is not visible in the parent's stdin/stdout. Fall back to
  // stdin for non-interactive environments.
  const input = process.stdin.isTTY
    ? process.stdin
    : (fs.existsSync("/dev/tty") ? fs.createReadStream("/dev/tty") : process.stdin);
  const output = silent && process.stdout.isTTY ? null : process.stderr;
  const rl = readline.createInterface({ input, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function promptSecret(question) {
  return prompt(question, { silent: true });
}

function generatePassword() {
  // 18 random bytes (24 base64 chars) is comfortably above the 8-char
  // minimum. Strip the base64 padding and ambiguous chars so the
  // password is copy-pasteable.
  return crypto.randomBytes(18).toString("base64").replace(/[+/=]/g, "").slice(0, 24);
}

function findUser(db, email) {
  // role lives in user_roles, not on users. LEFT JOIN so a user with
  // no role row (anomalous) still surfaces with role=null.
  return db
    .prepare(
      `SELECT u.id, u.email, u.display_name, ur.role,
              length(u.password_hash) AS hash_len
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.email = ?`
    )
    .get(email);
}

function logEvent(db, userId, eventType, metadata) {
  // Mirror the auth_events table the app uses. The schema is
  // intentionally minimal so this CLI doesn't have to import the
  // app's auth_events helper.
  const id = crypto.randomBytes(8).toString("hex");
  const json = JSON.stringify(metadata);
  db.prepare(
    `INSERT INTO auth_events (id, user_id, event_type, metadata_json) VALUES (?, ?, ?, ?)`
  ).run(id, userId, eventType, json);
}

async function main() {
  const args = parseArgs(process.argv);
  const dbPath = args.db || defaultDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error(`db not found: ${dbPath}`);
    console.error("  pass --db /path/to/conversations.db explicitly, or set SQLITE_DB_PATH.");
    process.exit(1);
  }
  // Confirm we're about to mutate state. The CLI logs to stderr so
  // stdout stays free for machine-readable output (a future shell-out
  // hook could pipe this).
  console.error(`opening db: ${dbPath}`);
  const db = new Database(dbPath);
  try {
    // 1. Resolve the target user. Interactive prompt if --email not given.
    let email = args.email;
    if (!email) {
      email = (await prompt("email of the user to reset: ")).trim().toLowerCase();
    } else {
      email = email.trim().toLowerCase();
    }
    if (!email) {
      console.error("email is required");
      process.exit(2);
    }
    const user = findUser(db, email);
    if (!user) {
      if (args.create) {
        // OK; we'll create below.
      } else {
        console.error(`no user found with email ${email}`);
        const counts = db.prepare("SELECT COUNT(*) AS n FROM users").get();
        console.error(`(users table currently has ${counts.n} row(s))`);
        console.error("  pass --create to insert this user, or check the email.");
        process.exit(1);
      }
    } else if (user && args.create && !args.force) {
      console.error(`user ${email} already exists (id=${user.id}, role=${user.role ?? ""})`);
      console.error("  pass --force to upsert (overwrites password_hash and role).");
      process.exit(1);
    }
    if (user) {
      console.error(`found user: id=${user.id} email=${user.email} display_name=${user.display_name ?? ""} role=${user.role ?? ""} hash_len=${user.hash_len}`);
    } else {
      console.error(`will create new user: email=${email} role=${args.role}`);
    }

    // 2. Resolve the new password. Interactive unless --generate.
    let password;
    if (args.generate) {
      password = generatePassword();
      console.error(`generated random password (${password.length} chars)`);
    } else {
      const first = await promptSecret("new password (>=8 chars, input hidden): ");
      const second = await promptSecret("confirm new password:                       ");
      if (first !== second) {
        console.error("passwords do not match");
        process.exit(1);
      }
      if (first.length < MIN_PASSWORD_LENGTH) {
        console.error(`password too short (${first.length} < ${MIN_PASSWORD_LENGTH})`);
        process.exit(1);
      }
      password = first;
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      console.error("password failed validation");
      process.exit(1);
    }

    // 3. Hash with the same cost factor the app uses (bcrypt cost 12).
    const passwordHash = bcrypt.hashSync(password, BCRYPT_COST);

    // 4. Write the new hash + revoke outstanding refresh tokens (so any
    // existing session cookies for this user stop working immediately)
    // + record an auth_event for the audit trail. The app's own
    // /api/auth/password-reset/confirm route does the same; we mirror
    // it here for the operator-driven path.
    const now = new Date().toISOString();
    const userId = user ? user.id : crypto.randomBytes(10).toString("hex");
    const displayName = email.split("@")[0];
    db.transaction(() => {
      if (user && args.create && args.force) {
        // Upsert: --create --force on an existing email rewrites the
        // password and bumps the role. role lives in user_roles, NOT
        // on users — UPDATE the password on users then refresh the
        // user_roles row.
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
          passwordHash,
          user.id,
        );
        db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(user.id);
        db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").run(
          user.id,
          args.role,
        );
      } else if (user) {
        // Plain reset.
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
          passwordHash,
          user.id,
        );
      } else {
        // New user.
        db.prepare(
          "INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(userId, email, displayName, passwordHash, now);
        db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").run(
          userId,
          args.role,
        );
      }
      // Revoke outstanding refresh tokens so any existing session
      // cookies for this user stop working immediately. For new users
      // this is a no-op.
      db.prepare(
        "UPDATE user_refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL"
      ).run(now, userId);
      const eventType = user
        ? (args.create ? "password_reset_operator_cli" : "password_reset_operator_cli")
        : "password_create_operator_cli";
      logEvent(db, userId, eventType, {
        source: "scripts/reset-password.mjs",
        operator: process.env.USER || "unknown",
        role: user ? args.role : undefined,
      });
    })();

    if (user && args.create && args.force) {
      console.error(`✓ password + role updated for ${email}`);
    } else if (user) {
      console.error(`✓ password updated for ${email}`);
    } else {
      console.error(`✓ user created: ${email} (role=${args.role})`);
    }

    if (args.generate) {
      // Emit the generated password on stdout so the operator can
      // copy-paste it. The password is the only secret the script
      // produces, so a single line on stdout is the right channel.
      console.log(password);
    } else {
      console.error("  (no echo: password was entered interactively)");
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(`reset-password: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
